/**
 * ==========================================
 * MODEL: ATTENDANCE (ĐIỂM DANH)
 * ==========================================
 * Tương tác với bảng attendance_records trong database.
 */

const db = require('../config/db');

const AttendanceModel = {
    /**
     * Tạo bảng attendance_records nếu chưa tồn tại
     */
    createTable: async () => {
        const sql = `
            CREATE TABLE IF NOT EXISTS attendance_records (
                id SERIAL PRIMARY KEY,
                student_id INTEGER REFERENCES students(id),
                card_uid VARCHAR(50) NOT NULL,              -- UID thẻ đã quẹt
                check_in_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                device_id VARCHAR(50),                      -- Thiết bị ESP32 nào
                status VARCHAR(20) DEFAULT 'present',       -- present, late, absent
                note TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE INDEX IF NOT EXISTS idx_attendance_student 
                ON attendance_records(student_id);
            CREATE INDEX IF NOT EXISTS idx_attendance_date 
                ON attendance_records(check_in_time);
        `;
        await db.query(sql);
        console.log('📋 Bảng attendance_records đã sẵn sàng');
    },

    /**
     * Ghi nhận điểm danh
     */
    create: async ({ student_id, card_uid, device_id, status }) => {
        const result = await db.query(
            `INSERT INTO attendance_records (student_id, card_uid, device_id, status)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [student_id, card_uid, device_id, status || 'present']
        );
        return result.rows[0];
    },

    /**
     * Lấy lịch sử điểm danh theo ngày
     */
    findByDate: async (date) => {
        const result = await db.query(
            `SELECT ar.*, s.full_name, s.student_id as mssv, s.class
             FROM attendance_records ar
             JOIN students s ON ar.student_id = s.id
             WHERE DATE(ar.check_in_time) = $1
             ORDER BY ar.check_in_time DESC`,
            [date]
        );
        return result.rows;
    },

    /**
     * Lấy lịch sử điểm danh của một sinh viên
     */
    findByStudentId: async (studentId) => {
        const result = await db.query(
            `SELECT * FROM attendance_records 
             WHERE student_id = $1 
             ORDER BY check_in_time DESC`,
            [studentId]
        );
        return result.rows;
    },

    /**
     * Kiểm tra sinh viên đã điểm danh hôm nay chưa
     */
    hasCheckedInToday: async (studentId) => {
        const result = await db.query(
            `SELECT * FROM attendance_records 
             WHERE student_id = $1 
             AND DATE(check_in_time) = CURRENT_DATE`,
            [studentId]
        );
        return result.rows.length > 0;
    },

    /**
     * Thống kê điểm danh
     */
    getStats: async () => {
        const result = await db.query(`
            SELECT 
                COUNT(*) as total_records,
                COUNT(DISTINCT student_id) as unique_students,
                DATE(check_in_time) as date
            FROM attendance_records
            GROUP BY DATE(check_in_time)
            ORDER BY date DESC
            LIMIT 30
        `);
        return result.rows;
    },
};

module.exports = AttendanceModel;
