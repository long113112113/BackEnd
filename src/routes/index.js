
const express = require('express');
const router = express.Router();
const { notFoundHandler } = require('../middlewares/error.middleware');

const authRoutes = require('./auth.routes');
const studentRoutes = require('./student.routes');
const attendanceRoutes = require('./attendance.routes');
const unknownCardRoutes = require('./unknownCard.routes');
const deviceKeyRoutes = require('./deviceKey.routes');

router.use('/auth', authRoutes);
router.use('/students', studentRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/unknown-cards', unknownCardRoutes);
router.use('/device-keys', deviceKeyRoutes);

router.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Server is active.',
        timestamp: new Date().toISOString(),
    });
});

router.use(notFoundHandler);

module.exports = router;
