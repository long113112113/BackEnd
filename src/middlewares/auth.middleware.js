const jwt = require('jsonwebtoken');
const config = require('../config');
const UserModel = require('../models/user.model');

const VALID_ROLES = ['admin', 'manager'];

const userCache = new Map();
const CACHE_TTL = 60_000;

const CACHE_CLEANUP_INTERVAL = 60_000;
const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [userId, entry] of userCache) {
        if (now - entry.ts > CACHE_TTL) {
            userCache.delete(userId);
        }
    }
}, CACHE_CLEANUP_INTERVAL);
cleanupInterval.unref();

const getCachedUser = async (userId) => {
    const cached = userCache.get(userId);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.user;
    const user = await UserModel.findById(userId);
    if (user) userCache.set(userId, { user, ts: Date.now() });
    return user;
};

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

        const decoded = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });

        if (!VALID_ROLES.includes(decoded.role)) {
            return res.status(403).json({
                success: false,
                message: 'Invalid role.',
            });
        }

        const user = await getCachedUser(decoded.id);
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

const requireManagerOrAdmin = (req, res, next) => {
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
        return res.status(403).json({
            success: false,
            message: 'Access denied. Admin or Manager role required.',
        });
    }
    next();
};

const destroyCache = () => {
    clearInterval(cleanupInterval);
    userCache.clear();
};

module.exports = { authMiddleware, requireAdmin, requireManagerOrAdmin, destroyCache };
