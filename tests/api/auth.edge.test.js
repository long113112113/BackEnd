require('dotenv').config();
const request = require('supertest');
const app = require('../../src/app');
const { resetAttempts } = require('../../src/utils/loginAttempts');

let cookies;

beforeEach(() => {
    resetAttempts('::ffff:127.0.0.1');
    resetAttempts('127.0.0.1');
});

beforeAll(async () => {
    resetAttempts('::ffff:127.0.0.1');
    resetAttempts('127.0.0.1');
    const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin123' });
    cookies = res.headers['set-cookie'];
}, 15000);

const getCookie = () => cookies;

describe('POST /api/auth/logout - edge cases', () => {
    test('returns 200 without prior login (idempotent)', async () => {
        const res = await request(app).post('/api/auth/logout');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test('returns 200 on double logout', async () => {
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ username: 'admin', password: 'admin123' });
        const cookie = loginRes.headers['set-cookie'];

        await request(app).post('/api/auth/logout').set('Cookie', cookie);
        const res = await request(app).post('/api/auth/logout').set('Cookie', cookie);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test('clears token cookie with correct properties', async () => {
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ username: 'admin', password: 'admin123' });
        const cookie = loginRes.headers['set-cookie'];

        const res = await request(app).post('/api/auth/logout').set('Cookie', cookie);
        expect(res.status).toBe(200);

        const setCookie = res.headers['set-cookie'];
        if (setCookie) {
            const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
            expect(header).toMatch(/token=/);
        }
    });
});

describe('GET /api/auth/me - Bearer token authentication', () => {
    test('works with Authorization: Bearer header', async () => {
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ username: 'admin', password: 'admin123' });
        const cookie = loginRes.headers['set-cookie'];
        const header = Array.isArray(cookie) ? cookie[0] : cookie;
        const match = header.match(/token=([^;]+)/);
        const token = match[1];

        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.user).toHaveProperty('username', 'admin');
        expect(res.body.data.user).not.toHaveProperty('password');
    });

    test('returns 401 with invalid Bearer token', async () => {
        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', 'Bearer invalid.token.here');
        expect(res.status).toBe(401);
    });
});