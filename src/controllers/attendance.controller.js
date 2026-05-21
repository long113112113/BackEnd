const AttendanceModel = require('../models/attendance.model');

const AttendanceController = {
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
