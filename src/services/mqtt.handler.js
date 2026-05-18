/**
 * ==========================================
 * SERVICE: MQTT HANDLER
 * ==========================================
 * Xử lý logic khi nhận message từ ESP32 qua MQTT.
 * Đây là "bộ não" xử lý điểm danh tự động.
 */

const StudentModel = require('../models/student.model');
const AttendanceModel = require('../models/attendance.model');
const UnknownCardModel = require('../models/unknownCard.model');
const mqttConfig = require('../config/mqtt');

/**
 * Xử lý khi ESP32 gửi UID thẻ lên
 * @param {string} topic - Topic nhận message
 * @param {Buffer} message - Nội dung message
 */
const handleMqttMessage = async (topic, message) => {
    if (topic === mqttConfig.TOPICS.SCAN) {
        try {
            const payload = JSON.parse(message.toString());
            const card_uid = payload.card_uid;
            const device_id = payload.device_id || 'ESP32-01';

            console.log(`\n💳 [NHẬN THẺ] card_uid: ${card_uid} | device: ${device_id}`);

            // 1. Tìm sinh viên theo UID thẻ
            const student = await StudentModel.findByCardUID(card_uid);

            if (!student) {
                console.log('🔴 Thẻ lạ — lưu vào unknown_cards');
                await UnknownCardModel.upsert(card_uid, device_id);
                mqttConfig.publish(mqttConfig.TOPICS.RESULT, {
                    status: 'unknown',
                    card_uid,
                    device_id,
                    message: 'The chua dang ky',
                });
                return;
            }

            // 2. Kiểm tra đã điểm danh hôm nay chưa
            const alreadyChecked = await AttendanceModel.hasCheckedInToday(student.id);
            if (alreadyChecked) {
                console.log(`🟡 ${student.full_name} đã điểm danh rồi!`);
                mqttConfig.publish(mqttConfig.TOPICS.RESULT, {
                    status: 'duplicate',
                    name: student.full_name,
                    mssv: student.student_id,
                    class: student.class,
                    card_uid,
                    device_id,
                });
                return;
            }

            // 3. Ghi nhận điểm danh
            await AttendanceModel.create({
                student_id: student.id,
                card_uid: card_uid,
                device_id: device_id,
                status: 'present',
            });

            console.log(`🟢 Điểm danh thành công: ${student.full_name} (${student.student_id})`);

            // 4. Trả kết quả về ESP32
            mqttConfig.publish(mqttConfig.TOPICS.RESULT, {
                status: 'success',
                name: student.full_name,
                mssv: student.student_id,
                class: student.class,
                card_uid,
                device_id,
            });
        } catch (err) {
            console.error('❌ Lỗi xử lý điểm danh:', err.message);
            mqttConfig.publish(mqttConfig.TOPICS.RESULT, {
                status: 'error',
                message: 'Server Error',
            });
        }
    }

    // Xử lý topic trạng thái thiết bị
    if (topic === mqttConfig.TOPICS.STATUS) {
        const data = message.toString();
        console.log(`📡 [THIẾT BỊ] Trạng thái: ${data}`);
    }
};

module.exports = { handleMqttMessage };
