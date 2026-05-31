const express = require('express');
const router = express.Router();
const UnknownCardController = require('../controllers/unknownCard.controller');
const { authMiddleware, requireAdmin } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { cardUidParam, autocompleteQuery } = require('../validations/unknownCard.validation');

router.get('/', authMiddleware, requireAdmin, UnknownCardController.getAll);
router.get('/autocomplete', authMiddleware, requireAdmin, validate(autocompleteQuery), UnknownCardController.autocomplete);
router.delete('/:cardUid', authMiddleware, requireAdmin, validate(cardUidParam), UnknownCardController.delete);

module.exports = router;
