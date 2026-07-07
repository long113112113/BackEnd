const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/auth.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { login } = require('../validations/auth.validation');
const { loginRateLimiter } = require('../middlewares/rateLimit.middleware');

router.post('/login', loginRateLimiter, validate(login), AuthController.login);
router.post('/logout', AuthController.logout);
router.post('/refresh', AuthController.refresh);
router.get('/me', authMiddleware, AuthController.getMe);

module.exports = router;
