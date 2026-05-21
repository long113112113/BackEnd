const os = require('os');
const net = require('net');

const MQTT_PORT = parseInt(process.env.MQTT_PORT, 10);
const MQTT_USERNAME = process.env.MQTT_USERNAME || 'esp32_device';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || 'esp32_secret_2024';
const MQTT_INTERNAL_USERNAME = 'internal_broker';
const MQTT_INTERNAL_PASSWORD = 'internal_broker_secret_2024';
const TOPIC_PREFIX = process.env.MQTT_TOPIC_PREFIX || 'hutech_lms';

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
                console.log(`[MQTT] Auth OK: client=${client.id} role=${isEsp32 ? 'esp32' : 'internal'}`);
                callback(null, true);
            } else {
                console.log(`[MQTT] Auth DENIED: client=${client.id} username=${username}`);
                callback(null, false);
            }
        },
        authorizePublish: (client, packet, callback) => {
            if (!client || !client.id) {
                return callback(new Error('Unauthorized publish'));
            }
            if (client.isEsp32 && packet.topic.startsWith(`${TOPIC_PREFIX}/attendance/result/`)) {
                return callback(new Error('ESP32 cannot publish to result topic'));
            }
            callback(null);
        },
    });

    aedesInstance.on('client', (client) => {
        console.log(`[MQTT] Client connected: ${client.id}`);
    });

    aedesInstance.on('clientDisconnect', (client) => {
        console.log(`[MQTT] Client disconnected: ${client.id}`);
    });

    aedesInstance.on('publish', (packet, client) => {
        if (client) {
            console.log(`[MQTT] Publish: topic=${packet.topic} from=${client.id}`);
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

            console.log(`[MQTT] Broker (Aedes) is running at mqtt://${brokerIp}:${MQTT_PORT}`);
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
                console.log('[MQTT] Broker stopped.');
                resolve();
            });
        } else {
            resolve();
        }
    });
};

module.exports = { start, stop, getInstance, getServer };
