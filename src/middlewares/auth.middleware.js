const jwt = require('jsonwebtoken');
const config = require('../config');
const UserModel = require('../models/user.model');

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

        const decoded = jwt.verify(token, config.jwt.secret);

        const user = await UserModel.findById(decoded.id);
        if (!user || !user.is_active) {
            return res.status(401).json({
                success: false,
                message: 'Account is disabled or does not exist.',
            });
        }

        req.user = decoded;
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

module.exports = authMiddleware;
