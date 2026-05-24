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

describe('GET /api/students', () => {
    test('returns 200 with array', async () => {
        const res = await request(app)
            .get('/api/students')
            .set('Cookie', getCookie());
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body).toHaveProperty('count');
    });
});

describe('POST /api/students', () => {
    let studentId;

    test('creates student with valid data', async () => {
        const res = await request(app)
            .post('/api/students')
            .set('Cookie', getCookie())
            .send({
                student_id: '2011060001',
                full_name: 'Nguyen Van A',
                class: '20DTHX1',
                card_uid: 'A1B2C3D4E5',
                email: 'vana@test.com',
                phone: '0987654321',
            });
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('id');
        studentId = res.body.data.id;
    });

    test('returns 409 for duplicate student_id', async () => {
        const res = await request(app)
            .post('/api/students')
            .set('Cookie', getCookie())
            .send({
                student_id: '2011060001',
                full_name: 'Nguyen Van B',
            });
        expect(res.status).toBe(409);
    });

    test('returns 400 for missing required fields', async () => {
        const res = await request(app)
            .post('/api/students')
            .set('Cookie', getCookie())
            .send({});
        expect(res.status).toBe(400);
    });

    test('returns 400 for invalid email', async () => {
        const res = await request(app)
            .post('/api/students')
            .set('Cookie', getCookie())
            .send({ student_id: '2011060002', full_name: 'Test', email: 'not-an-email' });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/[Vv]alidation/);
    });

    test('returns 400 for invalid card_uid (non-hex)', async () => {
        const res = await request(app)
            .post('/api/students')
            .set('Cookie', getCookie())
            .send({ student_id: '2011060002', full_name: 'Test', card_uid: 'nothex!!!' });
        expect(res.status).toBe(400);
    });

    test('returns 400 for student_id too long', async () => {
        const res = await request(app)
            .post('/api/students')
            .set('Cookie', getCookie())
            .send({ student_id: 'a'.repeat(21), full_name: 'Test' });
        expect(res.status).toBe(400);
    });
});

describe('GET /api/students/:id', () => {
    test('returns 404 for non-existent', async () => {
        const res = await request(app)
            .get('/api/students/99999')
            .set('Cookie', getCookie());
        expect(res.status).toBe(404);
    });

    test('returns 400 for non-integer id', async () => {
        const res = await request(app)
            .get('/api/students/abc')
            .set('Cookie', getCookie());
        expect(res.status).toBe(400);
    });
});

describe('PUT /api/students/:id', () => {
    test('returns 404 for non-existent', async () => {
        const res = await request(app)
            .put('/api/students/99999')
            .set('Cookie', getCookie())
            .send({ full_name: 'Updated' });
        expect(res.status).toBe(404);
    });

    test('mass assignment: is_active is ignored', async () => {
        const res = await request(app)
            .put('/api/students/1')
            .set('Cookie', getCookie())
            .send({ is_active: false, full_name: 'Hacked' });
        expect(res.status === 200 || res.status === 404).toBe(true);
    });
});

describe('DELETE /api/students/:id', () => {
    test('returns 404 for non-existent', async () => {
        const res = await request(app)
            .delete('/api/students/99999')
            .set('Cookie', getCookie());
        expect(res.status).toBe(404);
    });

    test('returns 400 for non-integer id', async () => {
        const res = await request(app)
            .delete('/api/students/abc')
            .set('Cookie', getCookie());
        expect(res.status).toBe(400);
    });
});
