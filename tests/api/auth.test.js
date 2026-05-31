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
        password: hashedPassword, full_name: 'Test User', role: 'manager',
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
        expect(header).toMatch(/SameSite=Lax/i);
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
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ username: 'admin', password: 'admin123' });
        const logoutCookie = loginRes.headers['set-cookie'];
        const res = await request(app)
            .post('/api/auth/logout')
            .set('Cookie', Array.isArray(logoutCookie) ? logoutCookie.join('; ') : logoutCookie);
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
        expect(res.body.data.user).toHaveProperty('username', 'admin');
        expect(res.body.data.user).not.toHaveProperty('password');
    });

    test('returns 401 without token', async () => {
        const res = await request(app).get('/api/auth/me');
        expect(res.status).toBe(401);
    });
});

describe('HACKER / PENTEST: Auth API Security Checks', () => {
    test('HACKER: cookie should have Secure flag when NODE_ENV=production', async () => {
        const config = require('../../src/config');
        const originalSecure = config.cookie.secure;
        const originalSameSite = config.cookie.sameSite;
        try {
            config.cookie.secure = true;
            config.cookie.sameSite = 'none';
            const res = await request(app)
                .post('/api/auth/login')
                .send({ username: 'admin', password: 'admin123' });
            const cookie = res.headers['set-cookie'];
            expect(cookie).toBeDefined();
            const header = Array.isArray(cookie) ? cookie[0] : cookie;
            expect(header).toMatch(/Secure/i);
        } finally {
            config.cookie.secure = originalSecure;
            config.cookie.sameSite = originalSameSite;
        }
    });

    test('HACKER: PUT method not allowed on login', async () => {
        const res = await request(app)
            .put('/api/auth/login')
            .send({ username: 'admin', password: 'admin123' });
        expect(res.status).toBe(404);
    });

    test('HACKER: register endpoint is not exposed / returns 404', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({
                username: 'hackeradmin',
                email: 'hacker@admin.com',
                password: 'password123',
                full_name: 'Hacker Admin',
            });
        expect(res.status).toBe(404);
    });

    test('SECURITY: username SQL injection attempt fails with 400/401', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: "' OR '1'='1", password: 'admin123' });
        expect([400, 401]).toContain(res.status);
    });

    test('ROBUSTNESS: leading/trailing whitespaces in username are trimmed and log in successfully', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: '  admin  ', password: 'admin123' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test('SECURITY: case-sensitivity on username', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: 'ADMIN', password: 'admin123' });
        expect(res.status).toBe(401);
    });

    test('ROBUSTNESS: special characters or long values in credentials do not crash', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: 'admin', password: '★'.repeat(256) });
        expect(res.status).toBe(400);
    });
});
