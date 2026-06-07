
const db = require('../config/db');

const AttendanceModel = {
    createTable: async () => {
        const sql = `
            CREATE TABLE IF NOT EXISTS attendance_records (
                id SERIAL PRIMARY KEY,
                student_id INTEGER REFERENCES students(id),
                card_uid VARCHAR(50) NOT NULL,             
                check_in_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                device_id VARCHAR(50),                  
                status VARCHAR(20) DEFAULT 'present',       
                note TEXT,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE INDEX IF NOT EXISTS idx_attendance_student 
                ON attendance_records(student_id);
            CREATE INDEX IF NOT EXISTS idx_attendance_date 
                ON attendance_records(check_in_time);
            CREATE INDEX IF NOT EXISTS idx_attendance_student_time
                ON attendance_records(student_id, check_in_time DESC);
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
    findById: async (id) => {
        const result = await db.query(
            `SELECT * FROM attendance_records WHERE id = $1`,
            [id]
        );
        return result.rows[0] || null;
    },
    findByDate: async (date, page = 1, limit = 50) => {
        const offset = (page - 1) * limit;
        const result = await db.query(
            `SELECT ar.id, ar.card_uid, ar.check_in_time, ar.device_id, ar.status, ar.note, ar.created_at,
                    s.student_id, s.full_name, s.class,
                    COUNT(*) OVER() AS __total_count
             FROM attendance_records ar
             JOIN students s ON ar.student_id = s.id
             WHERE ar.check_in_time >= $1::date AND ar.check_in_time < ($1::date + INTERVAL '1 day')
             ORDER BY ar.check_in_time DESC
             LIMIT $2 OFFSET $3`,
            [date, limit, offset]
        );
        const total = result.rows.length > 0 ? parseInt(result.rows[0].__total_count, 10) : 0;
        const rows = result.rows.map(({ __total_count, ...row }) => row);
        return { rows, total };
    },

    findByStudentId: async (studentId, page = 1, limit = 50) => {
        const offset = (page - 1) * limit;
        const result = await db.query(
            `SELECT ar.id, ar.card_uid, ar.check_in_time, ar.device_id, ar.status, ar.note, ar.created_at,
                    s.student_id, s.full_name, s.class,
                    COUNT(*) OVER() AS __total_count
             FROM attendance_records ar
             JOIN students s ON ar.student_id = s.id
             WHERE s.student_id = $1
             ORDER BY ar.check_in_time DESC
             LIMIT $2 OFFSET $3`,
            [studentId, limit, offset]
        );
        const total = result.rows.length > 0 ? parseInt(result.rows[0].__total_count, 10) : 0;
        const rows = result.rows.map(({ __total_count, ...row }) => row);
        return { rows, total };
    },

    createIfCooldownPassed: async ({ student_id, card_uid, device_id, status }, cooldownMinutes) => {
        const minutes = Math.max(1, parseInt(cooldownMinutes, 10) || 3);
        const result = await db.query(
            `INSERT INTO attendance_records (student_id, card_uid, device_id, status)
             SELECT $1, $2, $3, $4
             WHERE NOT EXISTS (
                 SELECT 1 FROM attendance_records
                 WHERE student_id = $1 
                 AND check_in_time > NOW() - make_interval(mins => $5)
                 LIMIT 1
             )
             RETURNING *`,
            [student_id, card_uid, device_id, status || 'present', minutes]
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

    findAdvanced: async ({ startDate, endDate, studentId, className, groupBy }, page = 1, limit = 50) => {
        if (groupBy === 'student') {
            const params = [];
            let paramIndex = 1;
            const conditions = ['s.is_active = true'];

            if (startDate) {
                conditions.push(`ar.check_in_time >= $${paramIndex}::date`);
                params.push(startDate);
                paramIndex++;
            }

            if (endDate) {
                conditions.push(`ar.check_in_time < ($${paramIndex}::date + INTERVAL '1 day')`);
                params.push(endDate);
                paramIndex++;
            }

            if (studentId) {
                conditions.push(`s.student_id = $${paramIndex}`);
                params.push(studentId);
                paramIndex++;
            }

            if (className) {
                conditions.push(`s.class = $${paramIndex}`);
                params.push(className);
                paramIndex++;
            }

            const offset = (page - 1) * limit;
            params.push(limit, offset);
            const limitParam = paramIndex++;
            const offsetParam = paramIndex;

            const sql = `
                WITH student_counts AS (
                    SELECT 
                        s.id as student_id_pk,
                        s.student_id,
                        s.full_name,
                        s.class,
                        COUNT(ar.id) as total_records
                    FROM students s
                    LEFT JOIN attendance_records ar ON s.id = ar.student_id
                    WHERE ${conditions.join(' AND ')}
                    GROUP BY s.id, s.student_id, s.full_name, s.class
                    HAVING COUNT(ar.id) > 0
                ),
                paginated AS (
                    SELECT *
                    FROM student_counts
                    ORDER BY student_id ASC
                    LIMIT $${limitParam} OFFSET $${offsetParam}
                )
                SELECT 
                    p.*,
                    (SELECT COUNT(*) FROM student_counts) as __total_students
                FROM paginated p
            `;

            const result = await db.query(sql, params);
            const totalStudents = result.rows.length > 0 ? parseInt(result.rows[0].__total_students, 10) : 0;

            const studentIds = result.rows.map(r => r.student_id_pk);
            if (studentIds.length === 0) {
                return { rows: [], total: 0 };
            }

            const recordsParams = [studentIds];
            let recordsParamIndex = 2;
            const recordConditions = ['ar.student_id = ANY($1)'];

            if (startDate) {
                recordConditions.push(`ar.check_in_time >= $${recordsParamIndex}::date`);
                recordsParams.push(startDate);
                recordsParamIndex++;
            }

            if (endDate) {
                recordConditions.push(`ar.check_in_time < ($${recordsParamIndex}::date + INTERVAL '1 day')`);
                recordsParams.push(endDate);
                recordsParamIndex++;
            }

            const MAX_RECORDS_PER_STUDENT = 20;
            recordsParams.push(MAX_RECORDS_PER_STUDENT);

            const recordsSql = `
                SELECT id, student_id, check_in_time, device_id, status
                FROM (
                    SELECT ar.id, ar.student_id, ar.check_in_time, ar.device_id, ar.status,
                           ROW_NUMBER() OVER (PARTITION BY ar.student_id ORDER BY ar.check_in_time DESC) as rn
                    FROM attendance_records ar
                    WHERE ${recordConditions.join(' AND ')}
                ) ranked
                WHERE rn <= $${recordsParamIndex}
                ORDER BY student_id, check_in_time DESC
            `;

            const recordsResult = await db.query(recordsSql, recordsParams);

            const recordsByStudent = {};
            for (const row of recordsResult.rows) {
                if (!recordsByStudent[row.student_id]) {
                    recordsByStudent[row.student_id] = [];
                }
                recordsByStudent[row.student_id].push({
                    id: row.id,
                    check_in_time: row.check_in_time,
                    device_id: row.device_id,
                    status: row.status,
                });
            }

            const rows = result.rows.map(({ __total_students, student_id_pk, ...student }) => ({
                student: {
                    id: student_id_pk,
                    student_id: student.student_id,
                    full_name: student.full_name,
                    class: student.class,
                },
                records: recordsByStudent[student_id_pk] || [],
                total_records: parseInt(student.total_records, 10),
            }));

            return { rows, total: totalStudents };
        }

        const params = [];
        let paramIndex = 1;
        const conditions = [];

        if (startDate) {
            conditions.push(`ar.check_in_time >= $${paramIndex}::date`);
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            conditions.push(`ar.check_in_time < ($${paramIndex}::date + INTERVAL '1 day')`);
            params.push(endDate);
            paramIndex++;
        }

        if (studentId) {
            conditions.push(`s.student_id = $${paramIndex}`);
            params.push(studentId);
            paramIndex++;
        }

        if (className) {
            conditions.push(`s.class = $${paramIndex}`);
            params.push(className);
            paramIndex++;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const offset = (page - 1) * limit;
        params.push(limit, offset);
        const limitParam = paramIndex++;
        const offsetParam = paramIndex;

        const sql = `
            SELECT ar.id, ar.card_uid, ar.check_in_time, ar.device_id, ar.status, ar.note, ar.created_at,
                   s.student_id, s.full_name, s.class,
                   COUNT(*) OVER() AS __total_count
            FROM attendance_records ar
            JOIN students s ON ar.student_id = s.id
            ${whereClause}
            ORDER BY ar.check_in_time DESC
            LIMIT $${limitParam} OFFSET $${offsetParam}
        `;

        const result = await db.query(sql, params);
        const total = result.rows.length > 0 ? parseInt(result.rows[0].__total_count, 10) : 0;
        const rows = result.rows.map(({ __total_count, ...row }) => row);
        return { rows, total };
    },

    findAdvancedForExport: async ({ startDate, endDate, studentId, className }, maxRecords = 10000) => {
        const params = [];
        let paramIndex = 1;
        const conditions = [];

        if (startDate) {
            conditions.push(`ar.check_in_time >= $${paramIndex}::date`);
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            conditions.push(`ar.check_in_time < ($${paramIndex}::date + INTERVAL '1 day')`);
            params.push(endDate);
            paramIndex++;
        }

        if (studentId) {
            conditions.push(`s.student_id = $${paramIndex}`);
            params.push(studentId);
            paramIndex++;
        }

        if (className) {
            conditions.push(`s.class = $${paramIndex}`);
            params.push(className);
            paramIndex++;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        params.push(maxRecords);

        const sql = `
            SELECT s.student_id, s.full_name, s.class, ar.check_in_time, ar.device_id, ar.status
            FROM attendance_records ar
            JOIN students s ON ar.student_id = s.id
            ${whereClause}
            ORDER BY ar.check_in_time DESC
            LIMIT $${paramIndex}
        `;

        const result = await db.query(sql, params);
        return result.rows;
    },

    setFaceStatus: async (id, { face_status, face_capture_id }) => {
        const sets = [];
        const params = [];
        let idx = 1;
        if (face_status !== undefined) {
            sets.push(`face_status = $${idx++}`);
            params.push(face_status);
        }
        if (face_capture_id !== undefined) {
            sets.push(`face_capture_id = $${idx++}`);
            params.push(face_capture_id);
        }
        if (sets.length === 0) return null;
        params.push(id);
        const result = await db.query(
            `UPDATE attendance_records SET ${sets.join(', ')}
             WHERE id = $${idx}
             RETURNING *`,
            params
        );
        return result.rows[0] || null;
    },
};

module.exports = AttendanceModel;
