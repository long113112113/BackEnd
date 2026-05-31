require('dotenv').config();
const db = require('../../src/config/db');
const initDatabase = require('../../src/utils/initDb');
const StudentModel = require('../../src/models/student.model');
const AttendanceModel = require('../../src/models/attendance.model');

let studentId;
let mssv;

beforeAll(async () => {
    await initDatabase();
    await db.query('DELETE FROM attendance_records');
    await db.query('DELETE FROM unknown_cards');
    await db.query('DELETE FROM students');
    await db.query('DELETE FROM device_keys');
    await db.query('DELETE FROM users');

    const student = await StudentModel.create({
        student_id: 'AMTEST001',
        full_name: 'Attendance Model Student',
        class: '20DTH_AM',
        card_uid: 'AMDEADBEEF01',
    });
    studentId = student.id;
    mssv = student.student_id;
}, 30000);

afterAll(async () => {
    await db.query('DELETE FROM attendance_records');
    await db.query('DELETE FROM students WHERE student_id LIKE $1', ['AMTEST_%']);
});

describe('AttendanceModel.create', () => {
    test('inserts attendance record and returns it', async () => {
        const record = await AttendanceModel.create({
            student_id: studentId,
            card_uid: 'AMDEADBEEF01',
            device_id: 'ESP32_AMTEST',
            status: 'present',
        });
        expect(record).not.toBeNull();
        expect(record.student_id).toBe(studentId);
        expect(record.card_uid).toBe('AMDEADBEEF01');
        expect(record.device_id).toBe('ESP32_AMTEST');
        expect(record.status).toBe('present');
    });
});

describe('AttendanceModel.hasCheckedInToday', () => {
    test('returns true for student who checked in today', async () => {
        const checked = await AttendanceModel.hasCheckedInToday(studentId);
        expect(checked).toBe(true);
    });

    test('returns false for student without check-in', async () => {
        const checked = await AttendanceModel.hasCheckedInToday(999999);
        expect(checked).toBe(false);
    });
});

describe('AttendanceModel.findByDate', () => {
    test('returns records for today with joined student info', async () => {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
        const result = await AttendanceModel.findByDate(today);
        expect(result.rows.length).toBeGreaterThanOrEqual(1);
        const found = result.rows.find(r => r.student_id === mssv);
        expect(found).not.toBeUndefined();
        expect(found.full_name).toBe('Attendance Model Student');
        expect(found.student_id).toBe('AMTEST001');
    });

    test('returns empty array for date with no records', async () => {
        const result = await AttendanceModel.findByDate('2000-01-01');
        expect(result.rows.length).toBe(0);
    });
});

describe('AttendanceModel.findByStudentId', () => {
    test('returns records for given student', async () => {
        const { rows, total } = await AttendanceModel.findByStudentId(mssv);
        expect(rows.length).toBeGreaterThanOrEqual(1);
        expect(rows[0].student_id).toBe(mssv);
        expect(total).toBeGreaterThanOrEqual(1);
    });

    test('returns empty array for non-existent student', async () => {
        const result = await AttendanceModel.findByStudentId('NONEXISTENT');
        expect(result).toEqual({ rows: [], total: 0 });
    });
});

describe('AttendanceModel.getStats', () => {
    test('returns array of daily stats', async () => {
        const stats = await AttendanceModel.getStats();
        expect(Array.isArray(stats)).toBe(true);
        if (stats.length > 0) {
            expect(stats[0]).toHaveProperty('date');
            expect(stats[0]).toHaveProperty('total_records');
        }
    });
});