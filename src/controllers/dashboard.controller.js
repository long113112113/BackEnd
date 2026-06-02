const DashboardModel = require('../models/dashboard.model');
const logger = require('../utils/logger');
const SSE_Broadcast = require('../services/sse.broadcast');

const SSE_POLL_INTERVAL = 5000;
const SSE_RETRY_MS = 3000;
const SSE_SOCKET_TIMEOUT_MS = 60000;
const SSE_HEARTBEAT_INTERVAL = 15000;
const MAX_DATE_RANGE_DAYS = 90;
const DASHBOARD_CHANNEL_PREFIX = 'dashboard-chart:';
const MAX_POLLERS = 10;
const MAX_CHANNELS_PER_USER = 2;
const MAX_CONNECTIONS_PER_USER_PER_CHANNEL = 3;

const validateDateRange = (startDate, endDate, maxDays = MAX_DATE_RANGE_DAYS) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return { valid: false, message: 'Invalid date format' };
    }
    const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    if (diffDays > maxDays) {
        return { valid: false, message: `Date range must not exceed ${maxDays} days` };
    }
    if (start > end) {
        return { valid: false, message: 'start_date must be before or equal to end_date' };
    }
    return { valid: true };
};

const validateSingleDate = (dateStr) => {
    if (dateStr === undefined || dateStr === null || dateStr === '') {
        return { valid: true };
    }
    if (typeof dateStr !== 'string') {
        return { valid: false, message: 'Invalid date format' };
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
        return { valid: false, message: 'Invalid date format' };
    }
    return { valid: true };
};

const activePollers = new Map();
const lastDataCache = new Map();
const channelClientCounts = new Map();
const channelUserConnections = new Map();
const userChannels = new Map();
const userChannelConnCounts = new Map();

const getChannelKey = (startDate, endDate) => {
    return `${DASHBOARD_CHANNEL_PREFIX}${startDate || 'all'}:${endDate || 'all'}`;
};

const evictLeastUsedPoller = () => {
    let target = null;
    let minClients = Infinity;
    for (const [key, count] of channelClientCounts) {
        if (count > 0 && count < minClients) {
            minClients = count;
            target = key;
        }
    }
    if (!target) return;

    const interval = activePollers.get(target);
    clearInterval(interval);
    activePollers.delete(target);
    lastDataCache.delete(target);
    channelClientCounts.delete(target);
    const userSet = channelUserConnections.get(target);
    if (userSet) {
        for (const userId of userSet) {
            const channels = userChannels.get(userId);
            if (channels) {
                channels.delete(target);
                if (channels.size === 0) userChannels.delete(userId);
            }
        }
        channelUserConnections.delete(target);
    }
    SSE_Broadcast.disconnectChannel(target, 'poller_evicted');
    logger.info(`[SSE] Evicted least-used poller for ${target} (${minClients} clients)`);
};

const evictUserChannel = (channelKey, userId) => {
    const interval = activePollers.get(channelKey);
    if (interval) {
        clearInterval(interval);
        activePollers.delete(channelKey);
        lastDataCache.delete(channelKey);
    }
    channelClientCounts.delete(channelKey);
    const userSet = channelUserConnections.get(channelKey);
    if (userSet) {
        userSet.delete(userId);
        if (userSet.size === 0) channelUserConnections.delete(channelKey);
    }
    const channels = userChannels.get(userId);
    if (channels) {
        channels.delete(channelKey);
        if (channels.size === 0) userChannels.delete(userId);
    }
    SSE_Broadcast.disconnectChannel(channelKey, 'user_channel_limit');
    logger.info(`[SSE] Evicted user channel ${channelKey} for user ${userId} (channel limit)`);
};

const startPoller = (channelKey, userId, startDate, endDate) => {
    if (activePollers.has(channelKey)) {
        activePollers.delete(channelKey);
        activePollers.set(channelKey, activePollers.get(channelKey));
        return;
    }

    const userExisting = userChannels.get(userId) || new Set();
    if (userExisting.size >= MAX_CHANNELS_PER_USER) {
        const oldestUserChannel = userExisting.values().next().value;
        if (oldestUserChannel && oldestUserChannel !== channelKey) {
            evictUserChannel(oldestUserChannel, userId);
        }
    }

    if (activePollers.size >= MAX_POLLERS) {
        evictLeastUsedPoller();
    }

    const poll = async () => {
        const clientCount = SSE_Broadcast.getClientCount(channelKey);
        if (clientCount === 0) {
            clearInterval(interval);
            activePollers.delete(channelKey);
            lastDataCache.delete(channelKey);
            channelClientCounts.delete(channelKey);
            const userSet = channelUserConnections.get(channelKey);
            if (userSet) {
                for (const u of userSet) {
                    const ch = userChannels.get(u);
                    if (ch) {
                        ch.delete(channelKey);
                        if (ch.size === 0) userChannels.delete(u);
                    }
                }
                channelUserConnections.delete(channelKey);
            }
            logger.info(`[SSE] Poller stopped for ${channelKey} (no clients)`);
            return;
        }

        try {
            const data = await DashboardModel.getChartData(startDate, endDate);
            const dataStr = JSON.stringify(data);
            const lastData = lastDataCache.get(channelKey);

            if (lastData !== dataStr) {
                lastDataCache.set(channelKey, dataStr);
                SSE_Broadcast.broadcast(channelKey, 'chart', data);
            }

            SSE_Broadcast.broadcast(channelKey, 'heartbeat', {});
        } catch (err) {
            const message = process.env.NODE_ENV === 'production'
                ? 'Internal server error'
                : err.message;
            SSE_Broadcast.broadcast(channelKey, 'error', { message });
        }
    };

    poll();
    const interval = setInterval(poll, SSE_POLL_INTERVAL);
    interval.unref();
    activePollers.set(channelKey, interval);

    if (!userChannels.has(userId)) userChannels.set(userId, new Set());
    userChannels.get(userId).add(channelKey);
    if (!channelUserConnections.has(channelKey)) channelUserConnections.set(channelKey, new Set());
    channelUserConnections.get(channelKey).add(userId);

    logger.info(`[SSE] Poller started for ${channelKey}`);
};

const DashboardController = {
    getChart: async (req, res, next) => {
        try {
            const start_date = typeof req.query.start_date === 'string' ? req.query.start_date : undefined;
            const end_date = typeof req.query.end_date === 'string' ? req.query.end_date : undefined;

            const startCheck = validateSingleDate(start_date);
            if (!startCheck.valid) {
                return res.status(400).json({ success: false, message: startCheck.message });
            }
            const endCheck = validateSingleDate(end_date);
            if (!endCheck.valid) {
                return res.status(400).json({ success: false, message: endCheck.message });
            }
            if (start_date && end_date) {
                const rangeCheck = validateDateRange(start_date, end_date);
                if (!rangeCheck.valid) {
                    return res.status(400).json({ success: false, message: rangeCheck.message });
                }
            }

            const data = await DashboardModel.getChartData(start_date, end_date);
            res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    },

    streamChart: async (req, res) => {
        const start_date = typeof req.query.start_date === 'string' ? req.query.start_date : undefined;
        const end_date = typeof req.query.end_date === 'string' ? req.query.end_date : undefined;
        const userId = req.user.id;

        const startCheck = validateSingleDate(start_date);
        if (!startCheck.valid) {
            return res.status(400).json({ success: false, message: startCheck.message });
        }
        const endCheck = validateSingleDate(end_date);
        if (!endCheck.valid) {
            return res.status(400).json({ success: false, message: endCheck.message });
        }
        if (start_date && end_date) {
            const rangeCheck = validateDateRange(start_date, end_date);
            if (!rangeCheck.valid) {
                return res.status(400).json({ success: false, message: rangeCheck.message });
            }
        }

        const channelKey = getChannelKey(start_date, end_date);
        const userChannelKey = `${userId}:${channelKey}`;
        const currentUserConnCount = userChannelConnCounts.get(userChannelKey) || 0;

        if (currentUserConnCount >= MAX_CONNECTIONS_PER_USER_PER_CHANNEL) {
            return res.status(429).json({
                success: false,
                message: `Too many connections to this chart (max ${MAX_CONNECTIONS_PER_USER_PER_CHANNEL})`,
            });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        res.socket.setNoDelay(true);
        res.socket.setTimeout(SSE_SOCKET_TIMEOUT_MS);
        res.socket.setKeepAlive(true, 30000);

        logger.info(`[SSE] Client connected: ${req.ip} | channel: ${channelKey}`);

        SSE_Broadcast.addClient(res, channelKey);
        userChannelConnCounts.set(userChannelKey, currentUserConnCount + 1);
        const currentCount = channelClientCounts.get(channelKey) || 0;
        channelClientCounts.set(channelKey, currentCount + 1);
        res.write(`retry: ${SSE_RETRY_MS}\n\n`);

        startPoller(channelKey, userId, start_date, end_date);

        const cleanup = () => {
            SSE_Broadcast.removeClient(res, channelKey);
            const connCount = userChannelConnCounts.get(userChannelKey);
            if (connCount !== undefined) {
                const newConnCount = connCount - 1;
                if (newConnCount <= 0) {
                    userChannelConnCounts.delete(userChannelKey);
                } else {
                    userChannelConnCounts.set(userChannelKey, newConnCount);
                }
            }
            const count = channelClientCounts.get(channelKey);
            if (count !== undefined) {
                const newCount = count - 1;
                if (newCount <= 0) {
                    channelClientCounts.delete(channelKey);
                } else {
                    channelClientCounts.set(channelKey, newCount);
                }
            }
            logger.info(`[SSE] Client disconnected: ${req.ip} | channel: ${channelKey}`);
        };

        req.on('close', cleanup);
        res.socket.on('timeout', cleanup);
    },

    streamUnknownCards: (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        res.socket.setNoDelay(true);
        res.socket.setTimeout(SSE_SOCKET_TIMEOUT_MS);
        res.socket.setKeepAlive(true, 30000);

        logger.info(`[SSE UnknownCards] Client connected: ${req.ip}`);

        SSE_Broadcast.addClient(res, 'unknown-cards');
        res.write(`retry: ${SSE_RETRY_MS}\n\n`);

        const heartbeat = setInterval(() => {
            if (res.writableEnded || res.writableFinished) {
                clearInterval(heartbeat);
                return;
            }
            res.write(`:heartbeat\n\n`);
        }, SSE_HEARTBEAT_INTERVAL);
        heartbeat.unref();

        const cleanup = () => {
            SSE_Broadcast.removeClient(res, 'unknown-cards');
            clearInterval(heartbeat);
            logger.info(`[SSE UnknownCards] Client disconnected: ${req.ip}`);
        };

        req.on('close', cleanup);
        res.socket.on('timeout', cleanup);
    },
};

module.exports = DashboardController;
