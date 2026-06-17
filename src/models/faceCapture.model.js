const db = require('../config/db');

const ACTIVE_CAPTURE_STATUSES = ['pending', 'ai_processing'];

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
            CREATE INDEX IF NOT EXISTS idx_face_captures_device_active
                ON face_captures(device_id, created_at DESC)
                WHERE status IN ('pending', 'ai_processing');
            CREATE UNIQUE INDEX IF NOT EXISTS idx_face_captures_device_active_uniq
                ON face_captures(device_id)
                WHERE status IN ('pending', 'ai_processing');

            ALTER TABLE attendance_records
                ADD COLUMN IF NOT EXISTS face_status     VARCHAR(20) DEFAULT 'pending',
                ADD COLUMN IF NOT EXISTS face_capture_id INT REFERENCES face_captures(id);
                
            ALTER TABLE face_captures
                ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'attendance',
                ADD COLUMN IF NOT EXISTS student_id INT REFERENCES students(id),
                ADD COLUMN IF NOT EXISTS match_score REAL,
                ADD COLUMN IF NOT EXISTS liveness_score REAL,
                ADD COLUMN IF NOT EXISTS face_detected BOOLEAN DEFAULT false,
                ADD COLUMN IF NOT EXISTS device_status VARCHAR(20),
                ADD COLUMN IF NOT EXISTS device_status_reason VARCHAR(40),
                ADD COLUMN IF NOT EXISTS device_elapsed_ms INT;
        `;
        await db.query(sql);
    },

    createPending: async ({ attendance_id, device_id, capture_token }) => {
        const result = await db.query(
            `INSERT INTO face_captures (attendance_id, device_id, capture_token, status, type)
             VALUES ($1, $2, $3, 'pending', 'attendance')
             ON CONFLICT (device_id) WHERE status IN ('pending', 'ai_processing') DO NOTHING
             RETURNING *`,
            [attendance_id, device_id, capture_token]
        );
        return result.rows[0] || null;
    },

    createEnrollmentPending: async ({ student_id, device_id, capture_token }) => {
        const result = await db.query(
            `INSERT INTO face_captures (student_id, device_id, capture_token, status, type)
             VALUES ($1, $2, $3, 'pending', 'enroll')
             ON CONFLICT (device_id) WHERE status IN ('pending', 'ai_processing') DO NOTHING
             RETURNING *`,
            [student_id, device_id, capture_token]
        );
        return result.rows[0] || null;
    },

    /**
     * Finds the newest capture that still owns the camera device.
     * @param {string} deviceId - The camera device ID.
     * @returns {Promise<object|null>} The active capture row or null.
     */
    findActiveByDevice: async (deviceId) => {
        const result = await db.query(
            `SELECT * FROM face_captures
             WHERE device_id = $1
               AND status = ANY($2::varchar[])
             ORDER BY created_at DESC
             LIMIT 1`,
            [deviceId, ACTIVE_CAPTURE_STATUSES]
        );
        return result.rows[0] || null;
    },

    /**
     * Expires camera-owning captures that outlived the firmware capture window.
     * @param {string} deviceId - The camera device ID.
     * @param {number} timeoutMs - Capture timeout in milliseconds.
     * @returns {Promise<number>} Number of rows marked expired.
     */
    expireStaleActiveByDevice: async (deviceId, timeoutMs) => {
        const result = await db.query(
            `UPDATE face_captures
             SET status = 'expired'
             WHERE device_id = $1
               AND status = ANY($2::varchar[])
               AND created_at < NOW() - ($3::int * INTERVAL '1 millisecond')`,
            [deviceId, ACTIVE_CAPTURE_STATUSES, timeoutMs]
        );
        return result.rowCount;
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

    /**
     * Records the firmware-side capture state without changing AI lifecycle status.
     * @param {number} id - Face capture row ID.
     * @param {object} params - Firmware status metadata.
     * @returns {Promise<object|null>} The updated capture row or null.
     */
    updateDeviceStatus: async (id, { device_status, device_status_reason, device_elapsed_ms, face_score }) => {
        const result = await db.query(
            `UPDATE face_captures
             SET device_status = $2,
                 device_status_reason = $3,
                 device_elapsed_ms = $4,
                 face_score = COALESCE($5, face_score)
             WHERE id = $1
             RETURNING *`,
            [id, device_status, device_status_reason || null, device_elapsed_ms ?? null, face_score ?? null]
        );
        return result.rows[0] || null;
    },

    /**
     * Marks an active capture as terminal based on a firmware status report.
     * @param {number} id - Face capture row ID.
     * @param {object} params - Terminal status and firmware metadata.
     * @returns {Promise<object|null>} The updated capture row or null when already terminal.
     */
    setDeviceTerminal: async (id, { status, device_status, device_status_reason, device_elapsed_ms, face_score }) => {
        const result = await db.query(
            `UPDATE face_captures
             SET status = $2,
                 device_status = $3,
                 device_status_reason = $4,
                 device_elapsed_ms = $5,
                 face_score = COALESCE($6, face_score)
             WHERE id = $1
               AND status = ANY($7::varchar[])
             RETURNING *`,
            [
                id,
                status,
                device_status,
                device_status_reason || null,
                device_elapsed_ms ?? null,
                face_score ?? null,
                ACTIVE_CAPTURE_STATUSES,
            ]
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

    setAiResult: async (id, { status, ai_request_id, match_score, liveness_score }) => {
        const TERMINAL_STATUSES = ['match', 'matched', 'mismatch', 'no_face', 'spoof'];
        const shouldSetMatchedAt = TERMINAL_STATUSES.includes(status);
        const result = await db.query(
            `UPDATE face_captures
             SET status        = $2,
                 ai_request_id = COALESCE($3, ai_request_id),
                 match_score   = COALESCE($4, match_score),
                 liveness_score = COALESCE($5, liveness_score),
                 matched_at    = CASE WHEN $6::boolean THEN NOW() ELSE matched_at END
             WHERE id = $1
             RETURNING *`,
            [id, status, ai_request_id || null, match_score || null, liveness_score || null, shouldSetMatchedAt]
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
        const queryCondition = `
            status IN ('match', 'matched', 'mismatch', 'no_face', 'spoof', 'expired', 'ai_error')
            AND created_at < NOW() - make_interval(days => $1)
        `;

        await db.query(
            `UPDATE attendance_records
             SET face_capture_id = NULL
             WHERE face_capture_id IN (
                 SELECT id FROM face_captures WHERE ${queryCondition}
             )`,
            [olderThanDays]
        );

        await db.query(
            `DELETE FROM face_captures WHERE ${queryCondition}`,
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
               AND status IN ('match', 'matched')
               AND image_path IS NOT NULL
             ORDER BY created_at DESC LIMIT 1 OFFSET $2`,
            [studentId, offset]
        );
        return result.rows[0] || null;
    },
};

module.exports = FaceCaptureModel;
