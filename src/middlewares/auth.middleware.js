const jwt = require('jsonwebtoken');
const config = require('../config');

const authMiddleware = (req, res, next) => {
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
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired token.',
        });
    }
};

module.exports = authMiddleware;
