
const express = require('express');
const router = express.Router();
const { notFoundHandler } = require('../middlewares/error.middleware');
const db = require('../config/db');
const mqttConfig = require('../config/mqtt');
const { getClient: getRedisClient } = require('../config/redis');

const authRoutes = require('./auth.routes');
const studentRoutes = require('./student.routes');
const attendanceRoutes = require('./attendance.routes');
const unknownCardRoutes = require('./unknownCard.routes');
const deviceKeyRoutes = require('./deviceKey.routes');
const dashboardRoutes = require('./dashboard.routes');

router.use('/auth', authRoutes);
router.use('/students', studentRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/unknown-cards', unknownCardRoutes);
router.use('/device-keys', deviceKeyRoutes);
router.use('/dashboard', dashboardRoutes);

router.get('/health', async (req, res) => {
    const checks = {
        database: 'unknown',
        mqtt: 'unknown',
        redis: 'unknown',
    };

    try {
        const dbOk = await db.testConnection();
        checks.database = dbOk ? 'healthy' : 'unhealthy';
    } catch {
        checks.database = 'unhealthy';
    }

    const mqttClient = mqttConfig.getClient();
    checks.mqtt = mqttClient && mqttClient.connected ? 'healthy' : 'unhealthy';

    const redisClient = getRedisClient();
    if (redisClient) {
        try {
            await redisClient.ping();
            checks.redis = 'healthy';
        } catch {
            checks.redis = 'unhealthy';
        }
    } else {
        checks.redis = 'not_configured';
    }

    const allHealthy = checks.database === 'healthy' && checks.mqtt === 'healthy';
    const status = allHealthy ? 'healthy' : 'degraded';

    res.status(allHealthy ? 200 : 503).json({
        success: true,
        status,
        checks,
        timestamp: new Date().toISOString(),
    });
});

router.use(notFoundHandler);

module.exports = router;
