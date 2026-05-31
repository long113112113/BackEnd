const { doubleCsrf } = require('csrf-csrf');

const CSRF_SECRET = process.env.CSRF_SECRET;
if (!CSRF_SECRET) {
    throw new Error('CSRF_SECRET environment variable is required');
}

const isProd = process.env.NODE_ENV === 'production';

const SKIP_CSRF_PATHS = ['/api/auth/refresh', '/api/auth/logout'];

const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
    getSecret: () => CSRF_SECRET,
    getSessionIdentifier: (req) => req.ip || 'static',
    cookieName: isProd ? '__Host-csrf-token' : 'csrf-token',
    cookieOptions: {
        httpOnly: true,
        sameSite: isProd ? 'none' : 'lax',
        secure: isProd,
        path: '/',
    },
    size: 64,
    ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
    getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'],
    skipCsrfProtection: (req) => SKIP_CSRF_PATHS.includes(req.path),
});

module.exports = { doubleCsrfProtection, generateCsrfToken };
