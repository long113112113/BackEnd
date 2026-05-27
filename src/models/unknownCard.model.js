const db = require('../config/db');
const logger = require('../utils/logger');

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
            CREATE INDEX IF NOT EXISTS idx_unknown_cards_latest_seen
                ON unknown_cards(latest_seen DESC);
        `;
        await db.query(sql);
        logger.info('[Database] Unknown cards table is ready.');
    },

    upsert: async (cardUID, deviceId) => {
        const result = await db.query(
            `INSERT INTO unknown_cards (card_uid, device_id, seen_count, latest_seen)
             VALUES ($1, $2, 1, CURRENT_TIMESTAMP)
             ON CONFLICT (card_uid)
             DO UPDATE SET seen_count = unknown_cards.seen_count + 1,
                           latest_seen = CURRENT_TIMESTAMP,
                           device_id = COALESCE(unknown_cards.device_id, $2)
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
