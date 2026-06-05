const express = require('express');
const router = express.Router();
const DevicePairController = require('../controllers/devicePair.controller');
const { authMiddleware, requireAdmin } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { createPair, updatePair, pairIdParam } = require('../validations/devicePair.validation');

router.get('/', authMiddleware, requireAdmin, DevicePairController.list);
router.get('/:id', authMiddleware, requireAdmin, validate(pairIdParam), DevicePairController.get);
router.post('/', authMiddleware, requireAdmin, validate(createPair), DevicePairController.create);
router.patch('/:id', authMiddleware, requireAdmin, validate(updatePair), DevicePairController.update);
router.delete('/:id', authMiddleware, requireAdmin, validate(pairIdParam), DevicePairController.delete);

module.exports = router;
