const express = require('express');
const router = express.Router();
const AttendanceController = require('../controllers/attendance.controller');
const { authMiddleware, requireAdmin } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { getByDate, getByStudent } = require('../validations/attendance.validation');

router.get('/', authMiddleware, requireAdmin, validate(getByDate), AttendanceController.getByDate);
router.get('/stats', authMiddleware, requireAdmin, AttendanceController.getStats);
router.get('/student/:id', authMiddleware, requireAdmin, validate(getByStudent), AttendanceController.getByStudent);

module.exports = router;
