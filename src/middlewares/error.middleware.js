

const errorHandler = (err, req, res, next) => {
    console.error('[Error]', err.message);

    const statusCode = err.statusCode || 500;
    const message = (statusCode >= 500 && process.env.NODE_ENV !== 'development')
        ? 'Internal server error'
        : (err.message || 'Internal server error');

    res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
};

const notFoundHandler = (req, res, next) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.originalUrl} not found`,
    });
};

module.exports = {
    errorHandler,
    notFoundHandler,
};
