const crypto = require('crypto');
const db = require('../config/db');

const RefreshTokenModel = {
    createTable: async () => {
        const sql = `
            CREATE TABLE IF NOT EXISTS refresh_tokens (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                token_hash VARCHAR(128) UNIQUE NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id
                ON refresh_tokens(user_id);
            CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at
                ON refresh_tokens(expires_at);
        `;
        await db.query(sql);
    },

    create: async (userId, ttlMs) => {
        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + ttlMs);

        await db.query(
            `WITH deleted AS (
                DELETE FROM refresh_tokens WHERE user_id = $1
            )
            INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
            VALUES ($1, $2, $3)`,
            [userId, tokenHash, expiresAt]
        );

        return { rawToken, tokenHash, expiresAt };
    },

    exchange: async (oldTokenHash, ttlMs) => {
        const rawToken = crypto.randomBytes(32).toString('hex');
        const newTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + ttlMs);

        const result = await db.query(
            `WITH deleted AS (
                DELETE FROM refresh_tokens
                WHERE token_hash = $1 AND expires_at > NOW()
                RETURNING user_id
            ),
            user_check AS (
                SELECT d.user_id, u.username, u.role, u.is_active
                FROM deleted d
                JOIN users u ON d.user_id = u.id
            ),
            cleanup AS (
                DELETE FROM refresh_tokens
                WHERE user_id IN (SELECT user_id FROM user_check WHERE is_active = false)
            ),
            inserted AS (
                INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
                SELECT user_id, $2, $3
                FROM user_check
                WHERE is_active = true
                RETURNING user_id
            )
            SELECT i.user_id, uc.username, uc.role
            FROM inserted i
            JOIN user_check uc ON i.user_id = uc.user_id`,
            [oldTokenHash, newTokenHash, expiresAt]
        );

        if (result.rows.length === 0) return null;
        return { rawToken, user: result.rows[0] };
    },

    findByHash: async (tokenHash) => {
        const result = await db.query(
            `SELECT rt.*, u.username, u.role, u.is_active
             FROM refresh_tokens rt
             JOIN users u ON rt.user_id = u.id
             WHERE rt.token_hash = $1 AND rt.expires_at > NOW()`,
            [tokenHash]
        );
        return result.rows[0] || null;
    },

    deleteByHash: async (tokenHash) => {
        await db.query(
            `DELETE FROM refresh_tokens WHERE token_hash = $1`,
            [tokenHash]
        );
    },

    deleteAllForUser: async (userId) => {
        await db.query(
            `DELETE FROM refresh_tokens WHERE user_id = $1`,
            [userId]
        );
    },

    cleanupExpired: async () => {
        await db.query(
            `DELETE FROM refresh_tokens WHERE expires_at < NOW()`
        );
    },
};

module.exports = RefreshTokenModel;
