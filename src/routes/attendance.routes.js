/**
 * ==========================================
 * ROUTES: ATTENDANCE
 * ==========================================
 */

const express = require('express');
const router = express.Router();
const AttendanceController = require('../controllers/attendance.controller');
const authMiddleware = require('../middlewares/auth.middleware');

router.get('/', authMiddleware, AttendanceController.getByDate);
router.get('/stats', authMiddleware, AttendanceController.getStats);
router.get('/student/:id', authMiddleware, AttendanceController.getByStudent);

module.exports = router;
