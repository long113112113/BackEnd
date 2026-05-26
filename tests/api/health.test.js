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

describe('Response Header Security', () => {
    test('response includes security headers', async () => {
        const res = await request(app).get('/api/health');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    });
});

describe('CORS', () => {
    test('sets access-control-allow-origin for allowed origin', async () => {
        const res = await request(app)
            .get('/api/health')
            .set('Origin', 'http://localhost:5173');
        expect(res.status).toBe(200);
        expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    test('requests without Origin header succeed (same-origin)', async () => {
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
    });

    test('disallowed origin is rejected', async () => {
        const res = await request(app)
            .get('/api/health')
            .set('Origin', 'http://evil.example.com');
        expect(res.status).toBe(500);
    });
});
