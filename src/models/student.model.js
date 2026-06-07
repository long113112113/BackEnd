const db = require('../config/db');

/** Explicit column list to avoid leaking internal fields via SELECT *. */
const STUDENT_COLUMNS = 'id, student_id, full_name, class, card_uid, email, phone, avatar_url, is_active, created_at, updated_at';

const StudentModel = {
    createTable: async () => {
        const sql = `
            CREATE EXTENSION IF NOT EXISTS vector;

            CREATE TABLE IF NOT EXISTS students (
                id SERIAL PRIMARY KEY,
                student_id VARCHAR(20) UNIQUE NOT NULL,    
                full_name VARCHAR(100) NOT NULL,            
                class VARCHAR(50),                          
                card_uid VARCHAR(50) UNIQUE,                
                email VARCHAR(100),
                phone VARCHAR(20),
                avatar_url TEXT,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );

            ALTER TABLE students
                DROP COLUMN IF EXISTS face_embedding,
                DROP COLUMN IF EXISTS face_enrolled_at;

            CREATE TABLE IF NOT EXISTS face_embeddings (
                id SERIAL PRIMARY KEY,
                student_id INT REFERENCES students(id) ON DELETE CASCADE,
                embedding vector(512) NOT NULL,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await db.query(sql);
    },
    findByCardUID: async (cardUID) => {
        const result = await db.query(
            `SELECT ${STUDENT_COLUMNS} FROM students WHERE card_uid = $1 AND is_active = true`,
            [cardUID]
        );
        return result.rows[0] || null;
    },

    findAll: async (page = 1, limit = 50, filters = [], sortBy = 'full_name', sortOrder = 'asc') => {
        const ALLOWED_COLUMNS = new Set([
            'id', 'student_id', 'full_name', 'email', 'class',
            'card_uid', 'phone', 'is_active', 'created_at', 'updated_at'
        ]);

        const OPERATOR_MAP = {
            eq: '=',
            neq: '<>',
            gt: '>',
            gte: '>=',
            lt: '<',
            lte: '<=',
            like: 'LIKE',
            ilike: 'ILIKE',
            not_like: 'NOT LIKE',
            in: 'IN',
            is_null: 'IS NULL',
            is_not_null: 'IS NOT NULL',
        };

        const params = [];
        let paramIndex = 1;

        // Collect filter conditions separately to wrap in parentheses,
        // preventing OR filters from bypassing the is_active = true guard.
        const filterConditions = [];

        for (const filter of filters) {
            const { column, operator, value, logic } = filter;

            if (!ALLOWED_COLUMNS.has(column)) continue;

            const sqlOp = OPERATOR_MAP[operator];
            if (!sqlOp) continue;

            let condition;
            if (operator === 'is_null' || operator === 'is_not_null') {
                condition = `"${column}" ${sqlOp}`;
            } else if (operator === 'in') {
                const values = String(value).split(',').map(v => v.trim()).filter(Boolean);
                if (values.length === 0) continue;
                const placeholders = values.map(() => `$${paramIndex++}`);
                condition = `"${column}" IN (${placeholders.join(', ')})`;
                params.push(...values);
            } else if (operator === 'like' || operator === 'ilike' || operator === 'not_like') {
                condition = `"${column}" ${sqlOp} $${paramIndex++}`;
                params.push(`%${value}%`);
            } else {
                condition = `"${column}" ${sqlOp} $${paramIndex++}`;
                params.push(value);
            }

            // First condition stands alone; subsequent ones are joined by AND/OR.
            if (filterConditions.length === 0) {
                filterConditions.push(condition);
            } else {
                const connector = logic === 'or' ? 'OR' : 'AND';
                filterConditions.push(`${connector} ${condition}`);
            }
        }

        // Wrap user filters in parentheses so OR never bypasses is_active = true.
        let whereClause = 'WHERE is_active = true';
        if (filterConditions.length > 0) {
            whereClause += ` AND (${filterConditions.join(' ')})`;
        }

        const validSortBy = ALLOWED_COLUMNS.has(sortBy) ? sortBy : 'full_name';
        const validSortOrder = sortOrder === 'desc' ? 'DESC' : 'ASC';

        const offset = (page - 1) * limit;
        params.push(limit, offset);
        const limitParam = paramIndex++;
        const offsetParam = paramIndex;

        const sql = `
            SELECT ${STUDENT_COLUMNS}, COUNT(*) OVER() AS __total_count 
            FROM students 
            ${whereClause}
            ORDER BY "${validSortBy}" ${validSortOrder} 
            LIMIT $${limitParam} OFFSET $${offsetParam}
        `;

        const result = await db.query(sql, params);
        const total = result.rows.length > 0 ? parseInt(result.rows[0].__total_count, 10) : 0;
        const rows = result.rows.map(({ __total_count, ...row }) => row);
        return { rows, total };
    },
    findById: async (id) => {
        const result = await db.query(
            `SELECT ${STUDENT_COLUMNS} FROM students WHERE id = $1 AND is_active = true`,
            [id]
        );
        return result.rows[0] || null;
    },


    create: async ({ student_id, full_name, class: className, card_uid, email, phone }) => {
        const result = await db.query(
            `INSERT INTO students (student_id, full_name, class, card_uid, email, phone)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING ${STUDENT_COLUMNS}`,
            [student_id, full_name, className, card_uid, email, phone]
        );
        return result.rows[0];
    },

    update: async (id, data) => {
        const ALLOWED_COLUMNS = new Set(['full_name', 'class', 'card_uid', 'email', 'phone']);
        const entries = Object.entries(data).filter(([col]) => ALLOWED_COLUMNS.has(col));
        if (entries.length === 0) {
            const result = await db.query(
                `SELECT ${STUDENT_COLUMNS} FROM students WHERE id = $1 AND is_active = true`,
                [id]
            );
            return result.rows[0] || null;
        }
        const setClauses = entries.map(([col], i) => `"${col}" = $${i + 1}`);
        const values = entries.map(([, val]) => val);
        values.push(id);
        const result = await db.query(
            `UPDATE students SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length} AND is_active = true RETURNING ${STUDENT_COLUMNS}`,
            values
        );
        return result.rows[0] || null;
    },
    delete: async (id) => {
        const result = await db.query(
            `UPDATE students SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_active = true RETURNING ${STUDENT_COLUMNS}`,
            [id]
        );
        return result.rows[0] || null;
    },

    addEmbedding: async (studentId, embeddingArray) => {
        const result = await db.query(
            `INSERT INTO face_embeddings (student_id, embedding) VALUES ($1, $2::vector) RETURNING id`,
            [studentId, JSON.stringify(embeddingArray)]
        );
        return result.rows[0];
    },
    getEmbeddings: async (studentId) => {
        const result = await db.query(
            `SELECT embedding::text FROM face_embeddings WHERE student_id = $1 ORDER BY created_at ASC`,
            [studentId]
        );
        return result.rows.map(row => {
            try {
                return JSON.parse(row.embedding);
            } catch (e) {
                return null;
            }
        }).filter(e => e !== null);
    },
    clearEmbeddings: async (studentId) => {
        await db.query(`DELETE FROM face_embeddings WHERE student_id = $1`, [studentId]);
        return { ok: true };
    },
    getEmbeddingCount: async (studentId) => {
        const result = await db.query(
            `SELECT COUNT(*) as count FROM face_embeddings WHERE student_id = $1`,
            [studentId]
        );
        return parseInt(result.rows[0].count, 10);
    },
};

module.exports = StudentModel;
