/**
 * ==========================================
 * ROUTES: AUTH (XÁC THỰC)
 * ==========================================
 */

const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/auth.controller');
const authMiddleware = require('../middlewares/auth.middleware');

router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.get('/me', authMiddleware, AuthController.getMe);

module.exports = router;
