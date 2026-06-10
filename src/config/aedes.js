const os = require('os');
const net = require('net');
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer, createWebSocketStream } = require('ws');
const logger = require('../utils/logger');
const DeviceKeyModel = require('../models/deviceKey.model');

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

const MQTT_WS_PORT = parseInt(process.env.MQTT_WS_PORT || '8083', 10);
if (isNaN(MQTT_WS_PORT) || MQTT_WS_PORT < 1 || MQTT_WS_PORT > 65535) {
    logger.error(`[MQTT] Invalid MQTT_WS_PORT: ${process.env.MQTT_WS_PORT}. Must be a number between 1 and 65535.`);
    process.exit(1);
}

const MQTT_USERNAME = requiredEnv('MQTT_USERNAME');
const MQTT_PASSWORD = requiredEnv('MQTT_PASSWORD');
const MQTT_INTERNAL_USERNAME = requiredEnv('MQTT_INTERNAL_USERNAME');
const MQTT_INTERNAL_PASSWORD = requiredEnv('MQTT_INTERNAL_PASSWORD');
const TOPIC_PREFIX = requiredEnv('MQTT_TOPIC_PREFIX');
const MQTT_BIND_ADDRESS = process.env.MQTT_BIND_ADDRESS || '127.0.0.1';
const MQTT_WS_BIND_ADDRESS = process.env.MQTT_WS_BIND_ADDRESS || '0.0.0.0';

let aedesInstance = null;
let tcpServer = null;
let httpServer = null;
let wsServer = null;

// Prevent CWE-208 timing leaks by hashing inputs before comparison
const timingSafeEqual = (a, b) => {
    const hashA = crypto.createHash('sha256').update(String(a)).digest();
    const hashB = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(hashA, hashB);
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
            if (client.isEsp32 && packet.topic.startsWith(`${TOPIC_PREFIX}/face/`)) {
                return callback(new Error('ESP32 cannot publish to face topics'));
            }
            callback(null);
        },
        authorizeSubscribe: (client, sub, callback) => {
            if (!client || !client.id) {
                return callback(new Error('Unauthorized subscribe'));
            }
            if (client.isEsp32) {
                const ownResultTopic = `${TOPIC_PREFIX}/attendance/result/${client.id}`;
                const ownFaceTopic   = `${TOPIC_PREFIX}/face/capture/${client.id}`;
                if (sub.topic !== ownResultTopic && sub.topic !== ownFaceTopic) {
                    return callback(new Error(`Subscribe denied: ESP32 can only subscribe to ${ownResultTopic} or ${ownFaceTopic}`));
                }

                if (sub.topic === ownFaceTopic) {
                    DeviceKeyModel.registerCamera(client.id).then(registered => {
                        if (registered) {
                            logger.info(`[MQTT] Auto-registered camera device_id=${client.id}`);
                        }
                    }).catch(err => {
                        logger.error(`[MQTT] Auto-register failed for device_id=${client.id}: ${err.message}`);
                    });
                }
            }
            callback(null, sub);
        },
    });

    aedesInstance.on('client', (client) => {
        // NOTE: client.conn is the underlying Duplex stream. TCP connections
        // are net.Socket instances; WebSocket connections are ws stream
        // wrappers (a subclass of stream.Duplex produced by createWebSocketStream).
        // We detect transport by checking for the WebSocket-specific property
        // set when the stream was created.
        const transport = client.conn && client.conn.aedesTags && client.conn.aedesTags.transport
            ? client.conn.aedesTags.transport
            : 'tcp';
        logger.info(`[MQTT] Client connected: ${client.id} transport=${transport}`);
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
        // === TCP server (internal, localhost only) ===
        tcpServer = net.createServer(aedesInstance.handle);

        const isTcpPublicBind = MQTT_BIND_ADDRESS === '0.0.0.0' || MQTT_BIND_ADDRESS === '::';
        if (isTcpPublicBind) {
            const isProd = process.env.NODE_ENV === 'production';
            const allowed = process.env.MQTT_ALLOW_PUBLIC_BIND === 'true';
            if (isProd && !allowed) {
                logger.error(
                    '[MQTT] FATAL: Refusing to bind TCP to public interface in production. ' +
                    'Set MQTT_BIND_ADDRESS to 127.0.0.1, ' +
                    'or set MQTT_ALLOW_PUBLIC_BIND=true to override.'
                );
                process.exit(1);
            }
            logger.warn('[MQTT] WARNING: TCP binding to public interface.');
        }

        tcpServer.listen(MQTT_PORT, MQTT_BIND_ADDRESS, () => {
            logger.info(`[MQTT] Broker (Aedes) TCP listening on ${MQTT_BIND_ADDRESS}:${MQTT_PORT}`);
        });

        tcpServer.on('error', (err) => reject(err));

        // === HTTP + WebSocket server (for ESP32 / external clients) ===
        httpServer = http.createServer();
        wsServer = new WebSocketServer({ server: httpServer });

        wsServer.on('connection', (websocket, req) => {
            const remoteAddr = req.socket.remoteAddress;
            logger.info(`[MQTT] WebSocket connection from ${remoteAddr}`);
            // NOTE: aedes.tags is undocumented but is the supported way to pass
            // metadata about the underlying transport to the authenticate hook
            // via the aedes client object. We tag the stream so the auth log
            // can distinguish ws vs tcp connections.
            const stream = createWebSocketStream(websocket);
            stream.aedesTags = { transport: 'ws' };
            aedesInstance.handle(stream, req);
        });

        wsServer.on('error', (err) => reject(err));

        const isWsPublicBind = MQTT_WS_BIND_ADDRESS === '0.0.0.0' || MQTT_WS_BIND_ADDRESS === '::';
        if (isWsPublicBind) {
            const isProd = process.env.NODE_ENV === 'production';
            const allowed = process.env.MQTT_WS_ALLOW_PUBLIC_BIND === 'true';
            if (isProd && !allowed) {
                logger.error(
                    '[MQTT] FATAL: Refusing to bind WebSocket to public interface in production. ' +
                    'Set MQTT_WS_BIND_ADDRESS to 127.0.0.1, ' +
                    'or set MQTT_WS_ALLOW_PUBLIC_BIND=true to override.'
                );
                process.exit(1);
            }
            logger.warn('[MQTT] WARNING: WebSocket binding to public interface. Ensure firewall is configured.');
        }

        httpServer.listen(MQTT_WS_PORT, MQTT_WS_BIND_ADDRESS, () => {
            const nets = os.networkInterfaces();
            let brokerIp = 'localhost';
            for (const name of Object.keys(nets)) {
                for (const netIface of nets[name]) {
                    if (netIface.family === 'IPv4' && !netIface.internal) {
                        brokerIp = netIface.address;
                    }
                }
            }

            logger.info(`[MQTT] Broker (Aedes) WebSocket listening on ${MQTT_WS_BIND_ADDRESS}:${MQTT_WS_PORT}`);
            logger.info(`[MQTT] ESP32 URI: ws://${brokerIp}:${MQTT_WS_PORT}/`);
            resolve({ tcpServer, httpServer, wsServer });
        });
    });
};

const getInstance = () => aedesInstance;
const getTcpServer = () => tcpServer;
const getHttpServer = () => httpServer;
const getWsServer = () => wsServer;

const stop = () => {
    return new Promise((resolve) => {
        let pending = 0;
        const done = () => { if (--pending === 0) resolve(); };

        if (wsServer) {
            pending++;
            wsServer.close(() => {
                logger.info('[MQTT] WebSocket server stopped.');
                done();
            });
        }
        if (httpServer) {
            pending++;
            httpServer.close(() => {
                logger.info('[MQTT] HTTP server stopped.');
                done();
            });
        }
        if (tcpServer) {
            pending++;
            tcpServer.close(() => {
                logger.info('[MQTT] TCP server stopped.');
                done();
            });
        }
        if (pending === 0) resolve();
    });
};

module.exports = { start, stop, getInstance, getTcpServer, getHttpServer, getWsServer, timingSafeEqual };