const DeviceKeyModel = require('../models/deviceKey.model');
const db = require('../config/db');

const DEVICE_ID_REGEX = /^[a-zA-Z0-9_-]{1,50}$/;
const HMAC_KEY_REGEX = /^[a-fA-F0-9]{64}$/;

const DeviceKeyController = {
    getAll: async (req, res, next) => {
        try {
            const devices = await DeviceKeyModel.findAll();
            res.json({ success: true, data: devices, count: devices.length });
        } catch (err) {
            next(err);
        }
    },

    create: async (req, res, next) => {
        try {
            const { device_id, hmac_key } = req.body;
            const device = await DeviceKeyModel.upsert({ device_id, hmac_key });
            const { hmac_key: _, ...safeDevice } = device;
            res.status(201).json({ success: true, data: safeDevice });
        } catch (err) {
            next(err);
        }
    },

    createBatch: async (req, res, next) => {
        const client = await db.getClient();
        try {
            const { keys } = req.body;

            if (typeof keys !== 'string') {
                return res.status(400).json({ success: false, message: 'keys must be a string' });
            }

            const entries = keys.split(',').map(s => s.trim()).filter(Boolean);
            const results = { provisioned: [], errors: [] };

            for (const entry of entries) {
                const colonIdx = entry.indexOf(':');
                if (colonIdx === -1) {
                    results.errors.push({ entry, reason: 'Missing colon separator' });
                    continue;
                }

                const device_id = entry.slice(0, colonIdx).trim();
                const hmac_key = entry.slice(colonIdx + 1).trim();

                if (!device_id || !hmac_key || !DEVICE_ID_REGEX.test(device_id) || !HMAC_KEY_REGEX.test(hmac_key)) {
                    results.errors.push({ entry, reason: 'Invalid format' });
                    continue;
                }

                results.provisioned.push(device_id);
            }

            if (results.errors.length > 0 && results.provisioned.length === 0) {
                return res.status(400).json({ success: false, data: results });
            }

            await client.query('BEGIN');
            // FIXME: CWE-252 Unchecked Return Value: entries.find returns undefined if there are spaces around the colon (e.g. "ESP32 : key"), throwing TypeError and crashing the server inside a database transaction.
            for (const device_id of results.provisioned) {
                const entry = entries.find(e => e.startsWith(`${device_id}:`));
                const colonIdx = entry.indexOf(':');
                const hmac_key = entry.slice(colonIdx + 1).trim();
                await DeviceKeyModel.upsert({ device_id, hmac_key }, client);
            }
            await client.query('COMMIT');

            res.status(201).json({ success: true, data: results });
        } catch (err) {
            await client.query('ROLLBACK');
            next(err);
        } finally {
            client.release();
        }
    },

    delete: async (req, res, next) => {
        try {
            const { deviceId } = req.params;

            const device = await DeviceKeyModel.delete(deviceId);
            if (!device) {
                return res.status(404).json({
                    success: false,
                    message: 'Device not found',
                });
            }

            res.json({ success: true, message: `Device ${deviceId} deleted` });
        } catch (err) {
            next(err);
        }
    },
};

module.exports = DeviceKeyController;
