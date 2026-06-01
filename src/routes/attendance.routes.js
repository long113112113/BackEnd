const express = require('express');
const router = express.Router();
const AttendanceController = require('../controllers/attendance.controller');
const { authMiddleware, requireManagerOrAdmin } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { getByDate, getByStudent, exportAttendance } = require('../validations/attendance.validation');

router.get('/', authMiddleware, requireManagerOrAdmin, validate(getByDate), AttendanceController.getByDate);
router.get('/export', authMiddleware, requireManagerOrAdmin, validate(exportAttendance), AttendanceController.exportFile);
router.get('/stats', authMiddleware, requireManagerOrAdmin, AttendanceController.getStats);
router.get('/student/:id', authMiddleware, requireManagerOrAdmin, validate(getByStudent), AttendanceController.getByStudent);

module.exports = router;
