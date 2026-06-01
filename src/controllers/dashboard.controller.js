const DashboardModel = require('../models/dashboard.model');
const logger = require('../utils/logger');
const SSE_Broadcast = require('../services/sse.broadcast');

const SSE_POLL_INTERVAL = 5000;
const SSE_RETRY_MS = 3000;
const SSE_SOCKET_TIMEOUT_MS = 60000;
const SSE_HEARTBEAT_INTERVAL = 15000;

const DashboardController = {
    getChart: async (req, res, next) => {
        try {
            const { start_date, end_date } = req.query;
            const data = await DashboardModel.getChartData(start_date, end_date);
            res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    },

    streamChart: async (req, res) => {
        const { start_date, end_date } = req.query;

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        res.socket.setNoDelay(true);
        res.socket.setTimeout(SSE_SOCKET_TIMEOUT_MS);
        res.socket.setKeepAlive(true, 30000);

        let lastData = null;
        let isClosed = false;

        logger.info(`[SSE] Client connected: ${req.ip} | params: start_date=${start_date || 'none'}, end_date=${end_date || 'none'}`);

        const safeWrite = (data) => {
            if (isClosed) return;
            const ok = res.write(data);
            if (!ok) {
                res.once('drain', () => {});
            }
        };

        const sendData = async () => {
            try {
                const data = await DashboardModel.getChartData(start_date, end_date);
                const dataStr = JSON.stringify(data);

                if (lastData !== dataStr) {
                    lastData = dataStr;
                    safeWrite(`retry: ${SSE_RETRY_MS}\nevent: chart\ndata: ${dataStr}\n\n`);
                }

                safeWrite(`event: heartbeat\ndata: {}\n\n`);
            } catch (err) {
                if (!isClosed) {
                    safeWrite(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
                }
            }
        };

        await sendData();

        const interval = setInterval(sendData, SSE_POLL_INTERVAL);

        const cleanup = () => {
            if (isClosed) return;
            isClosed = true;
            clearInterval(interval);
            logger.info(`[SSE] Client disconnected: ${req.ip}`);
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
