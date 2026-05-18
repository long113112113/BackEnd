/**
 * ==========================================
 * CẤU HÌNH KẾT NỐI MQTT BROKER
 * ==========================================
 * Kết nối tới Aedes broker (embedded) để giao tiếp với ESP32.
 */

const mqtt = require('mqtt');

const MQTT_PORT = parseInt(process.env.MQTT_PORT, 10) || 1883;
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || `mqtt://localhost:${MQTT_PORT}`;
const TOPIC_PREFIX = process.env.MQTT_TOPIC_PREFIX || 'hutech_lms';

// Định nghĩa các topics
const TOPICS = {
    SCAN: `${TOPIC_PREFIX}/attendance/scan`,       // ESP32 gửi UID thẻ lên
    RESULT: `${TOPIC_PREFIX}/attendance/result`,     // Server trả kết quả về ESP32
    STATUS: `${TOPIC_PREFIX}/device/status`,         // Trạng thái thiết bị
};

let client = null;

/**
 * Khởi tạo kết nối MQTT
 * @param {Function} onMessageCallback - Hàm xử lý khi nhận message
 * @returns {Object} MQTT client
 */
const connect = (onMessageCallback) => {
    client = mqtt.connect(MQTT_BROKER_URL);

    client.on('connect', () => {
        console.log('✅ Đã kết nối tới MQTT Broker!');

        // Đăng ký các topic cần lắng nghe
        client.subscribe(TOPICS.SCAN, (err) => {
            if (!err) console.log(`🎧 Đang lắng nghe thiết bị tại: ${TOPICS.SCAN}`);
        });

        client.subscribe(TOPICS.STATUS, (err) => {
            if (!err) console.log(`🎧 Đang lắng nghe trạng thái tại: ${TOPICS.STATUS}`);
        });
    });

    client.on('message', onMessageCallback);

    client.on('error', (err) => {
        console.error('❌ Lỗi MQTT:', err.message);
    });

    client.on('reconnect', () => {
        console.log('🔄 Đang kết nối lại MQTT...');
    });

    return client;
};

/**
 * Gửi message tới một topic
 * @param {string} topic - Topic đích
 * @param {Object|string} payload - Dữ liệu gửi đi
 */
const publish = (topic, payload) => {
    if (!client || !client.connected) {
        console.error('❌ MQTT chưa kết nối, không thể gửi message!');
        return;
    }

    const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
    client.publish(topic, message, { qos: 1 });
};

/**
 * Lấy MQTT client hiện tại
 */
const getClient = () => client;

module.exports = {
    TOPICS,
    connect,
    publish,
    getClient,
};
