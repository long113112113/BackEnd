require('dotenv').config();
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/db');

let cookies;
let studentId;

beforeAll(async () => {
    const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin123' });
    const cookie = loginRes.headers['set-cookie'];
    cookies = Array.isArray(cookie) ? cookie : [cookie];

    const createRes = await request(app)
        .post('/api/students')
        .set('Cookie', cookies.join('; '))
        .send({
            student_id: 'GBITEST001',
            full_name: 'Get By Id Student',
            class: '20DTH_GBI',
            card_uid: 'AAAA00000001',
            email: 'gbi@test.com',
            phone: '0900000001',
        });
    if (createRes.status !== 201) {
        throw new Error(`Failed to create student: ${JSON.stringify(createRes.body)}`);
    }
    studentId = createRes.body.data.id;
});

afterAll(async () => {
    await db.query('DELETE FROM students WHERE student_id = $1', ['GBITEST001']);
});

const getCookie = () => cookies.join('; ');

describe('GET /api/students/:id - with real student data', () => {
    test('returns 200 with correct student data', async () => {
        const res = await request(app)
            .get(`/api/students/${studentId}`)
            .set('Cookie', getCookie());
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('student_id', 'GBITEST001');
        expect(res.body.data).toHaveProperty('full_name', 'Get By Id Student');
        expect(res.body.data).toHaveProperty('class', '20DTH_GBI');
        expect(res.body.data).toHaveProperty('email', 'gbi@test.com');
        expect(res.body.data).toHaveProperty('phone', '0900000001');
    });

    test('does not expose password or sensitive fields', async () => {
        const res = await request(app)
            .get(`/api/students/${studentId}`)
            .set('Cookie', getCookie());
        expect(res.status).toBe(200);
        expect(res.body.data).not.toHaveProperty('password');
    });

    test('returns 401 without authentication', async () => {
        const res = await request(app).get(`/api/students/${studentId}`);
        expect(res.status).toBe(401);
    });
});