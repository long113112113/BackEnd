const crypto = require('crypto');
const StudentModel = require('../models/student.model');
const AttendanceModel = require('../models/attendance.model');
const UnknownCardModel = require('../models/unknownCard.model');
const DeviceKeyModel = require('../models/deviceKey.model');
const mqttConfig = require('../config/mqtt');
const { computeHmac, verifyNonce, verifySeq, deriveAesKey, encryptAesGcm, decryptAesGcm } = require('../utils/crypto');

const encryptError = (aesKey, device_id, status, message, extra = {}) => {
    const resultPayload = { status, device_id, message, ...extra };
    if (aesKey) {
        const enc = encryptAesGcm(aesKey, JSON.stringify(resultPayload));
        return { device_id, encrypted: enc };
    }
    return resultPayload;
};

const handleMqttMessage = async (topic, message) => {
    if (topic === mqttConfig.TOPICS.SCAN) {
        let payload = null;
        let device_id = null;
        let aesKey = null;
        let device = null;

        try {
            payload = JSON.parse(message.toString());
            device_id = payload.device_id || 'ESP32-01';
            const encrypted = payload.encrypted;

            if (!encrypted || !encrypted.iv || !encrypted.ciphertext || !encrypted.auth_tag) {
                console.log(`[MQTT] Missing encrypted payload from device_id=${device_id}`);
                mqttConfig.publish(`${mqttConfig.TOPICS.RESULT}/${device_id}`, {
                    status: 'error', device_id, message: 'Missing encrypted payload',
                });
                return;
            }

            device = await DeviceKeyModel.findByDeviceId(device_id);
            if (!device) {
                console.log(`[MQTT] Unknown device_id=${device_id} — key not provisioned`);
                mqttConfig.publish(`${mqttConfig.TOPICS.RESULT}/${device_id}`, {
                    status: 'error', device_id, message: 'Device not provisioned',
                });
                return;
            }

            aesKey = deriveAesKey(device.hmac_key);
            let innerJson;
            try {
                innerJson = decryptAesGcm(aesKey, encrypted);
            } catch {
                console.log(`[MQTT] AES-GCM decrypt failed device_id=${device_id}`);
                const errPayload = encryptError(aesKey, device_id, 'error', 'Decryption failed');
                mqttConfig.publish(`${mqttConfig.TOPICS.RESULT}/${device_id}`, errPayload);
                return;
            }

            let innerPayload;
            try {
                innerPayload = JSON.parse(innerJson);
            } catch {
                console.log(`[MQTT] Invalid inner JSON from device_id=${device_id}`);
                const errPayload = encryptError(aesKey, device_id, 'error', 'Invalid payload');
                mqttConfig.publish(`${mqttConfig.TOPICS.RESULT}/${device_id}`, errPayload);
                return;
            }

            const card_uid = innerPayload.card_uid;
            const nonce = innerPayload.nonce;
            const seq = innerPayload.seq;
            const receivedHmac = innerPayload.hmac;

            if (!card_uid || !nonce || !seq || !receivedHmac) {
                console.log(`[MQTT] Missing HMAC fields from device_id=${device_id}`);
                const errPayload = encryptError(aesKey, device_id, 'error', 'Missing HMAC fields', { card_uid });
                mqttConfig.publish(`${mqttConfig.TOPICS.RESULT}/${device_id}`, errPayload);
                return;
            }

            if (receivedHmac.length !== 64 || !/^[0-9a-fA-F]+$/.test(receivedHmac)) {
                console.log(`[MQTT] Invalid HMAC format device_id=${device_id} len=${receivedHmac.length}`);
                const errPayload = encryptError(aesKey, device_id, 'error', 'Invalid HMAC format', { card_uid });
                mqttConfig.publish(`${mqttConfig.TOPICS.RESULT}/${device_id}`, errPayload);
                return;
            }

            const msgToSign = device_id + card_uid + nonce + seq;
            const expectedHmac = computeHmac(device.hmac_key, msgToSign);

            const buf1 = Buffer.from(receivedHmac, 'hex');
            const buf2 = Buffer.from(expectedHmac, 'hex');

            // length check is required before timingSafeEqual to prevent unhandled exceptions (DoS)
            if (buf1.length !== buf2.length || !crypto.timingSafeEqual(buf1, buf2)) {
                console.log(`[MQTT] HMAC mismatch device_id=${device_id}`);
                const errPayload = encryptError(aesKey, device_id, 'error', 'HMAC verification failed', { card_uid });
                mqttConfig.publish(`${mqttConfig.TOPICS.RESULT}/${device_id}`, errPayload);
                return;
            }

            const nonceCheck = verifyNonce(nonce);
            if (!nonceCheck.ok) {
                console.log(`[MQTT] Nonce check failed device_id=${device_id}: ${nonceCheck.reason}`);
                const errPayload = encryptError(aesKey, device_id, 'error', `Replay detected: ${nonceCheck.reason}`, { card_uid });
                mqttConfig.publish(`${mqttConfig.TOPICS.RESULT}/${device_id}`, errPayload);
                return;
            }

            const seqCheck = verifySeq(seq, device.last_seq);
            if (!seqCheck.ok) {
                console.log(`[MQTT] Seq check failed device_id=${device_id}: ${seqCheck.reason}`);
                const errPayload = encryptError(aesKey, device_id, 'error', `Seq invalid: ${seqCheck.reason}`, { card_uid });
                mqttConfig.publish(`${mqttConfig.TOPICS.RESULT}/${device_id}`, errPayload);
                return;
            }

            await DeviceKeyModel.updateLastSeq(device_id, seq);

            if (seqCheck.nvs_reset) {
                console.log(`[MQTT] ⚠ NVS RESET DETECTED device_id=${device_id} seq=${seq} last_seq was ${device.last_seq} — auto-recovered`);
            }

            console.log(`\n[MQTT] Card received: card_uid = ${card_uid} | device = ${device_id}`);

            const student = await StudentModel.findByCardUID(card_uid);

            if (!student) {
                console.log('[MQTT] Unknown card - Saving to unknown_cards');
                await UnknownCardModel.upsert(card_uid, device_id);
                const resultPayload = { status: 'unknown', card_uid, message: 'The chua dang ky' };
                const enc = encryptAesGcm(aesKey, JSON.stringify(resultPayload));
                mqttConfig.publish(`${mqttConfig.TOPICS.RESULT}/${device_id}`, { device_id, encrypted: enc });
                return;
            }

            const record = await AttendanceModel.createIfNotCheckedInToday({
                student_id: student.id,
                card_uid: card_uid,
                device_id: device_id,
                status: 'present',
            });

            if (!record) {
                console.log(`[MQTT] ${student.full_name} has already checked in today.`);
                const resultPayload = {
                    status: 'duplicate',
                    name: student.full_name,
                    mssv: student.student_id,
                    class: student.class,
                    card_uid,
                };
                const enc = encryptAesGcm(aesKey, JSON.stringify(resultPayload));
                mqttConfig.publish(`${mqttConfig.TOPICS.RESULT}/${device_id}`, { device_id, encrypted: enc });
                return;
            }

            console.log(`[MQTT] Attendance successful: ${student.full_name} (${student.student_id})`);

            const resultPayload = {
                status: 'success',
                name: student.full_name,
                mssv: student.student_id,
                class: student.class,
                card_uid,
            };
            const enc = encryptAesGcm(aesKey, JSON.stringify(resultPayload));
            mqttConfig.publish(`${mqttConfig.TOPICS.RESULT}/${device_id}`, { device_id, encrypted: enc });
        } catch (err) {
            console.error('[MQTT] Attendance processing failed:', err.message);
            if (device_id) {
                const errPayload = encryptError(aesKey, device_id, 'error', 'Server Error');
                mqttConfig.publish(`${mqttConfig.TOPICS.RESULT}/${device_id}`, errPayload);
            }
        }
    }

    if (topic === mqttConfig.TOPICS.STATUS) {
        const data = message.toString();
        console.log(`[MQTT] Device status: ${data}`);
    }
};

module.exports = { handleMqttMessage };
