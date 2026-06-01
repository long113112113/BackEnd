require('dotenv').config();
const request = require('supertest');
const app = require('../../src/app');

let cookies;

beforeAll(async () => {
    const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin123' });
    cookies = res.headers['set-cookie'];
});

const getCookie = () => cookies;

describe('GET /api/dashboard/chart', () => {
    test('returns 200 with chart data', async () => {
        const res = await request(app)
            .get('/api/dashboard/chart')
            .set('Cookie', getCookie());
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('checkins');
        expect(res.body.data).toHaveProperty('newStudents');
        expect(res.body.data).toHaveProperty('anomalies');
        expect(Array.isArray(res.body.data.checkins)).toBe(true);
        expect(Array.isArray(res.body.data.newStudents)).toBe(true);
        expect(Array.isArray(res.body.data.anomalies)).toBe(true);
    });

    test('accepts start_date and end_date query params', async () => {
        const res = await request(app)
            .get('/api/dashboard/chart')
            .query({ start_date: '2024-01-01', end_date: '2024-12-31' })
            .set('Cookie', getCookie());
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test('returns 401 without authentication', async () => {
        const res = await request(app).get('/api/dashboard/chart');
        expect(res.status).toBe(401);
    });
});

describe('GET /api/dashboard/stream (SSE)', () => {
    test('returns 401 without authentication', async () => {
        const res = await request(app).get('/api/dashboard/stream');
        expect(res.status).toBe(401);
    });

    test('sets correct SSE headers', async () => {
        const req = request(app)
            .get('/api/dashboard/stream')
            .set('Cookie', getCookie())
            .buffer(true)
            .parse((res, callback) => {
                let data = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                    data += chunk;
                    if (data.includes('heartbeat')) {
                        res.destroy();
                        callback(null, data);
                    }
                });
                res.on('end', () => callback(null, data));
            });

        const res = await req;
        expect(res.headers['content-type']).toBe('text/event-stream');
        expect(res.headers['cache-control']).toBe('no-cache');
        expect(res.headers['x-accel-buffering']).toBe('no');
    });

    test('sends initial chart data and heartbeat', async () => {
        const req = request(app)
            .get('/api/dashboard/stream')
            .set('Cookie', getCookie())
            .buffer(true)
            .parse((res, callback) => {
                let data = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                    data += chunk;
                    if (data.includes('heartbeat')) {
                        res.destroy();
                        callback(null, data);
                    }
                });
                res.on('end', () => callback(null, data));
            });

        const res = await req;
        expect(res.body).toContain('event: chart');
        expect(res.body).toContain('event: heartbeat');
        expect(res.body).toContain('retry: 3000');
    });

    test('accepts start_date and end_date query params', async () => {
        const req = request(app)
            .get('/api/dashboard/stream')
            .query({ start_date: '2024-01-01', end_date: '2024-12-31' })
            .set('Cookie', getCookie())
            .buffer(true)
            .parse((res, callback) => {
                let data = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                    data += chunk;
                    if (data.includes('heartbeat')) {
                        res.destroy();
                        callback(null, data);
                    }
                });
                res.on('end', () => callback(null, data));
            });

        const res = await req;
        expect(res.body).toContain('event: chart');
    });
});
