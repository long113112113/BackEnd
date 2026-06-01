require('dotenv').config();
const request = require('supertest');
const app = require('../../src/app');
const SSE_Broadcast = require('../../src/services/sse.broadcast');

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

describe('GET /api/dashboard/stream/unknown-cards (SSE)', () => {
    test('returns 401 without authentication', async () => {
        const res = await request(app).get('/api/dashboard/stream/unknown-cards');
        expect(res.status).toBe(401);
    });

    test('sets correct SSE headers', async () => {
        const req = request(app)
            .get('/api/dashboard/stream/unknown-cards')
            .set('Cookie', getCookie())
            .buffer(true)
            .parse((res, callback) => {
                let data = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                    data += chunk;
                    res.destroy();
                    callback(null, data);
                });
                res.on('end', () => callback(null, data));
            });

        const res = await req;
        expect(res.headers['content-type']).toBe('text/event-stream');
        expect(res.headers['cache-control']).toBe('no-cache');
        expect(res.headers['x-accel-buffering']).toBe('no');
    });

    test('sends retry field initially', async () => {
        const req = request(app)
            .get('/api/dashboard/stream/unknown-cards')
            .set('Cookie', getCookie())
            .buffer(true)
            .parse((res, callback) => {
                let data = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                    data += chunk;
                    if (data.includes('retry')) {
                        res.destroy();
                        callback(null, data);
                    }
                });
                res.on('end', () => callback(null, data));
            });

        const res = await req;
        expect(res.body).toContain('retry: 3000');
    });

    test('receives broadcast event for unknown card', async () => {
        let sseData = '';

        const req = request(app)
            .get('/api/dashboard/stream/unknown-cards')
            .set('Cookie', getCookie())
            .buffer(true)
            .parse((res, callback) => {
                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                    sseData += chunk;
                    if (sseData.includes('event: unknown-card')) {
                        res.destroy();
                        callback(null, sseData);
                    }
                });
                res.on('end', () => callback(null, sseData));
            });

        setTimeout(() => {
            SSE_Broadcast.broadcast('unknown-cards', 'unknown-card', {
                card_uid: 'TEST_CARD_UID',
                device_id: 'TEST_DEVICE',
                first_seen: new Date().toISOString(),
                latest_seen: new Date().toISOString(),
            });
        }, 200);

        const res = await req;
        expect(res.body).toContain('event: unknown-card');
        expect(res.body).toContain('TEST_CARD_UID');
        expect(res.body).toContain('TEST_DEVICE');
    });
});
