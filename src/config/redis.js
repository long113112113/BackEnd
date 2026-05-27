const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisClient = null;

const initRedis = async () => {
    const url = process.env.REDIS_URL;
    if (!url) {
        logger.info('[Redis] REDIS_URL not set. Using in-memory nonce store.');
        return null;
    }

    try {
        const client = new Redis(url, {
            maxRetriesPerRequest: 1,
            lazyConnect: true,
            retryStrategy: () => null,
        });

        await client.connect();
        await client.ping();

        logger.info('[Redis] Connected successfully.');
        return client;
    } catch (err) {
        logger.warn('[Redis] Failed to connect:', err.message, '- Falling back to in-memory store.');
        return null;
    }
};

const getClient = () => redisClient;

module.exports = { initRedis, getClient };
