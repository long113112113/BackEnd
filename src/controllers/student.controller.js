/**
 * ==========================================
 * CONTROLLER: STUDENTS
 * ==========================================
 * Xử lý logic cho các API liên quan sinh viên.
 */

const StudentModel = require('../models/student.model');
const pick = require('../utils/pick');

const STUDENT_FIELDS = ['student_id', 'full_name', 'class', 'card_uid', 'email', 'phone'];
const STUDENT_UPDATE_FIELDS = ['full_name', 'class', 'card_uid', 'email', 'phone'];

const StudentController = {
    /**
     * GET /api/students - Lấy danh sách sinh viên
     */
    getAll: async (req, res, next) => {
        try {
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
            const { rows: students, total } = await StudentModel.findAll(page, limit);
            const totalPages = Math.ceil(total / limit);
            res.json({
                success: true,
                data: students,
                count: students.length,
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
            const data = pick(req.body, STUDENT_FIELDS);

            const student = await StudentModel.create({
                student_id: data.student_id,
                full_name: data.full_name,
                class: data.class,
                card_uid: data.card_uid,
                email: data.email,
                phone: data.phone,
            });

            res.status(201).json({ success: true, data: student });
        } catch (err) {
            if (err.code === '23505') {
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
            const data = pick(req.body, STUDENT_UPDATE_FIELDS);
            const student = await StudentModel.update(req.params.id, data);
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
