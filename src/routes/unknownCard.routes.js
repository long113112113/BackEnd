const express = require('express');
const router = express.Router();
const UnknownCardController = require('../controllers/unknownCard.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { cardUidParam } = require('../validations/unknownCard.validation');

router.get('/', authMiddleware, UnknownCardController.getAll);
router.delete('/:cardUid', authMiddleware, validate(cardUidParam), UnknownCardController.delete);

module.exports = router;
