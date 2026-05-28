const crypto = require('crypto');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/user.model');
const RefreshTokenModel = require('../models/refreshToken.model');
const config = require('../config');

const setTokenCookie = (res, token, maxAge) => {
    res.cookie('token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/',
        maxAge,
    });
};

const setRefreshCookie = (res, token, maxAge) => {
    res.cookie('refresh_token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/api/auth/refresh',
        maxAge,
    });
};

const clearAuthCookies = (res) => {
    res.clearCookie('token', {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/',
    });
    res.clearCookie('refresh_token', {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/api/auth/refresh',
    });
};

const generateAccessToken = (user) => {
    return jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        config.jwt.secret,
        { expiresIn: config.jwt.accessExpiresIn }
    );
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

            const accessToken = generateAccessToken(user);
            const { rawToken: refreshToken } = await RefreshTokenModel.create(
                user.id,
                config.jwt.refreshMaxAgeMs
            );

            setTokenCookie(res, accessToken, config.jwt.accessMaxAgeMs);
            setRefreshCookie(res, refreshToken, config.jwt.refreshMaxAgeMs);

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
            const refreshTokenRaw = req.cookies?.refresh_token;
            if (refreshTokenRaw) {
                const tokenHash = crypto.createHash('sha256').update(refreshTokenRaw).digest('hex');
                await RefreshTokenModel.deleteByHash(tokenHash);
            }
            clearAuthCookies(res);
            res.json({ success: true, message: 'Logged out successfully' });
        } catch (err) {
            next(err);
        }
    },

    refresh: async (req, res, next) => {
        try {
            const refreshTokenRaw = req.cookies?.refresh_token;
            if (!refreshTokenRaw) {
                return res.status(401).json({
                    success: false,
                    message: 'No refresh token provided.',
                });
            }

            const tokenHash = crypto.createHash('sha256').update(refreshTokenRaw).digest('hex');
            const exchanged = await RefreshTokenModel.exchange(
                tokenHash,
                config.jwt.refreshMaxAgeMs
            );

            if (!exchanged) {
                clearAuthCookies(res);
                return res.status(401).json({
                    success: false,
                    message: 'Invalid or expired refresh token. Please log in again.',
                });
            }

            const accessToken = generateAccessToken({
                id: exchanged.user.user_id,
                username: exchanged.user.username,
                role: exchanged.user.role
            });

            setTokenCookie(res, accessToken, config.jwt.accessMaxAgeMs);
            setRefreshCookie(res, exchanged.rawToken, config.jwt.refreshMaxAgeMs);

            res.json({
                success: true,
                message: 'Token refreshed successfully',
            });
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