
const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const studentRoutes = require('./student.routes');
const attendanceRoutes = require('./attendance.routes');
const unknownCardRoutes = require('./unknownCard.routes');

// Gắn các route vào prefix
router.use('/auth', authRoutes);
router.use('/students', studentRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/unknown-cards', unknownCardRoutes);

// Route health check
router.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Server Điểm Danh IoT đang chạy ngon lành! 🚀',
        timestamp: new Date().toISOString(),
    });
});

module.exports = router;
