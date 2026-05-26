const express = require('express');
const router = express.Router();
const DeviceKeyController = require('../controllers/deviceKey.controller');
const { authMiddleware, requireAdmin } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { createDeviceKey, createBatch, deviceIdParam } = require('../validations/deviceKey.validation');

router.get('/', authMiddleware, requireAdmin, DeviceKeyController.getAll);
router.post('/', authMiddleware, requireAdmin, validate(createDeviceKey), DeviceKeyController.create);
router.post('/batch', authMiddleware, requireAdmin, validate(createBatch), DeviceKeyController.createBatch);
router.delete('/:deviceId', authMiddleware, requireAdmin, validate(deviceIdParam), DeviceKeyController.delete);

module.exports = router;
