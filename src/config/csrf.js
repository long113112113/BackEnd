const { doubleCsrf } = require('csrf-csrf');

const CSRF_SECRET = process.env.CSRF_SECRET;
if (!CSRF_SECRET) {
    throw new Error('CSRF_SECRET environment variable is required');
}

const { doubleCsrfProtection, generateToken } = doubleCsrf({
    getSecret: () => CSRF_SECRET,
    cookieName: '__Host-csrf-token',
    cookieOptions: {
        httpOnly: true,
        sameSite: 'none',
        secure: true,
        path: '/',
    },
    size: 64,
    ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
    getTokenFromRequest: (req) => req.headers['x-csrf-token'],
});

module.exports = { doubleCsrfProtection, generateToken };
