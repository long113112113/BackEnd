/**
 * ==========================================
 * MIDDLEWARE: XÁC THỰC JWT
 * ==========================================
 * Kiểm tra token trong header Authorization.
 * Dùng cho các route cần đăng nhập.
 */

const jwt = require('jsonwebtoken');
const config = require('../config');

const authMiddleware = (req, res, next) => {
    try {
        // Lấy token từ header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Không có token xác thực. Vui lòng đăng nhập.',
            });
        }

        const token = authHeader.split(' ')[1];

        // Xác thực token
        const decoded = jwt.verify(token, config.jwt.secret);
        req.user = decoded; // Gắn thông tin user vào request
        next();
    } catch (err) {
        return res.status(401).json({
            success: false,
            message: 'Token không hợp lệ hoặc đã hết hạn.',
        });
    }
};

module.exports = authMiddleware;
