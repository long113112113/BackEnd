require('dotenv').config();
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/db');

let cookies;

beforeAll(async () => {
    const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin123' });
    cookies = res.headers['set-cookie'];

    await db.query(
        `INSERT INTO unknown_cards (card_uid, device_id) VALUES ($1, $2)
         ON CONFLICT (card_uid) DO UPDATE SET seen_count = unknown_cards.seen_count + 1`,
        ['BEEF1234DEAD', 'ESP32-01']
    );
});

afterAll(async () => {
    await db.query('DELETE FROM unknown_cards');
});

const getCookie = () => cookies;

describe('GET /api/unknown-cards', () => {
    test('returns 200 with array', async () => {
        const res = await request(app)
            .get('/api/unknown-cards')
            .set('Cookie', getCookie());
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
    });
});

describe('DELETE /api/unknown-cards/:cardUid', () => {
    test('deletes existing card', async () => {
        const res = await request(app)
            .delete('/api/unknown-cards/BEEF1234DEAD')
            .set('Cookie', getCookie());
        expect(res.status).toBe(200);
    });

    test('returns 404 for non-existent', async () => {
        const res = await request(app)
            .delete('/api/unknown-cards/FFFF00000000')
            .set('Cookie', getCookie());
        expect(res.status).toBe(404);
    });

    test('returns 400 for invalid cardUid format', async () => {
        const res = await request(app)
            .delete('/api/unknown-cards/not-hex!!!')
            .set('Cookie', getCookie());
        expect(res.status).toBe(400);
    });
});
