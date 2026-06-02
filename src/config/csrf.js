const crypto = require('crypto');
const { doubleCsrf } = require('csrf-csrf');

const CSRF_SECRET = process.env.CSRF_SECRET;
if (!CSRF_SECRET) {
    throw new Error('CSRF_SECRET environment variable is required');
}

const isProd = process.env.NODE_ENV === 'production';
const cookieSecure = process.env.COOKIE_SECURE === 'true';
const cookieSameSite = (isProd && process.env.COOKIE_SECURE !== 'false') ? 'none' : 'lax';

const SKIP_CSRF_PATHS = ['/api/auth/refresh', '/api/auth/logout'];

const SESSION_COOKIE_NAME = isProd && cookieSecure ? '__Host-session-id' : 'session-id';
const SESSION_COOKIE_OPTIONS = {
    httpOnly: true,
    sameSite: cookieSameSite,
    secure: cookieSecure,
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000,
};

const ensureSessionId = (req, res, next) => {
    if (!req.cookies?.[SESSION_COOKIE_NAME]) {
        const sessionId = crypto.randomBytes(32).toString('hex');
        res.cookie(SESSION_COOKIE_NAME, sessionId, SESSION_COOKIE_OPTIONS);
        req.cookies[SESSION_COOKIE_NAME] = sessionId;
    }
    next();
};

const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
    getSecret: () => CSRF_SECRET,
    getSessionIdentifier: (req) => req.cookies?.[SESSION_COOKIE_NAME] || 'static',
    cookieName: isProd ? '__Host-csrf-token' : 'csrf-token',
    cookieOptions: {
        httpOnly: true,
        sameSite: cookieSameSite,
        secure: cookieSecure,
        path: '/',
    },
    size: 64,
    ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
    getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'],
    skipCsrfProtection: (req) => SKIP_CSRF_PATHS.includes(req.path),
});

module.exports = { doubleCsrfProtection, generateCsrfToken, ensureSessionId };
