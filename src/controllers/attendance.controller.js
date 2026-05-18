/**
 * ==========================================
 * CONTROLLER: ATTENDANCE (ĐIỂM DANH)
 * ==========================================
 * Xử lý logic cho các API liên quan điểm danh.
 */

const AttendanceModel = require('../models/attendance.model');

const AttendanceController = {
    /**
     * GET /api/attendance?date=2026-05-17 - Lấy lịch sử điểm danh theo ngày
     */
    getByDate: async (req, res, next) => {
        try {
            const date = req.query.date || new Date().toISOString().split('T')[0];
            const records = await AttendanceModel.findByDate(date);
            res.json({
                success: true,
                date,
                data: records,
                count: records.length,
            });
        } catch (err) {
            next(err);
        }
    },

    /**
     * GET /api/attendance/student/:id - Lịch sử điểm danh của 1 sinh viên
     */
    getByStudent: async (req, res, next) => {
        try {
            const records = await AttendanceModel.findByStudentId(req.params.id);
            res.json({
                success: true,
                data: records,
                count: records.length,
            });
        } catch (err) {
            next(err);
        }
    },

    /**
     * GET /api/attendance/stats - Thống kê điểm danh
     */
    getStats: async (req, res, next) => {
        try {
            const stats = await AttendanceModel.getStats();
            res.json({ success: true, data: stats });
        } catch (err) {
            next(err);
        }
    },
};

module.exports = AttendanceController;
