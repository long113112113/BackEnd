/**
 * ==========================================
 * MODEL: STUDENTS (SINH VIÊN)
 * ==========================================
 * Tương tác với bảng students trong database.
 */

const db = require('../config/db');

const StudentModel = {
    /**
     * Tạo bảng students nếu chưa tồn tại
     */
    createTable: async () => {
        const sql = `
            CREATE TABLE IF NOT EXISTS students (
                id SERIAL PRIMARY KEY,
                student_id VARCHAR(20) UNIQUE NOT NULL,    -- Mã sinh viên
                full_name VARCHAR(100) NOT NULL,           -- Họ và tên
                class VARCHAR(50),                         -- Lớp
                card_uid VARCHAR(50) UNIQUE,               -- Mã thẻ NFC (UID)
                email VARCHAR(100),
                phone VARCHAR(20),
                avatar_url TEXT,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await db.query(sql);
        console.log('📋 Bảng students đã sẵn sàng');
    },

    /**
     * Tìm sinh viên theo UID thẻ NFC
     */
    findByCardUID: async (cardUID) => {
        const result = await db.query(
            'SELECT * FROM students WHERE card_uid = $1 AND is_active = true',
            [cardUID]
        );
        return result.rows[0] || null;
    },

    /**
     * Lấy tất cả sinh viên
     */
    findAll: async () => {
        const result = await db.query(
            'SELECT * FROM students ORDER BY full_name ASC'
        );
        return result.rows;
    },

    /**
     * Tìm sinh viên theo ID
     */
    findById: async (id) => {
        const result = await db.query(
            'SELECT * FROM students WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    },

    /**
     * Thêm sinh viên mới
     */
    create: async ({ student_id, full_name, class: className, card_uid, email, phone }) => {
        const result = await db.query(
            `INSERT INTO students (student_id, full_name, class, card_uid, email, phone)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [student_id, full_name, className, card_uid, email, phone]
        );
        return result.rows[0];
    },

    /**
     * Cập nhật sinh viên
     */
    update: async (id, { full_name, class: className, card_uid, email, phone }) => {
        const result = await db.query(
            `UPDATE students 
             SET full_name = COALESCE($1, full_name),
                 class = COALESCE($2, class),
                 card_uid = COALESCE($3, card_uid),
                 email = COALESCE($4, email),
                 phone = COALESCE($5, phone),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $6
             RETURNING *`,
            [full_name, className, card_uid, email, phone, id]
        );
        return result.rows[0];
    },

    /**
     * Xoá sinh viên (soft delete)
     */
    delete: async (id) => {
        const result = await db.query(
            'UPDATE students SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
            [id]
        );
        return result.rows[0];
    },
};

module.exports = StudentModel;
