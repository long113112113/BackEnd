const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/auth.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { login } = require('../validations/auth.validation');
const { rateLimit } = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 5, // Limit each IP to 5 login requests per windowMs
    message: { success: false, message: 'Too many login attempts from this IP, please try again after 15 minutes' }
});

router.post('/login', loginLimiter, validate(login), AuthController.login);
router.post('/logout', AuthController.logout);
router.post('/refresh', AuthController.refresh);
router.get('/me', authMiddleware, AuthController.getMe);

module.exports = router;
