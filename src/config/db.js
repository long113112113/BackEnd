const { Pool } = require('pg');
const logger = require('../utils/logger');

const connectionString = process.env.DATABASE_URL;
const sslConfig = process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false'
    ? { rejectUnauthorized: false }
    : {};

const pool = new Pool({
    connectionString,
    ssl: Object.keys(sslConfig).length > 0 ? sslConfig : undefined,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});
pool.on('connect', () => {
    logger.info('[Database] New connection established to Neon PostgreSQL');
});

pool.on('error', (err) => {
    logger.error('[Database] Database connection error:', err.message);
});

const query = async (text, params) => {
    const start = Date.now();
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
        logger.info('[Database] Query:', { text, duration: `${duration}ms`, rows: result.rowCount });
    }
    return result;
};
const testConnection = async () => {
    try {
        const result = await pool.query('SELECT NOW()');
        logger.info('[Database] Connected successfully! Server time:', result.rows[0].now);
        return true;
    } catch (err) {
        logger.error('[Database] Failed to connect to database:', err.message);
        return false;
    }
};

module.exports = {
    pool,
    query,
    testConnection,
    getClient: () => pool.connect(),
    closePool: () => pool.end(),
};
