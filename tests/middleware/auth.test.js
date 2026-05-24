require('dotenv').config();
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/db');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const config = require('../../src/config');

let validToken;
let disabledUserId;

beforeAll(async () => {
    const hashedPassword = await argon2.hash('admin123');
    const result = await db.query(
        `INSERT INTO users (username, email, password, full_name, role, is_active)
         VALUES ($1, $2, $3, $4, $5, false)
         RETURNING id`,
        ['disabled_user', 'disabled@test.com', hashedPassword, 'Disabled Admin', 'admin']
    );
    disabledUserId = result.rows[0].id;

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
    await db.query('DELETE FROM users WHERE username = $1', ['disabled_user']);
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
});
