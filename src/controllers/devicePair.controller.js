const DevicePairModel = require('../models/devicePair.model');
const DeviceKeyModel = require('../models/deviceKey.model');

const DevicePairController = {
    list: async (req, res, next) => {
        try {
            const active = req.query.active === undefined
                ? undefined
                : req.query.active === 'true';
            const classroom = typeof req.query.classroom === 'string' ? req.query.classroom : undefined;
            const rows = await DevicePairModel.list({ active, classroom });
            res.json({ success: true, data: rows, count: rows.length });
        } catch (err) {
            next(err);
        }
    },

    get: async (req, res, next) => {
        try {
            const id = parseInt(req.params.id, 10);
            const row = await DevicePairModel.findById(id);
            if (!row) {
                return res.status(404).json({ success: false, message: 'Pair not found' });
            }
            res.json({ success: true, data: row });
        } catch (err) {
            next(err);
        }
    },

    create: async (req, res, next) => {
        try {
            const { nfc_device_id, cam_device_id, classroom, active } = req.body;

            // Verify both devices exist and set role=cam for cam_device
            const nfc = await DeviceKeyModel.findByDeviceId(nfc_device_id);
            if (!nfc) {
                return res.status(400).json({ success: false, message: `Unknown nfc_device_id=${nfc_device_id}` });
            }
            const cam = await DeviceKeyModel.findByDeviceId(cam_device_id);
            if (!cam) {
                return res.status(400).json({ success: false, message: `Unknown cam_device_id=${cam_device_id}` });
            }

            if (cam.role !== 'cam') {
                await DeviceKeyModel.setRole(cam_device_id, 'cam');
            }

            const row = await DevicePairModel.create({
                nfc_device_id,
                cam_device_id,
                classroom,
                active,
            });
            res.status(201).json({ success: true, data: row });
        } catch (err) {
            next(err);
        }
    },

    update: async (req, res, next) => {
        try {
            const id = parseInt(req.params.id, 10);
            const existing = await DevicePairModel.findById(id);
            if (!existing) {
                return res.status(404).json({ success: false, message: 'Pair not found' });
            }
            if (req.body.cam_device_id) {
                const cam = await DeviceKeyModel.findByDeviceId(req.body.cam_device_id);
                if (!cam) {
                    return res.status(400).json({ success: false, message: `Unknown cam_device_id=${req.body.cam_device_id}` });
                }
                if (cam.role !== 'cam') {
                    await DeviceKeyModel.setRole(req.body.cam_device_id, 'cam');
                }
            }
            const row = await DevicePairModel.update(id, req.body);
            res.json({ success: true, data: row });
        } catch (err) {
            next(err);
        }
    },

    delete: async (req, res, next) => {
        try {
            const id = parseInt(req.params.id, 10);
            const row = await DevicePairModel.delete(id);
            if (!row) {
                return res.status(404).json({ success: false, message: 'Pair not found' });
            }
            res.json({ success: true, message: `Pair ${id} deleted` });
        } catch (err) {
            next(err);
        }
    },
};

module.exports = DevicePairController;
