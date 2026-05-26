const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const UserModel = require('../models/user.model');

const VALID_ROLES = ['admin', 'user'];

const tokenBlacklist = new Set();

const addToBlacklist = (token) => {
    tokenBlacklist.add(token);
    try {
        const decoded = jwt.decode(token);
        if (decoded && decoded.exp) {
            const ttl = (decoded.exp * 1000) - Date.now();
            if (ttl > 0) setTimeout(() => tokenBlacklist.delete(token), ttl);
        }
    } catch {}
};

const isBlacklisted = (token) => tokenBlacklist.has(token);

const authMiddleware = async (req, res, next) => {
    try {
        const token = req.cookies?.token
            || (req.headers.authorization?.startsWith('Bearer ') && req.headers.authorization.split(' ')[1]);

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No authorization token provided. Please log in.',
            });
        }

        if (isBlacklisted(token)) {
            return res.status(401).json({
                success: false,
                message: 'Token has been revoked. Please log in again.',
            });
        }

        const decoded = jwt.verify(token, config.jwt.secret);

        if (!VALID_ROLES.includes(decoded.role)) {
            return res.status(403).json({
                success: false,
                message: 'Invalid role.',
            });
        }

        const user = await UserModel.findById(decoded.id);
        if (!user || !user.is_active) {
            return res.status(401).json({
                success: false,
                message: 'Account is disabled or does not exist.',
            });
        }

        req.user = {
            id: user.id,
            username: user.username,
            role: user.role,
        };
        req.token = token;
        next();
    } catch (err) {
        if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token.',
            });
        }
        next(err);
    }
};

const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Access denied. Admin role required.',
        });
    }
    next();
};

const clearBlacklist = () => {
    tokenBlacklist.clear();
};

module.exports = { authMiddleware, requireAdmin, addToBlacklist, clearBlacklist };
