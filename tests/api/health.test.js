require('dotenv').config();
const request = require('supertest');
const app = require('../../src/app');

describe('GET /api/health', () => {
    test('returns 200 with success', async () => {
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body).toHaveProperty('timestamp');
    });
});

describe('GET /', () => {
    test('returns 200 with server info', async () => {
        const res = await request(app).get('/');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message');
        expect(res.body).toHaveProperty('version');
        expect(res.body).toHaveProperty('endpoints');
    });
});

describe('Non-existent route', () => {
    test('returns 404', async () => {
        const res = await request(app).get('/api/nonexistent');
        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
    });
});
