const db = require('../config/db');

const DevicePairModel = {
    createTable: async () => {
        const sql = `
            CREATE TABLE IF NOT EXISTS device_pairs (
                id SERIAL PRIMARY KEY,
                nfc_device_id VARCHAR(50) REFERENCES device_keys(device_id) ON DELETE CASCADE,
                cam_device_id  VARCHAR(50) REFERENCES device_keys(device_id) ON DELETE CASCADE,
                classroom      VARCHAR(100),
                active         BOOLEAN DEFAULT true,
                created_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(nfc_device_id, cam_device_id)
            );

            CREATE INDEX IF NOT EXISTS idx_device_pairs_nfc
                ON device_pairs(nfc_device_id) WHERE active = true;
            CREATE INDEX IF NOT EXISTS idx_device_pairs_cam
                ON device_pairs(cam_device_id) WHERE active = true;
        `;
        await db.query(sql);
    },
    findByNfc: async (nfcDeviceId) => {
        const result = await db.query(
            `SELECT * FROM device_pairs
             WHERE nfc_device_id = $1 AND active = true
             ORDER BY created_at DESC LIMIT 1`,
            [nfcDeviceId]
        );
        return result.rows[0] || null;
    },

    findByCam: async (camDeviceId) => {
        const result = await db.query(
            `SELECT * FROM device_pairs
             WHERE cam_device_id = $1 AND active = true
             ORDER BY created_at DESC LIMIT 1`,
            [camDeviceId]
        );
        return result.rows[0] || null;
    },

    findById: async (id) => {
        const result = await db.query(
            `SELECT * FROM device_pairs WHERE id = $1`,
            [id]
        );
        return result.rows[0] || null;
    },

    list: async ({ active, classroom } = {}) => {
        const params = [];
        const conditions = [];
        let idx = 1;

        if (active !== undefined) {
            conditions.push(`active = $${idx++}`);
            params.push(active);
        }
        if (classroom) {
            conditions.push(`classroom = $${idx++}`);
            params.push(classroom);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const result = await db.query(
            `SELECT * FROM device_pairs ${where} ORDER BY created_at DESC`,
            params
        );
        return result.rows;
    },

    create: async ({ nfc_device_id, cam_device_id, classroom, active = true }) => {
        const result = await db.query(
            `INSERT INTO device_pairs (nfc_device_id, cam_device_id, classroom, active)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (nfc_device_id, cam_device_id)
             DO UPDATE SET classroom  = EXCLUDED.classroom,
                           active     = EXCLUDED.active,
                           updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [nfc_device_id, cam_device_id, classroom || null, active]
        );
        return result.rows[0];
    },

    update: async (id, fields) => {
        const sets = [];
        const params = [];
        let idx = 1;

        if (fields.classroom !== undefined) {
            sets.push(`classroom = $${idx++}`);
            params.push(fields.classroom);
        }
        if (fields.active !== undefined) {
            sets.push(`active = $${idx++}`);
            params.push(fields.active);
        }
        if (fields.cam_device_id !== undefined) {
            sets.push(`cam_device_id = $${idx++}`);
            params.push(fields.cam_device_id);
        }

        if (sets.length === 0) return null;

        sets.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(id);
        const result = await db.query(
            `UPDATE device_pairs SET ${sets.join(', ')}
             WHERE id = $${idx}
             RETURNING *`,
            params
        );
        return result.rows[0] || null;
    },

    delete: async (id) => {
        const result = await db.query(
            `DELETE FROM device_pairs WHERE id = $1 RETURNING id`,
            [id]
        );
        return result.rows[0] || null;
    },
};

module.exports = DevicePairModel;
