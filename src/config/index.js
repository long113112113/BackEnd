
const parseExpiresInMs = (str) => {
    if (!str) return 7 * 24 * 60 * 60 * 1000;
    const match = str.match(/^(\d+)([smhdwy])$/);
    if (!match) return 7 * 24 * 60 * 60 * 1000;
    const num = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000, y: 31536000000 };
    return num * (multipliers[unit] || 86400000);
};

const isProd = process.env.NODE_ENV === 'production';

module.exports = {
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV,
    clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
    jwt: {
        secret: process.env.JWT_SECRET,
        expiresIn: process.env.JWT_EXPIRES_IN,
        maxAgeMs: parseExpiresInMs(process.env.JWT_EXPIRES_IN),
        accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
        accessMaxAgeMs: parseExpiresInMs(process.env.JWT_ACCESS_EXPIRES_IN || '15m'),
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
        refreshMaxAgeMs: parseExpiresInMs(process.env.JWT_REFRESH_EXPIRES_IN || '7d'),
    },
    cookie: {
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
    },
};
