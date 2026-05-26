
const db = require('../config/db');

const AttendanceModel = {
    createTable: async () => {
        const sql = `
            CREATE TABLE IF NOT EXISTS attendance_records (
                id SERIAL PRIMARY KEY,
                student_id INTEGER REFERENCES students(id),
                card_uid VARCHAR(50) NOT NULL,             
                check_in_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                device_id VARCHAR(50),                  
                status VARCHAR(20) DEFAULT 'present',       
                note TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE INDEX IF NOT EXISTS idx_attendance_student 
                ON attendance_records(student_id);
            CREATE INDEX IF NOT EXISTS idx_attendance_date 
                ON attendance_records(check_in_time);
        `;
        await db.query(sql);
    },
    create: async ({ student_id, card_uid, device_id, status }) => {
        const result = await db.query(
            `INSERT INTO attendance_records (student_id, card_uid, device_id, status)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [student_id, card_uid, device_id, status || 'present']
        );
        return result.rows[0];
    },
    findByDate: async (date, page = 1, limit = 50) => {
        const offset = (page - 1) * limit;
        const countResult = await db.query(
            `SELECT COUNT(*) FROM attendance_records ar
             JOIN students s ON ar.student_id = s.id
             WHERE DATE(ar.check_in_time) = $1`,
            [date]
        );
        const total = parseInt(countResult.rows[0].count, 10);
        const result = await db.query(
            `SELECT ar.*, s.full_name, s.student_id as mssv, s.class
             FROM attendance_records ar
             JOIN students s ON ar.student_id = s.id
             WHERE DATE(ar.check_in_time) = $1
             ORDER BY ar.check_in_time DESC
             LIMIT $2 OFFSET $3`,
            [date, limit, offset]
        );
        return { rows: result.rows, total };
    },

    findByStudentId: async (studentId) => {
        const result = await db.query(
            `SELECT * FROM attendance_records 
             WHERE student_id = $1 
             ORDER BY check_in_time DESC`,
            [studentId]
        );
        return result.rows;
    },

    hasCheckedInToday: async (studentId) => {
        const result = await db.query(
            `SELECT 1 FROM attendance_records 
             WHERE student_id = $1 
             AND DATE(check_in_time) = CURRENT_DATE
             LIMIT 1`,
            [studentId]
        );
        return result.rows.length > 0;
    },
    createIfNotCheckedInToday: async ({ student_id, card_uid, device_id, status }) => {
        const result = await db.query(
            `INSERT INTO attendance_records (student_id, card_uid, device_id, status)
             SELECT $1, $2, $3, $4
             WHERE NOT EXISTS (
                 SELECT 1 FROM attendance_records
                 WHERE student_id = $1 AND DATE(check_in_time) = CURRENT_DATE
                 LIMIT 1
             )
             RETURNING *`,
            [student_id, card_uid, device_id, status || 'present']
        );
        return result.rows.length > 0 ? result.rows[0] : null;
    },
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
