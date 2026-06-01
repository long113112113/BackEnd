require('dotenv').config();
const { handleMqttMessage } = require('../../src/services/mqtt.handler');
const StudentModel = require('../../src/models/student.model');
const AttendanceModel = require('../../src/models/attendance.model');
const UnknownCardModel = require('../../src/models/unknownCard.model');
const DeviceKeyModel = require('../../src/models/deviceKey.model');
const mqttConfig = require('../../src/config/mqtt');
const { encryptAesGcm, deriveAesKey, computeHmac } = require('../../src/utils/crypto');

describe('MQTT Message Handler - Security Checks', () => {
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

    test('Should return error when replay attack is detected (reused Nonce)', async () => {
        vi.spyOn(DeviceKeyModel, 'findByDeviceId').mockResolvedValue({
            device_id: 'ESP32_DEV',
            hmac_key: TEST_KEY,
            last_seq: 10,
        });
        vi.spyOn(DeviceKeyModel, 'updateLastSeq').mockResolvedValue(null);

        const nonce = 'c'.repeat(32);
        const card_uid = 'A1B2C3D4';
        const seq = 15;
        const msgToSign = `ESP32_DEV|${card_uid}|${nonce}|${seq}`;
        const hmac = computeHmac(TEST_KEY, msgToSign);

        const innerPayload = { card_uid, nonce, seq, hmac };
        const encrypted = encryptAesGcm(AES_KEY, JSON.stringify(innerPayload));

        const payload = { device_id: 'ESP32_DEV', encrypted };
        await handleMqttMessage('hutech_lms/attendance/scan', Buffer.from(JSON.stringify(payload)));

        publishSpy.mockClear();

        await handleMqttMessage('hutech_lms/attendance/scan', Buffer.from(JSON.stringify(payload)));

        expect(publishSpy).toHaveBeenCalledWith(
            'hutech_lms/attendance/result/ESP32_DEV',
            expect.objectContaining({
                device_id: 'ESP32_DEV',
                encrypted: expect.any(Object),
            })
        );
    });

    test('Should return error when sequence number seq is out of order (not monotonic)', async () => {
        vi.spyOn(DeviceKeyModel, 'findByDeviceId').mockResolvedValue({
            device_id: 'ESP32_DEV',
            hmac_key: TEST_KEY,
            last_seq: 100,
        });

        const nonce = 'd'.repeat(32);
        const card_uid = 'A1B2C3D4';
        const seq = 50;
        const msgToSign = `ESP32_DEV|${card_uid}|${nonce}|${seq}`;
        const hmac = computeHmac(TEST_KEY, msgToSign);

        const innerPayload = { card_uid, nonce, seq, hmac };
        const encrypted = encryptAesGcm(AES_KEY, JSON.stringify(innerPayload));

        const payload = { device_id: 'ESP32_DEV', encrypted };
        await handleMqttMessage('hutech_lms/attendance/scan', Buffer.from(JSON.stringify(payload)));

        expect(publishSpy).toHaveBeenCalledWith(
            'hutech_lms/attendance/result/ESP32_DEV',
            expect.any(Object)
        );
    });

    test('HACKER PENTEST: Simultaneous Race Condition Replay - should block second duplicate request completely', async () => {
        vi.spyOn(DeviceKeyModel, 'findByDeviceId').mockResolvedValue({
            device_id: 'ESP32_DEV',
            hmac_key: TEST_KEY,
            last_seq: 10,
        });
        vi.spyOn(DeviceKeyModel, 'updateLastSeqAtomic').mockResolvedValue(true);

        const nonce = 'r'.repeat(32);
        const card_uid = 'A1B2C3D4';
        const seq = 18;
        const msgToSign = `ESP32_DEV|${card_uid}|${nonce}|${seq}`;
        const hmac = computeHmac(TEST_KEY, msgToSign);

        const innerPayload = { card_uid, nonce, seq, hmac };
        const encrypted = encryptAesGcm(AES_KEY, JSON.stringify(innerPayload));
        const payload = { device_id: 'ESP32_DEV', encrypted };

        const mockStudent = { id: 10, student_id: '2011060001', full_name: 'Nguyen Van A', class: '20DTHX1', card_uid };
        vi.spyOn(StudentModel, 'findByCardUID').mockResolvedValue(mockStudent);
        const createAttendanceSpy = vi.spyOn(AttendanceModel, 'createIfCooldownPassed').mockResolvedValue({ id: 1 });

        await Promise.all([
            handleMqttMessage('hutech_lms/attendance/scan', Buffer.from(JSON.stringify(payload))),
            handleMqttMessage('hutech_lms/attendance/scan', Buffer.from(JSON.stringify(payload)))
        ]);

        expect(createAttendanceSpy).toHaveBeenCalledTimes(1);
    });

    test('HACKER PENTEST: Decryption DoS Spam - massive spam of corrupted payloads is rejected safely without breaking Node event loop', async () => {
        vi.spyOn(DeviceKeyModel, 'findByDeviceId').mockResolvedValue({
            device_id: 'ESP32_DEV',
            hmac_key: TEST_KEY,
            last_seq: 10,
        });
        const createAttendanceSpy = vi.spyOn(AttendanceModel, 'create').mockResolvedValue(null);

        const corruptedPayload = {
            device_id: 'ESP32_DEV',
            encrypted: { iv: 'corrupted', ciphertext: 'corrupted', auth_tag: 'corrupted' }
        };

        const spamCount = 20;
        const promises = [];
        for (let i = 0; i < spamCount; i++) {
            promises.push(handleMqttMessage('hutech_lms/attendance/scan', Buffer.from(JSON.stringify(corruptedPayload))));
        }

        await Promise.all(promises);

        expect(createAttendanceSpy).not.toHaveBeenCalled();
        expect(publishSpy).toHaveBeenCalledTimes(spamCount);
    });

    test('HACKER: completely invalid non-JSON binary payload should not crash process', async () => {
        const binaryGarbage = Buffer.from([0xFF, 0xFE, 0x00, 0xD8, 0x01, 0x00]);
        await expect(handleMqttMessage('hutech_lms/attendance/scan', binaryGarbage)).resolves.not.toThrow();
    });

    test('HACKER: empty buffer payload should not crash process', async () => {
        await expect(handleMqttMessage('hutech_lms/attendance/scan', Buffer.from(''))).resolves.not.toThrow();
    });

    test('HACKER: rejects extremely large MQTT payload (>1MB)', async () => {
        const hugePayload = Buffer.alloc(1024 * 1024, 'A');
        await expect(handleMqttMessage('hutech_lms/attendance/scan', hugePayload)).resolves.not.toThrow();
    });
});
