
const mqtt = require('mqtt');

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL;
const TOPIC_PREFIX = process.env.MQTT_TOPIC_PREFIX;
const MQTT_INTERNAL_USERNAME = 'internal_broker';
const MQTT_INTERNAL_PASSWORD = 'internal_broker_secret_2024';

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
