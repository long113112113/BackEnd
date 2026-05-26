
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/user.model');
const config = require('../config');
const { addToBlacklist } = require('../middlewares/auth.middleware');

const setTokenCookie = (res, token) => {
    res.cookie('token', token, {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: config.jwt.maxAgeMs,
    });
};

const AuthController = {

    login: async (req, res, next) => {
        try {
            const { username, password } = req.body;

            const user = await UserModel.findByUsername(username);
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid username or password',
                });
            }

            const isMatch = await argon2.verify(user.password, password);
            if (!isMatch) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid username or password',
                });
            }

            const token = jwt.sign(
                { id: user.id, username: user.username, role: user.role },
                config.jwt.secret,
                { expiresIn: config.jwt.expiresIn }
            );

            setTokenCookie(res, token);

            res.json({
                success: true,
                data: {
                    user: {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        full_name: user.full_name,
                        role: user.role,
                    },
                },
            });
        } catch (err) {
            next(err);
        }
    },

    logout: async (req, res, next) => {
        try {
            const token = req.cookies?.token
                || (req.headers.authorization?.startsWith('Bearer ') && req.headers.authorization.split(' ')[1]);
            if (token) {
                addToBlacklist(token);
            }
            res.clearCookie('token', {
                httpOnly: true,
                secure: config.nodeEnv === 'production',
                sameSite: 'strict',
                path: '/',
            });
            res.json({ success: true, message: 'Logged out successfully' });
        } catch (err) {
            next(err);
        }
    },

    getMe: async (req, res, next) => {
        try {
            const user = await UserModel.findByUsername(req.user.username);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found',
                });
            }

            res.json({
                success: true,
                data: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    full_name: user.full_name,
                    role: user.role,
                },
            });
        } catch (err) {
            next(err);
        }
    },
};

module.exports = AuthController;
