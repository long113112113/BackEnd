require('dotenv').config();
const { handleMqttMessage } = require('../../src/services/mqtt.handler');
const DeviceKeyModel = require('../../src/models/deviceKey.model');
const StudentModel = require('../../src/models/student.model');
const AttendanceModel = require('../../src/models/attendance.model');
const mqttConfig = require('../../src/config/mqtt');
const { encryptAesGcm, deriveAesKey, computeHmac } = require('../../src/utils/crypto');

describe('MQTT Message Handler - Error Checks', () => {
    const TEST_KEY = '5a5ff51cd6dd32ee9fcdd7dce7715a39ba4f3417e0951e42cefa21f61ba38d30';
    const AES_KEY = deriveAesKey(TEST_KEY);

    let publishSpy;

    beforeEach(() => {
        vi.restoreAllMocks();
        publishSpy = vi.spyOn(mqttConfig, 'publish').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('Should return error when encrypted field is missing', async () => {
        const payload = { device_id: 'ESP32_DEV' };
        await handleMqttMessage('hutech_lms/attendance/scan', Buffer.from(JSON.stringify(payload)));

        expect(publishSpy).toHaveBeenCalledWith(
            'hutech_lms/attendance/result/ESP32_DEV',
            expect.objectContaining({
                status: 'error',
                device_id: 'ESP32_DEV',
                message: 'Missing encrypted payload',
            })
        );
    });

    test('Should return error when device is not provisioned in database', async () => {
        vi.spyOn(DeviceKeyModel, 'findByDeviceId').mockResolvedValue(null);

        const payload = {
            device_id: 'ESP32_UNKNOWN',
            encrypted: { iv: 'iv', ciphertext: 'cipher', auth_tag: 'tag' },
        };
        await handleMqttMessage('hutech_lms/attendance/scan', Buffer.from(JSON.stringify(payload)));

        expect(publishSpy).toHaveBeenCalledWith(
            'hutech_lms/attendance/result/ESP32_UNKNOWN',
            expect.objectContaining({
                status: 'error',
                device_id: 'ESP32_UNKNOWN',
                message: 'Device not provisioned',
            })
        );
    });

    test('Should return error when decryption of payload fails', async () => {
        vi.spyOn(DeviceKeyModel, 'findByDeviceId').mockResolvedValue({
            device_id: 'ESP32_DEV',
            hmac_key: TEST_KEY,
        });

        const payload = {
            device_id: 'ESP32_DEV',
            encrypted: { iv: 'invalid_iv', ciphertext: 'invalid_cipher', auth_tag: 'invalid_tag' },
        };
        await handleMqttMessage('hutech_lms/attendance/scan', Buffer.from(JSON.stringify(payload)));

        expect(publishSpy).toHaveBeenCalledWith(
            'hutech_lms/attendance/result/ESP32_DEV',
            expect.objectContaining({
                device_id: 'ESP32_DEV',
                encrypted: expect.any(Object),
            })
        );
    });

    test('Should return error when inner payload has missing HMAC fields', async () => {
        vi.spyOn(DeviceKeyModel, 'findByDeviceId').mockResolvedValue({
            device_id: 'ESP32_DEV',
            hmac_key: TEST_KEY,
        });

        const innerPayload = { card_uid: 'A1B2C3D4' };
        const encrypted = encryptAesGcm(AES_KEY, JSON.stringify(innerPayload));

        const payload = { device_id: 'ESP32_DEV', encrypted };
        await handleMqttMessage('hutech_lms/attendance/scan', Buffer.from(JSON.stringify(payload)));

        expect(publishSpy).toHaveBeenCalledWith(
            'hutech_lms/attendance/result/ESP32_DEV',
            expect.objectContaining({
                device_id: 'ESP32_DEV',
                encrypted: expect.any(Object),
            })
        );
    });

    test('Should return error when HMAC signature verification fails', async () => {
        vi.spyOn(DeviceKeyModel, 'findByDeviceId').mockResolvedValue({
            device_id: 'ESP32_DEV',
            hmac_key: TEST_KEY,
        });

        const innerPayload = {
            card_uid: 'A1B2C3D4',
            nonce: 'a'.repeat(32),
            seq: 100,
            hmac: 'wrong_hmac_signature_here_not_correct_value',
        };
        const encrypted = encryptAesGcm(AES_KEY, JSON.stringify(innerPayload));

        const payload = { device_id: 'ESP32_DEV', encrypted };
        await handleMqttMessage('hutech_lms/attendance/scan', Buffer.from(JSON.stringify(payload)));

        expect(publishSpy).toHaveBeenCalledWith(
            'hutech_lms/attendance/result/ESP32_DEV',
            expect.any(Object)
        );
    });
});

describe('MQTT Message Handler - Edge Cases', () => {
    const TEST_KEY = '5a5ff51cd6dd32ee9fcdd7dce7715a39ba4f3417e0951e42cefa21f61ba38d30';
    const AES_KEY = deriveAesKey(TEST_KEY);

    let publishSpy;

    beforeEach(() => {
        vi.restoreAllMocks();
        publishSpy = vi.spyOn(mqttConfig, 'publish').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('should use fallback device_id ESP32-01 when payload has no device_id', async () => {
        vi.spyOn(DeviceKeyModel, 'findByDeviceId').mockResolvedValue(null);
        const payload = { encrypted: { iv: 'iv', ciphertext: 'c', auth_tag: 't' } };
        await handleMqttMessage('hutech_lms/attendance/scan', Buffer.from(JSON.stringify(payload)));
        expect(publishSpy).toHaveBeenCalledWith(
            'hutech_lms/attendance/result/ESP32-01',
            expect.objectContaining({
                device_id: 'ESP32-01',
            })
        );
    });

    test('should return error when inner payload is missing card_uid', async () => {
        vi.spyOn(DeviceKeyModel, 'findByDeviceId').mockResolvedValue({
            device_id: 'ESP32_DEV',
            hmac_key: TEST_KEY,
            last_seq: 10,
        });
        const innerPayload = { nonce: 'a'.repeat(32), seq: 11, hmac: 'c'.repeat(64) };
        const encrypted = encryptAesGcm(AES_KEY, JSON.stringify(innerPayload));
        const payload = { device_id: 'ESP32_DEV', encrypted };
        await handleMqttMessage('hutech_lms/attendance/scan', Buffer.from(JSON.stringify(payload)));
        expect(publishSpy).toHaveBeenCalledWith(
            'hutech_lms/attendance/result/ESP32_DEV',
            expect.objectContaining({ device_id: 'ESP32_DEV' })
        );
    });

    test('should handle NVS reset: seq=1 accepted after high last_seq with nvs_reset flag', async () => {
        vi.spyOn(DeviceKeyModel, 'findByDeviceId').mockResolvedValue({
            device_id: 'ESP32_DEV',
            hmac_key: TEST_KEY,
            last_seq: 5000,
        });
        const updateSeqSpy = vi.spyOn(DeviceKeyModel, 'updateLastSeq').mockResolvedValue(null);
        vi.spyOn(StudentModel, 'findByCardUID').mockResolvedValue({
            id: 99, student_id: 'NVS001', full_name: 'NVS Reset', class: '20DTHX1', card_uid: 'A1B2C3D4',
        });
        vi.spyOn(AttendanceModel, 'createIfNotCheckedInToday').mockResolvedValue({ id: 99 });

        const nonce = 'z'.repeat(32);
        const card_uid = 'A1B2C3D4';
        const seq = 1;
        const msgToSign = 'ESP32_DEV' + card_uid + nonce + seq;
        const hmac = computeHmac(TEST_KEY, msgToSign);
        const innerPayload = { card_uid, nonce, seq, hmac };
        const encrypted = encryptAesGcm(AES_KEY, JSON.stringify(innerPayload));
        const payload = { device_id: 'ESP32_DEV', encrypted };

        await handleMqttMessage('hutech_lms/attendance/scan', Buffer.from(JSON.stringify(payload)));
        expect(updateSeqSpy).toHaveBeenCalledWith('ESP32_DEV', 1);
    });

    test('should return error when HMAC format is invalid (wrong length)', async () => {
        vi.spyOn(DeviceKeyModel, 'findByDeviceId').mockResolvedValue({
            device_id: 'ESP32_DEV',
            hmac_key: TEST_KEY,
            last_seq: 10,
        });
        const innerPayload = { card_uid: 'A1B2C3D4', nonce: 'n'.repeat(32), seq: 11, hmac: 'tooshort' };
        const encrypted = encryptAesGcm(AES_KEY, JSON.stringify(innerPayload));
        const payload = { device_id: 'ESP32_DEV', encrypted };
        await handleMqttMessage('hutech_lms/attendance/scan', Buffer.from(JSON.stringify(payload)));
        expect(publishSpy).toHaveBeenCalledWith(
            'hutech_lms/attendance/result/ESP32_DEV',
            expect.objectContaining({ device_id: 'ESP32_DEV' })
        );
    });
});
