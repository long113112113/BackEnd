const db = require('../config/db');

const DeviceKeyModel = {
    createTable: async () => {
        const sql = `
            CREATE TABLE IF NOT EXISTS device_keys (
                id SERIAL PRIMARY KEY,
                device_id VARCHAR(50) UNIQUE NOT NULL,
                hmac_key VARCHAR(128) NOT NULL,
                last_seq BIGINT DEFAULT 0,
                role VARCHAR(16) DEFAULT 'nfc',
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            ALTER TABLE device_keys
                ADD COLUMN IF NOT EXISTS role VARCHAR(16) DEFAULT 'nfc';
        `;
        await db.query(sql);
    },

    findByDeviceId: async (deviceId) => {
        const result = await db.query(
            `SELECT * FROM device_keys WHERE device_id = $1`,
            [deviceId]
        );
        return result.rows[0] || null;
    },

    setRole: async (deviceId, role) => {
        const result = await db.query(
            `UPDATE device_keys SET role = $2, updated_at = CURRENT_TIMESTAMP
             WHERE device_id = $1 RETURNING *`,
            [deviceId, role]
        );
        return result.rows[0] || null;
    },

    upsert: async ({ device_id, hmac_key }, client) => {
        const executor = client || db;
        const result = await executor.query(
            `INSERT INTO device_keys (device_id, hmac_key)
             VALUES ($1, $2)
             ON CONFLICT (device_id)
             DO UPDATE SET hmac_key = EXCLUDED.hmac_key,
                           updated_at = CURRENT_TIMESTAMP
             WHERE device_keys.hmac_key IS DISTINCT FROM EXCLUDED.hmac_key
             RETURNING *`,
            [device_id, hmac_key]
        );
        if (result.rows[0]) return result.rows[0];
        const row = await executor.query(
            'SELECT * FROM device_keys WHERE device_id = $1',
            [device_id]
        );
        return row.rows[0] || null;
    },

    registerCamera: async (deviceId) => {
        const dummyKey = '0'.repeat(64);
        const result = await db.query(
            `INSERT INTO device_keys (device_id, hmac_key, role)
             VALUES ($1, $2, 'cam')
             ON CONFLICT (device_id) DO NOTHING
             RETURNING *`,
            [deviceId, dummyKey]
        );
        return result.rows[0] || null;
    },

    updateLastSeq: async (deviceId, seq) => {
        await db.query(
            `UPDATE device_keys
             SET last_seq = $2, updated_at = CURRENT_TIMESTAMP
             WHERE device_id = $1`,
            [deviceId, seq]
        );
    },

    updateLastSeqAtomic: async (deviceId, seq) => {
        const result = await db.query(
            `UPDATE device_keys
             SET last_seq = $2, updated_at = CURRENT_TIMESTAMP
             WHERE device_id = $1 AND $2 > last_seq`,
            [deviceId, seq]
        );
        return result.rowCount > 0;
    },

    findAll: async () => {
        const result = await db.query(
            `SELECT id, device_id, last_seq, role, created_at, updated_at
             FROM device_keys
             ORDER BY created_at DESC`
        );
        return result.rows;
    },

    delete: async (deviceId) => {
        const result = await db.query(
            `DELETE FROM device_keys WHERE device_id = $1 RETURNING id, device_id`,
            [deviceId]
        );
        return result.rows[0] || null;
    },
};

module.exports = DeviceKeyModel;
