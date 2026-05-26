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

    test('returns 400 for invalid cardUid format (non-hex)', async () => {
        const res = await request(app)
            .delete('/api/unknown-cards/not-hex!!!')
            .set('Cookie', getCookie());
        expect(res.status).toBe(400);
    });
});

describe('PENTEST: cardUid validation boundaries', () => {
    test('rejects 0x prefix (isHexadecimal bypass attempt)', async () => {
        const res = await request(app)
            .delete('/api/unknown-cards/0x12345678')
            .set('Cookie', getCookie());
        expect(res.status).toBe(400);
    });

    test('rejects 0h prefix (isHexadecimal bypass attempt)', async () => {
        const res = await request(app)
            .delete('/api/unknown-cards/0H12345678')
            .set('Cookie', getCookie());
        expect(res.status).toBe(400);
    });

    test('rejects cardUid too short (< 8 hex chars)', async () => {
        const res = await request(app)
            .delete('/api/unknown-cards/ABC')
            .set('Cookie', getCookie());
        expect(res.status).toBe(400);
    });

    test('rejects cardUid exactly 7 hex chars (boundary under minimum)', async () => {
        const res = await request(app)
            .delete('/api/unknown-cards/ABCDEF7')
            .set('Cookie', getCookie());
        expect(res.status).toBe(400);
    });

    test('accepts cardUid with exactly 8 hex chars (minimum valid)', async () => {
        const res = await request(app)
            .delete('/api/unknown-cards/AB12CD34')
            .set('Cookie', getCookie());
        expect(res.status).toBe(404);
    });

    test('accepts cardUid with mixed case', async () => {
        const res = await request(app)
            .delete('/api/unknown-cards/aAbBcCdDeEfF')
            .set('Cookie', getCookie());
        expect(res.status).toBe(404);
    });

    test('accepts cardUid with all lowercase', async () => {
        const res = await request(app)
            .delete('/api/unknown-cards/aabbccddeeff')
            .set('Cookie', getCookie());
        expect(res.status).toBe(404);
    });

    test('rejects cardUid with exactly 51 hex chars (boundary over max)', async () => {
        const res = await request(app)
            .delete('/api/unknown-cards/' + 'A'.repeat(51))
            .set('Cookie', getCookie());
        expect(res.status).toBe(400);
    });

    test('rejects null byte injection in cardUid', async () => {
        const res = await request(app)
            .delete('/api/unknown-cards/12345678%00inject')
            .set('Cookie', getCookie());
        expect(res.status).toBe(400);
    });

    test('rejects unicode characters in cardUid', async () => {
        const res = await request(app)
            .delete('/api/unknown-cards/caf\u00e9beef')
            .set('Cookie', getCookie());
        expect(res.status).toBe(400);
    });

    test('rejects special chars in cardUid', async () => {
        const res = await request(app)
            .delete('/api/unknown-cards/12;DROP%20--')
            .set('Cookie', getCookie());
        expect(res.status).toBe(400);
    });

    test('rejects CRLF injection in cardUid', async () => {
        const res = await request(app)
            .delete('/api/unknown-cards/1234%0d%0aInjected')
            .set('Cookie', getCookie());
        expect(res.status).toBe(400);
    });
});

describe('HACKER / PENTEST: Unknown Cards Auth Bypass Checks', () => {
    test('HACKER: GET /api/unknown-cards returns 401 without auth', async () => {
        const res = await request(app).get('/api/unknown-cards');
        expect(res.status).toBe(401);
    });

    test('HACKER: DELETE /api/unknown-cards/:cardUid returns 401 without auth', async () => {
        const res = await request(app).delete('/api/unknown-cards/BEEF1234DEAD');
        expect(res.status).toBe(401);
    });

    test('SECURITY: SQL injection in cardUid parameter fails gracefully', async () => {
        const res = await request(app)
            .delete("/api/unknown-cards/BEEF1234DEAD' OR '1'='1")
            .set('Cookie', getCookie());
        expect(res.status).toBe(400);
    });

    test('INTEGRITY: deleting an unknown card removes it from listing', async () => {
        await db.query(
            "INSERT INTO unknown_cards (card_uid, device_id) VALUES ('DEADBEEF0000', 'ESP32-01') ON CONFLICT DO NOTHING"
        );

        const deleteRes = await request(app)
            .delete('/api/unknown-cards/DEADBEEF0000')
            .set('Cookie', getCookie());
        expect(deleteRes.status).toBe(200);

        const listRes = await request(app)
            .get('/api/unknown-cards')
            .set('Cookie', getCookie());
        expect(listRes.status).toBe(200);
        const containsDeleted = listRes.body.data.some(c => c.card_uid === 'DEADBEEF0000');
        expect(containsDeleted).toBe(false);
    });
});
