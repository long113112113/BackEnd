const db = require('../config/db');

const StudentModel = {
    createTable: async () => {
        const sql = `
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await db.query(sql);
    },
    findByCardUID: async (cardUID) => {
        const result = await db.query(
            'SELECT * FROM students WHERE card_uid = $1 AND is_active = true',
            [cardUID]
        );
        return result.rows[0] || null;
    },

    findAll: async (page = 1, limit = 50) => {
        const offset = (page - 1) * limit;
        const result = await db.query(
            `SELECT *, COUNT(*) OVER() AS __total_count 
             FROM students WHERE is_active = true 
             ORDER BY full_name ASC LIMIT $1 OFFSET $2`,
            [limit, offset]
        );
        const total = result.rows.length > 0 ? parseInt(result.rows[0].__total_count, 10) : 0;
        const rows = result.rows.map(({ __total_count, ...row }) => row);
        return { rows, total };
    },
    findById: async (id) => {
        const result = await db.query(
            'SELECT * FROM students WHERE id = $1 AND is_active = true',
            [id]
        );
        return result.rows[0] || null;
    },


    create: async ({ student_id, full_name, class: className, card_uid, email, phone }) => {
        const result = await db.query(
            `INSERT INTO students (student_id, full_name, class, card_uid, email, phone)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [student_id, full_name, className, card_uid, email, phone]
        );
        return result.rows[0];
    },

    update: async (id, data) => {
        const ALLOWED_COLUMNS = new Set(['full_name', 'class', 'card_uid', 'email', 'phone']);
        const entries = Object.entries(data).filter(([col]) => ALLOWED_COLUMNS.has(col));
        if (entries.length === 0) {
            const result = await db.query('SELECT * FROM students WHERE id = $1', [id]);
            return result.rows[0] || null;
        }
        const setClauses = entries.map(([col], i) => `"${col}" = $${i + 1}`);
        const values = entries.map(([, val]) => val);
        values.push(id);
        const result = await db.query(
            `UPDATE students SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length} RETURNING *`,
            values
        );
        return result.rows[0] || null;
    },
    delete: async (id) => {
        const result = await db.query(
            'UPDATE students SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
            [id]
        );
        return result.rows[0];
    },
};

module.exports = StudentModel;
