require('dotenv').config();
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/db');
const jwt = require('jsonwebtoken');
const config = require('../../src/config');
const argon2 = require('argon2');

let cookies;
let nonAdminToken;

beforeAll(async () => {
    const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin123' });
    cookies = res.headers['set-cookie'];

    const hashedPassword = await argon2.hash('test123');
    const result = await db.query(
        `INSERT INTO users (username, email, password, full_name, role)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (username) DO UPDATE SET role = 'user'
         RETURNING id, username, role`,
        ['normal_user', 'normal@test.com', hashedPassword, 'Normal User', 'user']
    );
    const user = result.rows[0];
    nonAdminToken = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        config.jwt.secret,
        { expiresIn: '1h' }
    );
});

afterAll(async () => {
    await db.query('DELETE FROM device_keys WHERE device_id LIKE $1', ['ESP32_TEST_%']);
    await db.query('DELETE FROM users WHERE username = $1', ['normal_user']);
});

const getCookie = () => cookies;

describe('GET /api/device-keys', () => {
    test('admin can list devices', async () => {
        const res = await request(app)
            .get('/api/device-keys')
            .set('Cookie', getCookie());
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('hmac_key is not exposed in list', async () => {
        const res = await request(app)
            .get('/api/device-keys')
            .set('Cookie', getCookie());
        if (res.body.data.length > 0) {
            expect(res.body.data[0]).not.toHaveProperty('hmac_key');
        }
    });

    test('non-admin returns 403', async () => {
        const res = await request(app)
            .get('/api/device-keys')
            .set('Cookie', `token=${nonAdminToken}`);
        expect(res.status).toBe(403);
        expect(res.body.message).toContain('Admin');
    });
});

describe('POST /api/device-keys', () => {
    test('admin can create device key', async () => {
        const res = await request(app)
            .post('/api/device-keys')
            .set('Cookie', getCookie())
            .send({
                device_id: 'ESP32_TEST_001',
                hmac_key: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
            });
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
    });

    test('returns 400 for invalid device_id', async () => {
        const res = await request(app)
            .post('/api/device-keys')
            .set('Cookie', getCookie())
            .send({ device_id: '', hmac_key: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' });
        expect(res.status).toBe(400);
    });

    test('returns 400 for invalid hmac_key (not 64 hex)', async () => {
        const res = await request(app)
            .post('/api/device-keys')
            .set('Cookie', getCookie())
            .send({ device_id: 'ESP32_X', hmac_key: 'short' });
        expect(res.status).toBe(400);
    });

    test('returns 400 for hmac_key with non-hex chars', async () => {
        const res = await request(app)
            .post('/api/device-keys')
            .set('Cookie', getCookie())
            .send({ device_id: 'ESP32_X', hmac_key: 'z'.repeat(64) });
        expect(res.status).toBe(400);
    });

    test('non-admin returns 403', async () => {
        const res = await request(app)
            .post('/api/device-keys')
            .set('Cookie', `token=${nonAdminToken}`)
            .send({
                device_id: 'ESP32_HACK',
                hmac_key: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
            });
        expect(res.status).toBe(403);
    });
});

describe('POST /api/device-keys/batch', () => {
    test('admin can batch create', async () => {
        const res = await request(app)
            .post('/api/device-keys/batch')
            .set('Cookie', getCookie())
            .send({
                keys: 'ESP32_B1:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef,ESP32_B2:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
            });
        expect(res.status).toBe(201);
        expect(res.body.data.provisioned.length).toBe(2);
    });

    test('batch with mixed valid/invalid entries', async () => {
        const res = await request(app)
            .post('/api/device-keys/batch')
            .set('Cookie', getCookie())
            .send({ keys: 'VALID:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef,INVALID:short' });
        expect(res.status).toBe(201);
        expect(res.body.data.errors.length).toBe(1);
    });
});

describe('DELETE /api/device-keys/:deviceId', () => {
    test('admin can delete device', async () => {
        const res = await request(app)
            .delete('/api/device-keys/ESP32_TEST_001')
            .set('Cookie', getCookie());
        expect(res.status).toBe(200);
    });

    test('returns 404 for non-existent', async () => {
        const res = await request(app)
            .delete('/api/device-keys/ESP32_NOTEXIST')
            .set('Cookie', getCookie());
        expect(res.status).toBe(404);
    });

    test('non-admin returns 403', async () => {
        const res = await request(app)
            .delete('/api/device-keys/ESP32_B1')
            .set('Cookie', `token=${nonAdminToken}`);
        expect(res.status).toBe(403);
    });
});
