/**
 * ==========================================
 * MODEL: USERS (TÀI KHOẢN ADMIN)
 * ==========================================
 * Tương tác với bảng users trong database.
 */

const db = require('../config/db');

const UserModel = {
    /**
     * Tạo bảng users nếu chưa tồn tại
     */
    createTable: async () => {
        const sql = `
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,              -- Hash bằng bcrypt
                full_name VARCHAR(100),
                role VARCHAR(20) DEFAULT 'admin',            -- admin, teacher
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await db.query(sql);
        console.log('📋 Bảng users đã sẵn sàng');
    },

    /**
     * Tìm user theo username
     */
    findByUsername: async (username) => {
        const result = await db.query(
            'SELECT * FROM users WHERE username = $1 AND is_active = true',
            [username]
        );
        return result.rows[0] || null;
    },

    /**
     * Tìm user theo email
     */
    findByEmail: async (email) => {
        const result = await db.query(
            'SELECT * FROM users WHERE email = $1 AND is_active = true',
            [email]
        );
        return result.rows[0] || null;
    },

    /**
     * Tạo user mới
     */
    create: async ({ username, email, password, full_name, role }) => {
        const result = await db.query(
            `INSERT INTO users (username, email, password, full_name, role)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, username, email, full_name, role, created_at`,
            [username, email, password, full_name, role || 'admin']
        );
        return result.rows[0];
    },
};

module.exports = UserModel;
