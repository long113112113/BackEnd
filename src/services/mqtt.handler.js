const StudentModel = require('../models/student.model');
const AttendanceModel = require('../models/attendance.model');
const UnknownCardModel = require('../models/unknownCard.model');
const mqttConfig = require('../config/mqtt');

const DEVICE_SECRET = process.env.DEVICE_SECRET || 'pskhutech2024iot';

const handleMqttMessage = async (topic, message) => {
    let payload = null;

    if (topic === mqttConfig.TOPICS.SCAN) {
        try {
            payload = JSON.parse(message.toString());
            const card_uid = payload.card_uid;
            const device_id = payload.device_id || 'ESP32-01';
            const secret = payload.secret;

            if (secret !== DEVICE_SECRET) {
                console.log(`[MQTT] Invalid device secret from device_id=${device_id}`);
                return;
            }

            console.log(`\n[MQTT] Card received: card_uid = ${card_uid} | device = ${device_id}`);

            const student = await StudentModel.findByCardUID(card_uid);

            if (!student) {
                console.log('[MQTT] Unknown card - Saving to unknown_cards');
                await UnknownCardModel.upsert(card_uid, device_id);
                mqttConfig.publish(`${mqttConfig.TOPICS.RESULT}/${device_id}`, {
                    status: 'unknown',
                    card_uid,
                    device_id,
                    message: 'The chua dang ky',
                });
                return;
            }

            const alreadyChecked = await AttendanceModel.hasCheckedInToday(student.id);
            if (alreadyChecked) {
                console.log(`[MQTT] ${student.full_name} has already checked in today.`);
                mqttConfig.publish(`${mqttConfig.TOPICS.RESULT}/${device_id}`, {
                    status: 'duplicate',
                    name: student.full_name,
                    mssv: student.student_id,
                    class: student.class,
                    card_uid,
                    device_id,
                });
                return;
            }

            await AttendanceModel.create({
                student_id: student.id,
                card_uid: card_uid,
                device_id: device_id,
                status: 'present',
            });

            console.log(`[MQTT] Attendance successful: ${student.full_name} (${student.student_id})`);

            mqttConfig.publish(`${mqttConfig.TOPICS.RESULT}/${device_id}`, {
                status: 'success',
                name: student.full_name,
                mssv: student.student_id,
                class: student.class,
                card_uid,
                device_id,
            });
        } catch (err) {
            console.error('[MQTT] Attendance processing failed:', err.message);
            const device_id = payload?.device_id;
            if (device_id) {
                mqttConfig.publish(`${mqttConfig.TOPICS.RESULT}/${device_id}`, {
                    status: 'error',
                    message: 'Server Error',
                });
            }
        }
    }

    if (topic === mqttConfig.TOPICS.STATUS) {
        const data = message.toString();
        console.log(`[MQTT] Device status: ${data}`);
    }
};

module.exports = { handleMqttMessage };
