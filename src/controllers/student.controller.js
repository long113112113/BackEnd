/**
 * ==========================================
 * CONTROLLER: STUDENTS
 * ==========================================
 * Xử lý logic cho các API liên quan sinh viên.
 */

const StudentModel = require('../models/student.model');

const StudentController = {
    /**
     * GET /api/students - Lấy danh sách sinh viên
     */
    getAll: async (req, res, next) => {
        try {
            const students = await StudentModel.findAll();
            res.json({
                success: true,
                data: students,
                count: students.length,
            });
        } catch (err) {
            next(err);
        }
    },

    /**
     * GET /api/students/:id - Lấy thông tin 1 sinh viên
     */
    getById: async (req, res, next) => {
        try {
            const student = await StudentModel.findById(req.params.id);
            if (!student) {
                return res.status(404).json({
                    success: false,
                    message: 'Student not found',
                });
            }
            res.json({ success: true, data: student });
        } catch (err) {
            next(err);
        }
    },

    /**
     * POST /api/students - Thêm sinh viên mới
     */
    create: async (req, res, next) => {
        try {
            const { student_id, full_name, class: className, card_uid, email, phone } = req.body;

            if (!student_id || !full_name) {
                return res.status(400).json({
                    success: false,
                    message: 'Student ID and full name are required',
                });
            }

            const student = await StudentModel.create({
                student_id, full_name, class: className, card_uid, email, phone,
            });

            res.status(201).json({ success: true, data: student });
        } catch (err) {
            if (err.code === '23505') { // Unique violation
                return res.status(409).json({
                    success: false,
                    message: 'Student ID or card UID already exists',
                });
            }
            next(err);
        }
    },

    /**
     * PUT /api/students/:id - Cập nhật sinh viên
     */
    update: async (req, res, next) => {
        try {
            const student = await StudentModel.update(req.params.id, req.body);
            if (!student) {
                return res.status(404).json({
                    success: false,
                    message: 'Student not found',
                });
            }
            res.json({ success: true, data: student });
        } catch (err) {
            next(err);
        }
    },

    /**
     * DELETE /api/students/:id - Xoá sinh viên
     */
    delete: async (req, res, next) => {
        try {
            const student = await StudentModel.delete(req.params.id);
            if (!student) {
                return res.status(404).json({
                    success: false,
                    message: 'Student not found',
                });
            }
            res.json({ success: true, message: 'Student deleted successfully' });
        } catch (err) {
            next(err);
        }
    },
};

module.exports = StudentController;
