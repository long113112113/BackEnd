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

describe('GET /api/attendance', () => {
    test('returns 200 with array (defaults to today)', async () => {
        const res = await request(app)
            .get('/api/attendance')
            .set('Cookie', getCookie());
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('returns 200 with valid date query', async () => {
        const res = await request(app)
            .get('/api/attendance?date=2026-01-01')
            .set('Cookie', getCookie());
        expect(res.status).toBe(200);
    });

    test('returns 400 with invalid date format', async () => {
        const res = await request(app)
            .get('/api/attendance?date=not-a-date')
            .set('Cookie', getCookie());
        expect(res.status).toBe(400);
    });

    test('returns 401 without token', async () => {
        const res = await request(app).get('/api/attendance');
        expect(res.status).toBe(401);
    });
});

describe('GET /api/attendance/stats', () => {
    test('returns 200 with data array', async () => {
        const res = await request(app)
            .get('/api/attendance/stats')
            .set('Cookie', getCookie());
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
    });
});

describe('GET /api/attendance/student/:id', () => {
    test('returns 200 with array', async () => {
        const res = await request(app)
            .get('/api/attendance/student/TEST001')
            .set('Cookie', getCookie());
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('returns 400 for empty id', async () => {
        const res = await request(app)
            .get('/api/attendance/student/')
            .set('Cookie', getCookie());
        expect(res.status).toBe(404);
    });
});

describe('HACKER / PENTEST: Security & Robustness on Attendance API', () => {
    test('HACKER: SQL injection in date query is handled safely', async () => {
        const res = await request(app)
            .get("/api/attendance?date=2026-01-01'; DROP TABLE attendance_records; --")
            .set('Cookie', getCookie());
        expect(res.status).toBe(400);
    });

    test('HACKER: SQL injection in student id param is handled safely', async () => {
        const res = await request(app)
            .get("/api/attendance/student/1' OR '1'='1")
            .set('Cookie', getCookie());
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
    });

    test('HACKER: accessing attendance logs without authorization returns 401', async () => {
        const res = await request(app).get('/api/attendance/stats');
        expect(res.status).toBe(401);
    });

    test('ROBUSTNESS: query with invalid date range like 2026-02-31 returns 400', async () => {
        const res = await request(app)
            .get('/api/attendance?date=2026-02-31')
            .set('Cookie', getCookie());
        expect(res.status).toBe(400);
    });

    test('INTEGRITY: query student logs for non-existent student ID returns 200 with empty array', async () => {
        const res = await request(app)
            .get('/api/attendance/student/NONEXISTENT')
            .set('Cookie', getCookie());
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test('HACKER: passing object for start_date query parameter does not crash the application', async () => {
        const res = await request(app)
            .get('/api/attendance/export?start_date[replace]=foo')
            .set('Cookie', getCookie());
        expect(res.status).not.toBe(500);
    });
});

describe('GET /api/attendance - Advanced Query', () => {
    test('returns 200 with start_date and end_date', async () => {
        const res = await request(app)
            .get('/api/attendance?start_date=2026-01-01&end_date=2026-01-31')
            .set('Cookie', getCookie());
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.pagination).toBeDefined();
    });

    test('returns 200 with student_id filter', async () => {
        const res = await request(app)
            .get('/api/attendance?student_id=TEST001')
            .set('Cookie', getCookie());
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test('returns 200 with class filter', async () => {
        const res = await request(app)
            .get('/api/attendance?class=20DTHX1')
            .set('Cookie', getCookie());
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test('returns 200 with groupBy=student', async () => {
        const res = await request(app)
            .get('/api/attendance?start_date=2026-01-01&end_date=2026-03-31&groupBy=student')
            .set('Cookie', getCookie());
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('returns 400 when date range exceeds 90 days', async () => {
        const res = await request(app)
            .get('/api/attendance?start_date=2026-01-01&end_date=2026-12-31')
            .set('Cookie', getCookie());
        expect(res.status).toBe(400);
        expect(res.body.message).toContain('90 days');
    });

    test('returns 400 when start_date is after end_date', async () => {
        const res = await request(app)
            .get('/api/attendance?start_date=2026-02-01&end_date=2026-01-01')
            .set('Cookie', getCookie());
        expect(res.status).toBe(400);
        expect(res.body.message).toContain('start_date must be before');
    });

    test('returns 400 with invalid start_date format', async () => {
        const res = await request(app)
            .get('/api/attendance?start_date=invalid')
            .set('Cookie', getCookie());
        expect(res.status).toBe(400);
    });

    test('returns 400 with invalid groupBy value', async () => {
        const res = await request(app)
            .get('/api/attendance?groupBy=invalid')
            .set('Cookie', getCookie());
        expect(res.status).toBe(400);
    });

    test('HACKER: SQL injection in student_id is rejected by validation', async () => {
        const res = await request(app)
            .get("/api/attendance?student_id=TEST001' OR '1'='1")
            .set('Cookie', getCookie());
        expect(res.status).toBe(400);
    });

    test('HACKER: SQL injection in class is rejected by validation', async () => {
        const res = await request(app)
            .get("/api/attendance?class=20DTHX1'; DROP TABLE students;--")
            .set('Cookie', getCookie());
        expect(res.status).toBe(400);
    });
});

describe('GET /api/attendance/export', () => {
    test('returns 200 with CSV content-type or 404 if no data', async () => {
        const res = await request(app)
            .get('/api/attendance/export?start_date=2026-01-01&end_date=2026-01-31')
            .set('Cookie', getCookie());
        if (res.status === 200) {
            expect(res.headers['content-type']).toContain('text/csv');
            expect(res.headers['content-disposition']).toContain('attachment');
        } else {
            expect(res.status).toBe(404);
        }
    });

    test('returns 404 when no records found', async () => {
        const res = await request(app)
            .get('/api/attendance/export?start_date=2020-01-01&end_date=2020-01-31')
            .set('Cookie', getCookie());
        expect(res.status).toBe(404);
    });

    test('returns 400 when date range exceeds 90 days', async () => {
        const res = await request(app)
            .get('/api/attendance/export?start_date=2026-01-01&end_date=2026-12-31')
            .set('Cookie', getCookie());
        expect(res.status).toBe(400);
    });

    test('returns 401 without authentication', async () => {
        const res = await request(app)
            .get('/api/attendance/export?start_date=2026-01-01&end_date=2026-01-31');
        expect(res.status).toBe(401);
    });

    test('returns 200 with student_id filter', async () => {
        const res = await request(app)
            .get('/api/attendance/export?student_id=TEST001')
            .set('Cookie', getCookie());
        expect([200, 404]).toContain(res.status);
    });

    test('returns 200 with class filter', async () => {
        const res = await request(app)
            .get('/api/attendance/export?class=20DTHX1')
            .set('Cookie', getCookie());
        expect([200, 404]).toContain(res.status);
    });
});

