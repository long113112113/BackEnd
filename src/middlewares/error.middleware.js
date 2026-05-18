/**
 * ==========================================
 * MIDDLEWARE: XỬ LÝ LỖI TẬP TRUNG
 * ==========================================
 * Bắt tất cả lỗi và trả response thống nhất.
 */

const errorHandler = (err, req, res, next) => {
    console.error('❌ Error:', err.message);

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Lỗi server nội bộ';

    res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
};

/**
 * Middleware xử lý route không tồn tại (404)
 */
const notFoundHandler = (req, res, next) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.originalUrl} không tồn tại`,
    });
};

module.exports = {
    errorHandler,
    notFoundHandler,
};
