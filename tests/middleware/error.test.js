require('dotenv').config();
const request = require('supertest');
const app = require('../../src/app');

describe('Error Middleware', () => {
    test('returns 404 for unknown route', async () => {
        const res = await request(app).get('/nonexistent-path-12345');
        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
    });

    test('returns 404 for unknown API route', async () => {
        const res = await request(app).get('/api/unknown-endpoint');
        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
    });

    test('returns 400 for malformed JSON body', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .set('Content-Type', 'application/json')
            .send('this is not json');
        expect(res.status).toBe(400);
    });

    test('returns 413 for oversized body', async () => {
        const bigBody = 'x'.repeat(11000);
        const res = await request(app)
            .post('/api/auth/login')
            .send(bigBody);
        expect(res.status).toBe(413);
    });
});
