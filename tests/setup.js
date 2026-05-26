require('dotenv').config();
const db = require('../src/config/db');
const initDatabase = require('../src/utils/initDb');

const cleanTables = async () => {
    await db.query('DELETE FROM attendance_records');
    await db.query('DELETE FROM unknown_cards');
    await db.query('DELETE FROM students');
    await db.query('DELETE FROM refresh_tokens');
    await db.query('DELETE FROM device_keys');
    await db.query('DELETE FROM users');
};

const reseedAdmin = async () => {
    const argon2 = require('argon2');
    const hashedPassword = await argon2.hash(process.env.ADMIN_PASSWORD || 'admin123');
    await db.query(
        `INSERT INTO users (username, email, password, full_name, role, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (username) DO UPDATE SET is_active = true`,
        [
            process.env.ADMIN_USERNAME || 'admin',
            process.env.ADMIN_EMAIL || 'admin@example.com',
            hashedPassword,
            'Administrator',
            'admin',
        ]
    );
};

beforeAll(async () => {
    await initDatabase();
    await cleanTables();
    await reseedAdmin();
}, 30000);

module.exports = { cleanTables, reseedAdmin };
