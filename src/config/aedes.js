const os = require('os');
const net = require('net');
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
const MQTT_USERNAME = requiredEnv('MQTT_USERNAME');
const MQTT_PASSWORD = requiredEnv('MQTT_PASSWORD');
const MQTT_INTERNAL_USERNAME = requiredEnv('MQTT_INTERNAL_USERNAME');
const MQTT_INTERNAL_PASSWORD = requiredEnv('MQTT_INTERNAL_PASSWORD');
const TOPIC_PREFIX = requiredEnv('MQTT_TOPIC_PREFIX');

let aedesInstance = null;
let server = null;

const start = async () => {
    const { Aedes } = await import('aedes');
    aedesInstance = await Aedes.createBroker({
        authenticate: (client, username, password, callback) => {
            const pwd = password?.toString();
            const isEsp32 = (username === MQTT_USERNAME && pwd === MQTT_PASSWORD);
            const isInternal = (username === MQTT_INTERNAL_USERNAME && pwd === MQTT_INTERNAL_PASSWORD);

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

        server.listen(MQTT_PORT, () => {
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
