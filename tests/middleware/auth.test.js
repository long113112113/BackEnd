require('dotenv').config();
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/db');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const config = require('../../src/config');

let validToken;
let disabledUserId;
let normalUserId;

beforeAll(async () => {
    const hashedPassword = await argon2.hash('admin123');
    const result = await db.query(
        `INSERT INTO users (username, email, password, full_name, role, is_active)
         VALUES ($1, $2, $3, $4, $5, false)
         RETURNING id`,
        ['disabled_user', 'disabled@test.com', hashedPassword, 'Disabled Admin', 'admin']
    );
    disabledUserId = result.rows[0].id;

    const normalUserResult = await db.query(
        `INSERT INTO users (username, email, password, full_name, role, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING id`,
        ['normal_user_auth_test', 'normalauth@test.com', hashedPassword, 'Normal User Auth Test', 'user']
    );
    normalUserId = normalUserResult.rows[0].id;

    const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin123' });
    const cookie = loginRes.headers['set-cookie'];
    if (cookie) {
        const match = (Array.isArray(cookie) ? cookie[0] : cookie).match(/token=([^;]+)/);
        if (match) validToken = match[1];
    }
}, 15000);

afterAll(async () => {
    await db.query('DELETE FROM users WHERE username IN ($1, $2)', ['disabled_user', 'normal_user_auth_test']);
});

describe('Auth Middleware', () => {
    test('returns 401 with no token', async () => {
        const res = await request(app).get('/api/students');
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
    });

    test('accepts valid Bearer token', async () => {
        const res = await request(app)
            .get('/api/students')
            .set('Authorization', `Bearer ${validToken}`);
        expect(res.status).toBe(200);
    });

    test('accepts valid Cookie token', async () => {
        const res = await request(app)
            .get('/api/students')
            .set('Cookie', `token=${validToken}`);
        expect(res.status).toBe(200);
    });

    test('rejects expired token', async () => {
        const expiredToken = jwt.sign(
            { id: 1, username: 'admin', role: 'admin' },
            config.jwt.secret,
            { expiresIn: '0s' }
        );
        const res = await request(app)
            .get('/api/students')
            .set('Cookie', `token=${expiredToken}`);
        expect(res.status).toBe(401);
    });

    test('rejects token with wrong secret', async () => {
        const badToken = jwt.sign(
            { id: 1, username: 'admin', role: 'admin' },
            'wrong-secret',
            { expiresIn: '1h' }
        );
        const res = await request(app)
            .get('/api/students')
            .set('Cookie', `token=${badToken}`);
        expect(res.status).toBe(401);
    });

    test('rejects malformed token', async () => {
        const res = await request(app)
            .get('/api/students')
            .set('Cookie', 'token=not.a.jwt');
        expect(res.status).toBe(401);
    });

    test('rejects disabled user', async () => {
        const disabledToken = jwt.sign(
            { id: disabledUserId, username: 'disabled_user', role: 'admin' },
            config.jwt.secret,
            { expiresIn: '1h' }
        );
        const res = await request(app)
            .get('/api/students')
            .set('Cookie', `token=${disabledToken}`);
        expect(res.status).toBe(401);
        expect(res.body.message).toContain('disabled');
    });

    test('rejects token for non-existent user', async () => {
        const ghostToken = jwt.sign(
            { id: 99999, username: 'ghost', role: 'admin' },
            config.jwt.secret,
            { expiresIn: '1h' }
        );
        const res = await request(app)
            .get('/api/students')
            .set('Cookie', `token=${ghostToken}`);
        expect(res.status).toBe(401);
    });

    test('HACKER: rejects JWT with alg=none signature bypass', async () => {
        const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({ id: 1, username: 'admin', role: 'admin' })).toString('base64url');
        const fakeToken = `${header}.${payload}.`;

        const res = await request(app)
            .get('/api/students')
            .set('Cookie', `token=${fakeToken}`);
        expect(res.status).toBe(401);
    });

    test('HACKER: user role escalation - user token cannot access admin endpoints', async () => {
        const userToken = jwt.sign(
            { id: normalUserId, username: 'normal_user_auth_test', role: 'user' },
            config.jwt.secret,
            { expiresIn: '1h' }
        );
        const res = await request(app)
            .post('/api/device-keys')
            .set('Cookie', `token=${userToken}`)
            .send({ device_id: 'HACKED', hmac_key: '0'.repeat(64) });
        expect(res.status).toBe(403);
    });

    test('HACKER: rejects Bearer authorization header with no token', async () => {
        const res = await request(app)
            .get('/api/students')
            .set('Authorization', 'Bearer');
        expect(res.status).toBe(401);
    });

    test('HACKER: rejects Bearer authorization header with malformed prefix', async () => {
        const res = await request(app)
            .get('/api/students')
            .set('Authorization', 'Bearerabc some-token');
        expect(res.status).toBe(401);
    });

    test('HACKER: rejects authorization header without Bearer keyword', async () => {
        const res = await request(app)
            .get('/api/students')
            .set('Authorization', 'RandomValueWithoutBearer');
        expect(res.status).toBe(401);
    });

    test('HACKER: rejects empty Cookie token', async () => {
        const res = await request(app)
            .get('/api/students')
            .set('Cookie', 'token=');
        expect(res.status).toBe(401);
    });

    test('HACKER: rejects whitespace-only Cookie token', async () => {
        const res = await request(app)
            .get('/api/students')
            .set('Cookie', 'token=    ');
        expect(res.status).toBe(401);
    });

    test('HACKER: forged invalid role in JWT is rejected at middleware level', async () => {
        const forgedToken = jwt.sign(
            { id: normalUserId, username: 'normal_user_auth_test', role: 'superadmin' },
            config.jwt.secret,
            { expiresIn: '1h' }
        );
        const res = await request(app)
            .get('/api/auth/me')
            .set('Cookie', `token=${forgedToken}`);
        expect(res.status).toBe(403);
    });
});
