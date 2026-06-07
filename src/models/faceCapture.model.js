const db = require('../config/db');

const FaceCaptureModel = {
    createTable: async () => {
        const sql = `
            CREATE TABLE IF NOT EXISTS face_captures (
                id           SERIAL PRIMARY KEY,
                attendance_id INT REFERENCES attendance_records(id) ON DELETE CASCADE,
                capture_token VARCHAR(64) UNIQUE NOT NULL,
                device_id    VARCHAR(50),
                image_path   VARCHAR(255),
                face_box     JSONB,
                face_score   REAL,
                status       VARCHAR(20) DEFAULT 'pending',
                ai_request_id VARCHAR(64),
                created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                used_at      TIMESTAMPTZ,
                matched_at   TIMESTAMPTZ
            );

            CREATE INDEX IF NOT EXISTS idx_face_captures_attendance
                ON face_captures(attendance_id);
            CREATE INDEX IF NOT EXISTS idx_face_captures_token
                ON face_captures(capture_token);
            CREATE INDEX IF NOT EXISTS idx_face_captures_status
                ON face_captures(status);

            ALTER TABLE attendance_records
                ADD COLUMN IF NOT EXISTS face_status     VARCHAR(20) DEFAULT 'pending',
                ADD COLUMN IF NOT EXISTS face_capture_id INT REFERENCES face_captures(id);
                
            ALTER TABLE face_captures
                ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'attendance',
                ADD COLUMN IF NOT EXISTS student_id INT REFERENCES students(id);
        `;
        await db.query(sql);
    },

    createPending: async ({ attendance_id, device_id, capture_token }) => {
        const result = await db.query(
            `INSERT INTO face_captures (attendance_id, device_id, capture_token, status, type)
             VALUES ($1, $2, $3, 'pending', 'attendance')
             RETURNING *`,
            [attendance_id, device_id, capture_token]
        );
        return result.rows[0];
    },

    createEnrollmentPending: async ({ student_id, device_id, capture_token }) => {
        const result = await db.query(
            `INSERT INTO face_captures (student_id, device_id, capture_token, status, type)
             VALUES ($1, $2, $3, 'pending', 'enroll')
             RETURNING *`,
            [student_id, device_id, capture_token]
        );
        return result.rows[0];
    },

    findByToken: async (token) => {
        const result = await db.query(
            `SELECT * FROM face_captures WHERE capture_token = $1`,
            [token]
        );
        return result.rows[0] || null;
    },

    findById: async (id) => {
        const result = await db.query(
            `SELECT * FROM face_captures WHERE id = $1`,
            [id]
        );
        return result.rows[0] || null;
    },

    findLatestByAttendance: async (attendanceId) => {
        const result = await db.query(
            `SELECT * FROM face_captures
             WHERE attendance_id = $1
             ORDER BY created_at DESC LIMIT 1`,
            [attendanceId]
        );
        return result.rows[0] || null;
    },

    markUsed: async (id) => {
        const result = await db.query(
            `UPDATE face_captures
             SET used_at = NOW()
             WHERE id = $1 AND used_at IS NULL
             RETURNING *`,
            [id]
        );
        return result.rows[0] || null;
    },

    attachImage: async (id, { image_path, face_box, face_score, face_detected }) => {
        const result = await db.query(
            `UPDATE face_captures
             SET image_path = $2,
                 face_box   = $3,
                 face_score = $4,
                 status     = CASE WHEN $5::boolean THEN 'ai_processing' ELSE 'no_face' END
             WHERE id = $1
             RETURNING *`,
            [id, image_path, face_box, face_score, face_detected]
        );
        return result.rows[0] || null;
    },

    setAiResult: async (id, { status, ai_request_id }) => {
        const TERMINAL_STATUSES = ['matched', 'mismatch', 'no_face', 'spoof'];
        const shouldSetMatchedAt = TERMINAL_STATUSES.includes(status);
        const result = await db.query(
            `UPDATE face_captures
             SET status        = $2,
                 ai_request_id = COALESCE($3, ai_request_id),
                 matched_at    = CASE WHEN $4::boolean THEN NOW() ELSE matched_at END
             WHERE id = $1
             RETURNING *`,
            [id, status, ai_request_id || null, shouldSetMatchedAt]
        );
        return result.rows[0] || null;
    },

    setExpired: async (id) => {
        const result = await db.query(
            `UPDATE face_captures
             SET status = 'expired'
             WHERE id = $1 AND status = 'pending'
             RETURNING *`,
            [id]
        );
        return result.rows[0] || null;
    },

    cleanupExpired: async (olderThanDays = 30) => {
        await db.query(
            `DELETE FROM face_captures
             WHERE status IN ('matched', 'mismatch', 'no_face', 'spoof', 'expired', 'ai_error')
               AND created_at < NOW() - make_interval(days => $1)`,
            [olderThanDays]
        );
    },

    /**
     * Finds the latest successful enrollment capture for a student.
     * @param {number} studentId - The student PK.
     * @returns {Promise<object|null>} The capture row or null.
     */
    findLatestEnrollmentByStudent: async (studentId, offset = 0) => {
        const result = await db.query(
            `SELECT * FROM face_captures
             WHERE student_id = $1
               AND type = 'enroll'
               AND status = 'matched'
               AND image_path IS NOT NULL
             ORDER BY created_at DESC LIMIT 1 OFFSET $2`,
            [studentId, offset]
        );
        return result.rows[0] || null;
    },
};

module.exports = FaceCaptureModel;
