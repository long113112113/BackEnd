const express = require('express');
const router = express.Router();
const UnknownCardController = require('../controllers/unknownCard.controller');
const authMiddleware = require('../middlewares/auth.middleware');

router.get('/', authMiddleware, UnknownCardController.getAll);
router.delete('/:cardUid', authMiddleware, UnknownCardController.delete);

module.exports = router;
