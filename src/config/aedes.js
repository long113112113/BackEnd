const os = require('os');
const net = require('net');
const crypto = require('crypto');
const logger = require('../utils/logger');

const requiredEnv = (name) => {
    const val = process.env[name];
    if (!val) {
        logger.error(`[MQTT] Missing required env variable: ${name}. Please set it in .env`);
        process.exit(1);
    }
    return val;
};

const MQTT_PORT = parseInt(process.env.MQTT_PORT, 10);
if (isNaN(MQTT_PORT) || MQTT_PORT < 1 || MQTT_PORT > 65535) {
    logger.error(`[MQTT] Invalid MQTT_PORT: ${process.env.MQTT_PORT}. Must be a number between 1 and 65535.`);
    process.exit(1);
}
const MQTT_USERNAME = requiredEnv('MQTT_USERNAME');
const MQTT_PASSWORD = requiredEnv('MQTT_PASSWORD');
const MQTT_INTERNAL_USERNAME = requiredEnv('MQTT_INTERNAL_USERNAME');
const MQTT_INTERNAL_PASSWORD = requiredEnv('MQTT_INTERNAL_PASSWORD');
const TOPIC_PREFIX = requiredEnv('MQTT_TOPIC_PREFIX');

let aedesInstance = null;
let server = null;

// NOTE: CWE-208: Can't happen (just ignore it).
const timingSafeEqual = (a, b) => {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
};

const start = async () => {
    const { Aedes } = await import('aedes');
    aedesInstance = await Aedes.createBroker({
        authenticate: (client, username, password, callback) => {
            const pwd = password?.toString();
            const isEsp32 = timingSafeEqual(username, MQTT_USERNAME) && timingSafeEqual(pwd, MQTT_PASSWORD);
            const isInternal = timingSafeEqual(username, MQTT_INTERNAL_USERNAME) && timingSafeEqual(pwd, MQTT_INTERNAL_PASSWORD);

            if (isEsp32 || isInternal) {
                client.isEsp32 = isEsp32;
                logger.info(`[MQTT] Auth OK: client=${client.id} role=${isEsp32 ? 'esp32' : 'internal'}`);
                callback(null, true);
            } else {
                logger.info(`[MQTT] Auth DENIED: client=${client.id} username=${username}`);
                callback(null, false);
            }
        },
        authorizePublish: (client, packet, callback) => {
            if (!client || !client.id) {
                return callback(new Error('Unauthorized publish'));
            }
            if (client.isEsp32 && packet.topic.startsWith(`${TOPIC_PREFIX}/attendance/result`)) {
                return callback(new Error('ESP32 cannot publish to result topic'));
            }
            callback(null);
        },
        authorizeSubscribe: (client, sub, callback) => {
            if (!client || !client.id) {
                return callback(new Error('Unauthorized subscribe'));
            }
            if (client.isEsp32) {
                const ownTopic = `${TOPIC_PREFIX}/attendance/result/${client.id}`;
                if (sub.topic !== ownTopic) {
                    return callback(new Error(`Subscribe denied: ESP32 can only subscribe to ${ownTopic}`));
                }
            }
            callback(null, sub);
        },
    });

    aedesInstance.on('client', (client) => {
        logger.info(`[MQTT] Client connected: ${client.id}`);
    });

    aedesInstance.on('clientDisconnect', (client) => {
        logger.info(`[MQTT] Client disconnected: ${client.id}`);
    });

    aedesInstance.on('publish', (packet, client) => {
        if (client) {
            logger.info(`[MQTT] Publish: topic=${packet.topic} from=${client.id}`);
        }
    });

    return new Promise((resolve, reject) => {
        server = net.createServer(aedesInstance.handle);

        const MQTT_BIND = process.env.MQTT_BIND_ADDRESS || '127.0.0.1';
        if (MQTT_BIND === '0.0.0.0') {
            logger.warn('[MQTT] WARNING: Broker is binding to 0.0.0.0 (all interfaces). This exposes the broker to external networks.');
        }
        server.listen(MQTT_PORT, MQTT_BIND, () => {
            const nets = os.networkInterfaces();
            let brokerIp = 'localhost';
            for (const name of Object.keys(nets)) {
                for (const net of nets[name]) {
                    if (net.family === 'IPv4' && !net.internal) {
                        brokerIp = net.address;
                    }
                }
            }

            logger.info(`[MQTT] Broker (Aedes) is running at mqtt://${brokerIp}:${MQTT_PORT}`);
            resolve(server);
        });

        server.on('error', (err) => {
            reject(err);
        });
    });
};

const getInstance = () => aedesInstance;
const getServer = () => server;

const stop = () => {
    return new Promise((resolve) => {
        if (server) {
            server.close(() => {
                logger.info('[MQTT] Broker stopped.');
                resolve();
            });
        } else {
            resolve();
        }
    });
};

module.exports = { start, stop, getInstance, getServer };
