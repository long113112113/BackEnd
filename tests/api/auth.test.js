require('dotenv').config();
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/db');
const argon2 = require('argon2');
const UserModel = require('../../src/models/user.model');

let cookies;

beforeAll(async () => {
    await db.query('DELETE FROM users WHERE username = $1', ['testuser']);
    const hashedPassword = await argon2.hash('test123');
    await UserModel.create({
        username: 'testuser', email: 'testuser@test.com',
        password: hashedPassword, full_name: 'Test User', role: 'user',
    });

    const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin123' });
    cookies = res.headers['set-cookie'];
}, 15000);

afterAll(async () => {
    await db.query('DELETE FROM users WHERE username = $1', ['testuser']);
});

describe('POST /api/auth/login', () => {
    test('returns 200 with valid credentials', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: 'admin', password: 'admin123' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.user).toHaveProperty('username', 'admin');
        expect(res.body.data.user).not.toHaveProperty('password');
    });

    test('sets httpOnly cookie', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: 'admin', password: 'admin123' });
        const cookie = res.headers['set-cookie'];
        expect(cookie).toBeDefined();
        const header = Array.isArray(cookie) ? cookie[0] : cookie;
        expect(header).toMatch(/HttpOnly/i);
        expect(header).toMatch(/SameSite=Strict/i);
        expect(header).toMatch(/token=/);
    });

    test('returns 401 with wrong password', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: 'admin', password: 'wrongpassword' });
        expect(res.status).toBe(401);
    });

    test('returns 401 with non-existent username', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: 'noone', password: 'admin123' });
        expect(res.status).toBe(401);
    });

    test('returns 400 with missing username', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ password: 'admin123' });
        expect(res.status).toBe(400);
    });

    test('returns 400 with missing password', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: 'admin' });
        expect(res.status).toBe(400);
    });

    test('returns 400 with username too long', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: 'a'.repeat(51), password: 'admin123' });
        expect(res.status).toBe(400);
    });

    test('returns 400 with password too short', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: 'admin', password: '12345' });
        expect(res.status).toBe(400);
    });
});

describe('POST /api/auth/logout', () => {
    test('clears cookie and returns 200', async () => {
        const res = await request(app)
            .post('/api/auth/logout')
            .set('Cookie', Array.isArray(cookies) ? cookies.join('; ') : cookies);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

describe('GET /api/auth/me', () => {
    test('returns user data with valid token from login', async () => {
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ username: 'admin', password: 'admin123' });
        const cookie = loginRes.headers['set-cookie'];

        const res = await request(app)
            .get('/api/auth/me')
            .set('Cookie', Array.isArray(cookie) ? cookie.join('; ') : cookie);
        expect(res.status).toBe(200);
        expect(res.body.data).toHaveProperty('username', 'admin');
        expect(res.body.data).not.toHaveProperty('password');
    });

    test('returns 401 without token', async () => {
        const res = await request(app).get('/api/auth/me');
        expect(res.status).toBe(401);
    });
});
