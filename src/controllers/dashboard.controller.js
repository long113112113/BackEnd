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

const validateDateRange = (startDate, endDate, maxDays = MAX_DATE_RANGE_DAYS) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    if (diffDays > maxDays) {
        return { valid: false, message: `Date range must not exceed ${maxDays} days` };
    }
    if (start > end) {
        return { valid: false, message: 'start_date must be before or equal to end_date' };
    }
    return { valid: true };
};

const activePollers = new Map();
const lastDataCache = new Map();

const getChannelKey = (startDate, endDate) => {
    return `${DASHBOARD_CHANNEL_PREFIX}${startDate || 'all'}:${endDate || 'all'}`;
};

const evictOldestPoller = () => {
    const oldestKey = activePollers.keys().next().value;
    if (oldestKey) {
        const interval = activePollers.get(oldestKey);
        clearInterval(interval);
        activePollers.delete(oldestKey);
        lastDataCache.delete(oldestKey);
        logger.info(`[SSE] Evicted oldest poller for ${oldestKey}`);
    }
};

const startPoller = (channelKey, startDate, endDate) => {
    if (activePollers.has(channelKey)) {
        activePollers.delete(channelKey);
        activePollers.set(channelKey, activePollers.get(channelKey));
        return;
    }

    if (activePollers.size >= MAX_POLLERS) {
        evictOldestPoller();
    }

    const poll = async () => {
        const clientCount = SSE_Broadcast.getClientCount(channelKey);
        if (clientCount === 0) {
            clearInterval(interval);
            activePollers.delete(channelKey);
            lastDataCache.delete(channelKey);
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
    activePollers.set(channelKey, interval);
    logger.info(`[SSE] Poller started for ${channelKey}`);
};

const DashboardController = {
    getChart: async (req, res, next) => {
        try {
            const { start_date, end_date } = req.query;

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
        const { start_date, end_date } = req.query;

        if (start_date && end_date) {
            const rangeCheck = validateDateRange(start_date, end_date);
            if (!rangeCheck.valid) {
                return res.status(400).json({ success: false, message: rangeCheck.message });
            }
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        res.socket.setNoDelay(true);
        res.socket.setTimeout(SSE_SOCKET_TIMEOUT_MS);
        res.socket.setKeepAlive(true, 30000);

        const channelKey = getChannelKey(start_date, end_date);

        logger.info(`[SSE] Client connected: ${req.ip} | channel: ${channelKey}`);

        SSE_Broadcast.addClient(res, channelKey);
        res.write(`retry: ${SSE_RETRY_MS}\n\n`);

        startPoller(channelKey, start_date, end_date);

        const cleanup = () => {
            SSE_Broadcast.removeClient(res, channelKey);
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
