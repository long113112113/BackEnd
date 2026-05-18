const db = require('../config/db');

const UnknownCardModel = {
    createTable: async () => {
        const sql = `
            CREATE TABLE IF NOT EXISTS unknown_cards (
                id SERIAL PRIMARY KEY,
                card_uid VARCHAR(50) UNIQUE NOT NULL,
                device_id VARCHAR(50),
                first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                seen_count INTEGER DEFAULT 1,
                latest_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await db.query(sql);
        console.log('📋 Bảng unknown_cards đã sẵn sàng');
    },

    upsert: async (cardUID, deviceId) => {
        const result = await db.query(
            `INSERT INTO unknown_cards (card_uid, device_id, seen_count, latest_seen)
             VALUES ($1, $2, 1, CURRENT_TIMESTAMP)
             ON CONFLICT (card_uid)
             DO UPDATE SET seen_count = unknown_cards.seen_count + 1,
                           latest_seen = CURRENT_TIMESTAMP,
                           device_id = COALESCE($2, unknown_cards.device_id)
             RETURNING *`,
            [cardUID, deviceId]
        );
        return result.rows[0];
    },

    findAll: async () => {
        const result = await db.query(
            'SELECT * FROM unknown_cards ORDER BY latest_seen DESC'
        );
        return result.rows;
    },

    delete: async (cardUid) => {
        const result = await db.query(
            'DELETE FROM unknown_cards WHERE card_uid = $1 RETURNING *',
            [cardUid]
        );
        return result.rows[0];
    },
};

module.exports = UnknownCardModel;
