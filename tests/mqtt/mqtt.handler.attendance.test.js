require('dotenv').config();
const { handleMqttMessage } = require('../../src/services/mqtt.handler');
const StudentModel = require('../../src/models/student.model');
const AttendanceModel = require('../../src/models/attendance.model');
const UnknownCardModel = require('../../src/models/unknownCard.model');
const DeviceKeyModel = require('../../src/models/deviceKey.model');
const mqttConfig = require('../../src/config/mqtt');
const { encryptAesGcm, deriveAesKey, computeHmac } = require('../../src/utils/crypto');

describe('MQTT Message Handler - Attendance Logic', () => {
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

    test('Should register check-in successfully for valid active student card', async () => {
        vi.spyOn(DeviceKeyModel, 'findByDeviceId').mockResolvedValue({
            device_id: 'ESP32_DEV',
            hmac_key: TEST_KEY,
            last_seq: 10,
        });
        const updateLastSeqSpy = vi.spyOn(DeviceKeyModel, 'updateLastSeqAtomic').mockResolvedValue(true);

        const nonce = 'e'.repeat(32);
        const card_uid = 'A1B2C3D4';
        const seq = 11;
        const msgToSign = 'ESP32_DEV' + card_uid + nonce + seq;
        const hmac = computeHmac(TEST_KEY, msgToSign);

        const innerPayload = { card_uid, nonce, seq, hmac };
        const encrypted = encryptAesGcm(AES_KEY, JSON.stringify(innerPayload));

        const mockStudent = {
            id: 10,
            student_id: '2011060001',
            full_name: 'Nguyen Van A',
            class: '20DTHX1',
            card_uid,
        };

        vi.spyOn(StudentModel, 'findByCardUID').mockResolvedValue(mockStudent);
        const createAttendanceSpy = vi.spyOn(AttendanceModel, 'createIfCooldownPassed').mockResolvedValue({ id: 1 });

        const payload = { device_id: 'ESP32_DEV', encrypted };
        await handleMqttMessage('hutech_lms/attendance/scan', Buffer.from(JSON.stringify(payload)));

        expect(updateLastSeqSpy).toHaveBeenCalledWith('ESP32_DEV', 11);
        expect(createAttendanceSpy).toHaveBeenCalledWith({
            student_id: 10,
            card_uid,
            device_id: 'ESP32_DEV',
            status: 'present',
        }, expect.any(Number));
        expect(publishSpy).toHaveBeenCalledWith(
            'hutech_lms/attendance/result/ESP32_DEV',
            expect.objectContaining({
                device_id: 'ESP32_DEV',
                encrypted: expect.any(Object),
            })
        );
    });

    test('Should handle duplicate swipe correctly when student already checked in today', async () => {
        vi.spyOn(DeviceKeyModel, 'findByDeviceId').mockResolvedValue({
            device_id: 'ESP32_DEV',
            hmac_key: TEST_KEY,
            last_seq: 10,
        });

        const nonce = 'f'.repeat(32);
        const card_uid = 'A1B2C3D4';
        const seq = 12;
        const msgToSign = 'ESP32_DEV' + card_uid + nonce + seq;
        const hmac = computeHmac(TEST_KEY, msgToSign);

        const innerPayload = { card_uid, nonce, seq, hmac };
        const encrypted = encryptAesGcm(AES_KEY, JSON.stringify(innerPayload));

        const mockStudent = {
            id: 10,
            student_id: '2011060001',
            full_name: 'Nguyen Van A',
            class: '20DTHX1',
            card_uid,
        };

        vi.spyOn(StudentModel, 'findByCardUID').mockResolvedValue(mockStudent);
        vi.spyOn(AttendanceModel, 'createIfCooldownPassed').mockResolvedValue(null);
        const createAttendanceSpy = vi.spyOn(AttendanceModel, 'create').mockResolvedValue(null);

        const payload = { device_id: 'ESP32_DEV', encrypted };
        await handleMqttMessage('hutech_lms/attendance/scan', Buffer.from(JSON.stringify(payload)));

        expect(createAttendanceSpy).not.toHaveBeenCalled();
        expect(publishSpy).toHaveBeenCalledWith(
            'hutech_lms/attendance/result/ESP32_DEV',
            expect.objectContaining({
                device_id: 'ESP32_DEV',
                encrypted: expect.any(Object),
            })
        );
    });

    test('Should register unknown card into unknown_cards table when card UID is not in students list', async () => {
        vi.spyOn(DeviceKeyModel, 'findByDeviceId').mockResolvedValue({
            device_id: 'ESP32_DEV',
            hmac_key: TEST_KEY,
            last_seq: 10,
        });

        const nonce = '1'.repeat(32);
        const card_uid = 'BEEF1234FFFF';
        const seq = 13;
        const msgToSign = 'ESP32_DEV' + card_uid + nonce + seq;
        const hmac = computeHmac(TEST_KEY, msgToSign);

        const innerPayload = { card_uid, nonce, seq, hmac };
        const encrypted = encryptAesGcm(AES_KEY, JSON.stringify(innerPayload));

        vi.spyOn(StudentModel, 'findByCardUID').mockResolvedValue(null);
        const upsertUnknownCardSpy = vi.spyOn(UnknownCardModel, 'upsert').mockResolvedValue(null);
        const createAttendanceSpy = vi.spyOn(AttendanceModel, 'create').mockResolvedValue(null);

        const payload = { device_id: 'ESP32_DEV', encrypted };
        await handleMqttMessage('hutech_lms/attendance/scan', Buffer.from(JSON.stringify(payload)));

        expect(upsertUnknownCardSpy).toHaveBeenCalledWith(card_uid, 'ESP32_DEV');
        expect(createAttendanceSpy).not.toHaveBeenCalled();
        expect(publishSpy).toHaveBeenCalledWith(
            'hutech_lms/attendance/result/ESP32_DEV',
            expect.objectContaining({
                device_id: 'ESP32_DEV',
                encrypted: expect.any(Object),
            })
        );
    });

    test('Should process device status report topic successfully without crashing', async () => {
        const logger = require('../../src/utils/logger');
        const logSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
        await handleMqttMessage('hutech_lms/device/status', Buffer.from('ESP32-01: ONLINE, battery=98%'));
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[MQTT] Device status: ESP32-01: ONLINE'));
        logSpy.mockRestore();
    });

    test('ignores messages on wrong topic', async () => {
        await handleMqttMessage('other/topic', Buffer.from('{}'));
        expect(publishSpy).not.toHaveBeenCalled();
    });

    test('ignores subtopics or variations of scan topic', async () => {
        await handleMqttMessage('hutech_lms/attendance/scan/extra', Buffer.from('{}'));
        expect(publishSpy).not.toHaveBeenCalled();
    });
});
