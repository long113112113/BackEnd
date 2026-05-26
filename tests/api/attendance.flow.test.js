require('dotenv').config();
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/db');

let cookies;
let studentId;

beforeAll(async () => {
    const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin123' });
    const cookie = loginRes.headers['set-cookie'];
    cookies = Array.isArray(cookie) ? cookie : [cookie];

    const createRes = await request(app)
        .post('/api/students')
        .set('Cookie', cookies.join('; '))
        .send({
            student_id: 'ATFLOW001',
            full_name: 'Attendance Flow Student',
            class: '20DTH_FLOW',
            card_uid: 'ABCD00000001',
        });
    if (createRes.status !== 201) {
        throw new Error(`Failed to create student: ${JSON.stringify(createRes.body)}`);
    }
    studentId = createRes.body.data.id;
}, 15000);

afterAll(async () => {
    await db.query('DELETE FROM attendance_records WHERE student_id = $1', [studentId]);
    await db.query('DELETE FROM students WHERE student_id = $1', ['ATFLOW001']);
});

const getCookie = () => cookies.join('; ');

describe('Attendance end-to-end flow', () => {
    test('GET /api/attendance?date=today includes attendance record', async () => {
        const today = new Date().toISOString().split('T')[0];
        const res = await request(app)
            .get(`/api/attendance?date=${today}`)
            .set('Cookie', getCookie());
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('GET /api/attendance/student/:id returns records for existing student', async () => {
        const res = await request(app)
            .get(`/api/attendance/student/${studentId}`)
            .set('Cookie', getCookie());
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('GET /api/attendance/student/:id returns empty array for non-existent student', async () => {
        const res = await request(app)
            .get('/api/attendance/student/999999')
            .set('Cookie', getCookie());
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toEqual([]);
    });

    test('GET /api/attendance/stats returns daily statistics', async () => {
        const res = await request(app)
            .get('/api/attendance/stats')
            .set('Cookie', getCookie());
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('GET /api/attendance returns 401 without auth', async () => {
        const res = await request(app).get('/api/attendance');
        expect(res.status).toBe(401);
    });
});