
const mqtt = require('mqtt');

const requiredEnv = (name) => {
    const val = process.env[name];
    if (!val) {
        console.error(`[MQTT] Missing required env variable: ${name}. Please set it in .env`);
        process.exit(1);
    }
    return val;
};

const MQTT_BROKER_URL = requiredEnv('MQTT_BROKER_URL');
const TOPIC_PREFIX = requiredEnv('MQTT_TOPIC_PREFIX');
const MQTT_INTERNAL_USERNAME = requiredEnv('MQTT_INTERNAL_USERNAME');
const MQTT_INTERNAL_PASSWORD = requiredEnv('MQTT_INTERNAL_PASSWORD');

const TOPICS = {
    SCAN: `${TOPIC_PREFIX}/attendance/scan`,
    RESULT: `${TOPIC_PREFIX}/attendance/result`,
    STATUS: `${TOPIC_PREFIX}/device/status`,
};

let client = null;

const connect = (onMessageCallback) => {
    client = mqtt.connect(MQTT_BROKER_URL, {
        username: MQTT_INTERNAL_USERNAME,
        password: MQTT_INTERNAL_PASSWORD,
    });

    client.on('connect', () => {
        console.log('[MQTT] Connected to MQTT Broker successfully.');

        client.subscribe(TOPICS.SCAN, (err) => {
            if (!err) console.log(`[MQTT] Listening for devices on topic: ${TOPICS.SCAN}`);
        });

        client.subscribe(TOPICS.STATUS, (err) => {
            if (!err) console.log(`[MQTT] Listening for device status on topic: ${TOPICS.STATUS}`);
        });
    });

    client.on('message', onMessageCallback);

    client.on('error', (err) => {
        console.error('[MQTT] Error:', err.message);
    });

    client.on('reconnect', () => {
        console.log('[MQTT] Reconnecting...');
    });

    return client;
};

const publish = (topic, payload) => {
    if (!client || !client.connected) {
        console.error('[MQTT] Not connected, cannot publish message.');
        return;
    }

    const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
    client.publish(topic, message, { qos: 1 });
};

const getClient = () => client;

module.exports = {
    TOPICS,
    connect,
    publish,
    getClient,
};
