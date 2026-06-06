const { rateLimit } = require('express-rate-limit');

// Rate limiting middleware for authentication routes to prevent brute-force attacks
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 login requests per `window` (here, per 15 minutes)
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    handler: (req, res, next, options) => {
        res.status(options.statusCode).json({
            success: false,
            message: 'Too many login attempts from this IP, please try again after 15 minutes.',
        });
    },
});

module.exports = {
    loginLimiter,
};
