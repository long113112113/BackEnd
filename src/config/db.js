const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});
pool.on('connect', () => {
    console.log('[Database] New connection established to Neon PostgreSQL');
});

pool.on('error', (err) => {
    console.error('[Database] Database connection error:', err.message);
});

const query = async (text, params) => {
    const start = Date.now();
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
        console.log('[Database] Query:', { text, duration: `${duration}ms`, rows: result.rowCount });
    }
    return result;
};
const testConnection = async () => {
    try {
        const result = await pool.query('SELECT NOW()');
        console.log('[Database] Connected successfully! Server time:', result.rows[0].now);
        return true;
    } catch (err) {
        console.error('[Database] Failed to connect to database:', err.message);
        return false;
    }
};

module.exports = {
    pool,
    query,
    testConnection,
};
