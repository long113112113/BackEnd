const AttendanceModel = require('../models/attendance.model');

const AttendanceController = {
    getByDate: async (req, res, next) => {
        try {
            const date = req.query.date || new Date().toISOString().split('T')[0];
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
            const { rows: records, total } = await AttendanceModel.findByDate(date, page, limit);
            const totalPages = Math.ceil(total / limit);
            res.json({
                success: true,
                date,
                data: records,
                count: records.length,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                },
            });
        } catch (err) {
            next(err);
        }
    },
    getByStudent: async (req, res, next) => {
        try {
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
            const { rows: records, total } = await AttendanceModel.findByStudentId(req.params.id, page, limit);
            const totalPages = Math.ceil(total / limit);
            res.json({
                success: true,
                data: records,
                count: records.length,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                },
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
