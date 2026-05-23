const DeviceKeyModel = require('../models/deviceKey.model');

const requireAdmin = (req, res) => {
    if (req.user.role !== 'admin') {
        res.status(403).json({
            success: false,
            message: 'Access denied. Admin role required.',
        });
        return false;
    }
    return true;
};

const DeviceKeyController = {
    getAll: async (req, res, next) => {
        try {
            if (!requireAdmin(req, res)) return;

            const devices = await DeviceKeyModel.findAll();
            res.json({ success: true, data: devices, count: devices.length });
        } catch (err) {
            next(err);
        }
    },

    create: async (req, res, next) => {
        try {
            if (!requireAdmin(req, res)) return;

            const { device_id, hmac_key } = req.body;
            const device = await DeviceKeyModel.upsert({ device_id, hmac_key });
            res.status(201).json({ success: true, data: device });
        } catch (err) {
            next(err);
        }
    },

    createBatch: async (req, res, next) => {
        try {
            if (!requireAdmin(req, res)) return;

            const { keys } = req.body;

            const entries = keys.split(',').map(s => s.trim()).filter(Boolean);
            const results = { provisioned: [], errors: [] };

            for (const entry of entries) {
                const colonIdx = entry.indexOf(':');
                const device_id = entry.slice(0, colonIdx).trim();
                const hmac_key = entry.slice(colonIdx + 1).trim();

                try {
                    await DeviceKeyModel.upsert({ device_id, hmac_key });
                    results.provisioned.push(device_id);
                } catch {
                    results.errors.push({ entry, reason: 'Database error' });
                }
            }

            res.status(201).json({
                success: true,
                data: results,
            });
        } catch (err) {
            next(err);
        }
    },

    delete: async (req, res, next) => {
        try {
            if (!requireAdmin(req, res)) return;

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
