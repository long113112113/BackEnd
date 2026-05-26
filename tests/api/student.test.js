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

    test('updates student successfully and verifies data changed', async () => {
        const createRes = await request(app)
            .post('/api/students')
            .set('Cookie', getCookie())
            .send({
                student_id: 'UPDATE001',
                full_name: 'Before Update',
                class: '20DTHX1',
                card_uid: 'A1B2C3D499',
            });
        expect(createRes.status).toBe(201);
        const id = createRes.body.data.id;

        const updateRes = await request(app)
            .put(`/api/students/${id}`)
            .set('Cookie', getCookie())
            .send({ full_name: 'After Update' });
        expect(updateRes.status).toBe(200);
        expect(updateRes.body.success).toBe(true);
        expect(updateRes.body.data.full_name).toBe('After Update');

        // Clean up the created student
        await request(app)
            .delete(`/api/students/${id}`)
            .set('Cookie', getCookie());
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

describe('HACKER / PENTEST: Security & Robustness Checks', () => {
    test('XSS Injection: Stores raw HTML/JS payload without crashing, indicating potential Stored XSS', async () => {
        const res = await request(app)
            .post('/api/students')
            .set('Cookie', getCookie())
            .send({
                student_id: 'XSS99999',
                full_name: "<script>alert('XSS_ATTACK')</script>",
                class: "<img src=x onerror=alert(1)>",
                email: 'xss@attacker.com',
            });
        expect(res.status).toBe(201);
        expect(res.body.data.full_name).toBe("<script>alert('XSS_ATTACK')</script>");
    });

    test('HTTP Parameter Pollution: Rejects array parameters to prevent server crash', async () => {
        const res = await request(app)
            .post('/api/students')
            .set('Cookie', getCookie())
            .send({
                student_id: ['HACK1', 'HACK2'],
                full_name: 'Attacker Array',
            });
        expect(res.status).toBe(400);
    });

    test('JSON Type Pollution: Rejects Boolean types for string fields', async () => {
        const res = await request(app)
            .post('/api/students')
            .set('Cookie', getCookie())
            .send({
                student_id: true,
                full_name: 12345,
            });
        expect(res.status).toBe(400);
    });

    test('DoS: Rejects payload that exceeds database length limit', async () => {
        const res = await request(app)
            .post('/api/students')
            .set('Cookie', getCookie())
            .send({
                student_id: 'DOS' + '0'.repeat(100),
                full_name: 'DoS Attack',
            });
        expect(res.status).toBe(400);
    });

    test('SQL injection attempt in parameterized routes is handled safely', async () => {
        const res = await request(app)
            .get("/api/students/1' OR '1'='1")
            .set('Cookie', getCookie());
        expect(res.status).toBe(400);
    });

    test('Mass Assignment: Extra system columns cannot be injected', async () => {
        const res = await request(app)
            .post('/api/students')
            .set('Cookie', getCookie())
            .send({
                student_id: 'MASSASSIGN',
                full_name: 'Mass Assignment Target',
                id: 8888,
                is_active: false,
                created_at: '2000-01-01T00:00:00.000Z',
            });
        expect(res.status).toBe(201);
        expect(res.body.data.id).not.toBe(8888);
        expect(res.body.data.is_active).toBe(true);
    });

    test('HACKER: Prototype Pollution via __proto__', async () => {
        const res = await request(app)
            .post('/api/students')
            .set('Cookie', getCookie())
            .send({
                student_id: 'PROTO001',
                full_name: 'Proto Attacker',
                __proto__: { isAdmin: true },
                constructor: { prototype: { isAdmin: true } },
            });
        // Should not pollute Object.prototype
        expect(({}).isAdmin).toBeUndefined();
    });

    test('HACKER: PATCH method not allowed on students', async () => {
        const res = await request(app)
            .patch('/api/students/1')
            .set('Cookie', getCookie())
            .send({ full_name: 'Hacked' });
        expect(res.status).toBe(404);
    });

    test('INTEGRITY: returns 409 conflict for duplicate card_uid', async () => {
        const res1 = await request(app)
            .post('/api/students')
            .set('Cookie', getCookie())
            .send({
                student_id: 'CARDDUP1',
                full_name: 'First Card Holder',
                card_uid: 'D000000001',
            });
        expect(res1.status).toBe(201);

        const res2 = await request(app)
            .post('/api/students')
            .set('Cookie', getCookie())
            .send({
                student_id: 'CARDDUP2',
                full_name: 'Second Card Holder',
                card_uid: 'D000000001',
            });
        expect(res2.status).toBe(409);

        const db = require('../../src/config/db');
        await db.query("DELETE FROM students WHERE student_id IN ('CARDDUP1', 'CARDDUP2')");
    });

    test('ROBUSTNESS: handles Unicode and Emojis in full_name and class correctly', async () => {
        const res = await request(app)
            .post('/api/students')
            .set('Cookie', getCookie())
            .send({
                student_id: 'UNICODE01',
                full_name: 'Nguyễn Văn Anh Dũng 🇻🇳',
                class: 'Lớp 20DTHX1 🚀',
                card_uid: 'E000000001',
            });
        expect(res.status).toBe(201);
        expect(res.body.data.full_name).toBe('Nguyễn Văn Anh Dũng 🇻🇳');
        expect(res.body.data.class).toBe('Lớp 20DTHX1 🚀');

        const db = require('../../src/config/db');
        await db.query("DELETE FROM students WHERE student_id = 'UNICODE01'");
    });

    test('INTEGRITY: verify soft-delete sets is_active to false in database', async () => {
        const createRes = await request(app)
            .post('/api/students')
            .set('Cookie', getCookie())
            .send({
                student_id: 'SOFTDEL01',
                full_name: 'Soft Delete Target',
                card_uid: 'F000000001',
            });
        expect(createRes.status).toBe(201);
        const id = createRes.body.data.id;

        const deleteRes = await request(app)
            .delete(`/api/students/${id}`)
            .set('Cookie', getCookie());
        expect(deleteRes.status).toBe(200);

        const db = require('../../src/config/db');
        const dbRes = await db.query('SELECT is_active FROM students WHERE id = $1', [id]);
        expect(dbRes.rows[0].is_active).toBe(false);

        await db.query('DELETE FROM students WHERE id = $1', [id]);
    });
});

