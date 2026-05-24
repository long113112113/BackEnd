require('dotenv').config();
const request = require('supertest');
const app = require('../../src/app');

let cookies;

beforeAll(async () => {
    const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin123' });
    cookies = res.headers['set-cookie'];
});

const getCookie = () => cookies;

describe('GET /api/attendance', () => {
    test('returns 200 with array (defaults to today)', async () => {
        const res = await request(app)
            .get('/api/attendance')
            .set('Cookie', getCookie());
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('returns 200 with valid date query', async () => {
        const res = await request(app)
            .get('/api/attendance?date=2026-01-01')
            .set('Cookie', getCookie());
        expect(res.status).toBe(200);
    });

    test('returns 400 with invalid date format', async () => {
        const res = await request(app)
            .get('/api/attendance?date=not-a-date')
            .set('Cookie', getCookie());
        expect(res.status).toBe(400);
    });

    test('returns 401 without token', async () => {
        const res = await request(app).get('/api/attendance');
        expect(res.status).toBe(401);
    });
});

describe('GET /api/attendance/stats', () => {
    test('returns 200 with data array', async () => {
        const res = await request(app)
            .get('/api/attendance/stats')
            .set('Cookie', getCookie());
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
    });
});

describe('GET /api/attendance/student/:id', () => {
    test('returns 200 with array', async () => {
        const res = await request(app)
            .get('/api/attendance/student/1')
            .set('Cookie', getCookie());
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('returns 400 for non-integer id', async () => {
        const res = await request(app)
            .get('/api/attendance/student/abc')
            .set('Cookie', getCookie());
        expect(res.status).toBe(400);
    });
});
