require('dotenv').config();

const os = require('os');
const logger = require('./src/utils/logger');
const app = require('./src/app');
const config = require('./src/config');
const mqttConfig = require('./src/config/mqtt');
const aedesConfig = require('./src/config/aedes');
const db = require('./src/config/db');
const { handleMqttMessage } = require('./src/services/mqtt.handler');
const initDatabase = require('./src/utils/initDb');
const { initNonceStore, destroyNonceStore } = require('./src/utils/crypto');
const seedAdmin = require('./src/utils/seedAdmin');
const seedDevices = require('./src/utils/seedDevices');
const RefreshTokenModel = require('./src/models/refreshToken.model');

let httpServer = null;
let shuttingDown = false;

const SHUTDOWN_TIMEOUT_MS = 10000;

process.on('unhandledRejection', (reason, promise) => {
    logger.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
    if (!shuttingDown) {
        gracefulShutdown('UNHANDLED_REJECTION');
    }
});

process.on('uncaughtException', (err) => {
    logger.error('[Server] Uncaught Exception:', err.message);
    if (!shuttingDown) {
        gracefulShutdown('UNCAUGHT_EXCEPTION');
    }
});

const gracefulShutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info(`\n[Server] Received ${signal}. Shutting down gracefully...`);

    const forceExit = setTimeout(() => {
        logger.error('[Server] Graceful shutdown timed out. Forcing exit.');
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
        const closeHttp = () => new Promise((resolve) => {
            if (httpServer) {
                httpServer.close(() => {
                    logger.info('[Server] HTTP server closed.');
                    resolve();
                });
            } else {
                resolve();
            }
        });

        await closeHttp();
        await mqttConfig.disconnect();
        await aedesConfig.stop();
        await destroyNonceStore();
        await db.closePool();

        logger.info('[Server] All connections closed. Goodbye.');
        process.exit(0);
    } catch (err) {
        logger.error('[Server] Error during shutdown:', err.message);
        process.exit(1);
    }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

const startServer = async () => {
    try {
        await initDatabase();
        await seedAdmin();
        await seedDevices();
        await initNonceStore();
        await aedesConfig.start();
        mqttConfig.connect(handleMqttMessage);

        httpServer = app.listen(config.port, () => {
            const nets = os.networkInterfaces();
            let serverIp = 'localhost';
            for (const name of Object.keys(nets)) {
                for (const net of nets[name]) {
                    if (net.family === 'IPv4' && !net.internal) {
                        serverIp = net.address;
                    }
                }
            }

            logger.info(`\n[Server] Web server is running at http://${serverIp}:${config.port}`);
            logger.info(`[Server] Environment: ${config.nodeEnv}`);
            logger.info('==========================================\n');
        });

        setInterval(() => {
            RefreshTokenModel.cleanupExpired().catch((err) => {
                logger.error('[Server] Refresh token cleanup error:', err.message);
            });
        }, 60 * 60 * 1000).unref();
    } catch (err) {
        logger.error('[Server] Failed to start server:', err.message);
        process.exit(1);
    }
};

startServer();
