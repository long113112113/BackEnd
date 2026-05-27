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
        ['batch_test_user', 'batchuser@test.com', hashedPassword, 'Batch Test User', 'user']
    );
    const user = result.rows[0];
    nonAdminToken = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        config.jwt.secret,
        { expiresIn: '1h' }
    );
});

afterAll(async () => {
    await db.query('DELETE FROM device_keys WHERE device_id LIKE $1', ['DKBATCH_%']);
    await db.query('DELETE FROM users WHERE username = $1', ['batch_test_user']);
});

const getCookie = () => cookies;

describe('POST /api/device-keys/batch - edge cases', () => {
    test('returns 400 for empty keys string', async () => {
        const res = await request(app)
            .post('/api/device-keys/batch')
            .set('Cookie', getCookie())
            .send({ keys: '' });
        expect(res.status).toBe(400);
    });

    test('returns 400 for batch exceeding 100 entries', async () => {
        const entries = Array.from({ length: 101 }, (_, i) =>
            `DKBATCH_${i}:` + 'a'.repeat(64)
        ).join(',');
        const res = await request(app)
            .post('/api/device-keys/batch')
            .set('Cookie', getCookie())
            .send({ keys: entries });
        expect(res.status).toBe(400);
    });

    test('returns 400 with all errors when every entry is invalid format', async () => {
        const res = await request(app)
            .post('/api/device-keys/batch')
            .set('Cookie', getCookie())
            .send({ keys: 'baddevice1:shorthash,baddevice2:also_short' });
        expect(res.status).toBe(400);
        expect(res.body.data.errors.length).toBe(2);
        expect(res.body.data.provisioned.length).toBe(0);
    });

    test('non-admin cannot batch create device keys', async () => {
        const res = await request(app)
            .post('/api/device-keys/batch')
            .set('Cookie', `token=${nonAdminToken}`)
            .send({ keys: 'DKBATCH_HACK:' + 'a'.repeat(64) });
        expect(res.status).toBe(403);
    });

    test('returns 400 for missing keys field', async () => {
        const res = await request(app)
            .post('/api/device-keys/batch')
            .set('Cookie', getCookie())
            .send({});
        expect(res.status).toBe(400);
    });

    test('returns 400 for non-string keys field', async () => {
        const res = await request(app)
            .post('/api/device-keys/batch')
            .set('Cookie', getCookie())
            .send({ keys: ['array', 'not', 'string'] });
        expect(res.status).toBe(400);
    });
});