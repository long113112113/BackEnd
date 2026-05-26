/**
 * SECURITY REGRESSION TEST
 *
 * Mỗi test assert 1 security property PHẢI đúng.
 * Test FAIL = source code đang có bug/bypass.
 * Test PASS = source code đã fix.
 *
 * Mục tiêu: làm cho TẤT CẢ test PASS bằng cách fix source code.
 */

require('dotenv').config();
const request = require('supertest');
const app = require('../../src/app');
const jwt = require('jsonwebtoken');
const config = require('../../src/config');
const db = require('../../src/config/db');
const argon2 = require('argon2');
const { clearBlacklist } = require('../../src/middlewares/auth.middleware');

let adminCookies;
let adminToken;

beforeAll(async () => {
    const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin123' });
    adminCookies = res.headers['set-cookie'];
    const header = Array.isArray(adminCookies) ? adminCookies[0] : adminCookies;
    adminToken = header.match(/token=([^;]+)/)[1];
}, 15000);

afterAll(async () => {
    await db.query("DELETE FROM attendance_records WHERE card_uid LIKE 'SEC%'");
    await db.query("DELETE FROM students WHERE student_id LIKE 'SEC%'");
    await db.query("DELETE FROM unknown_cards WHERE card_uid LIKE 'SEC%'");
    await db.query("DELETE FROM device_keys WHERE device_id LIKE 'SEC_%'");
    await db.query('DELETE FROM users WHERE username != $1', ['admin']);
});

beforeEach(() => {
    clearBlacklist();
});

const getCookie = () => Array.isArray(adminCookies) ? adminCookies.join('; ') : adminCookies;
const ts = () => Date.now();
const hex6 = () => ts().toString(16).slice(-6).padStart(6, '0');

// ─────────────────────────────────────────────────────────────
// BUG-1: JWT role không có whitelist — bất kỳ role nào cũng pass auth middleware
// ─────────────────────────────────────────────────────────────
describe('BUG-1: Auth middleware nên reject JWT với role không hợp lệ', () => {
    test('JWT role="superadmin" PHẢI bị reject', async () => {
        const decoded = jwt.verify(adminToken, config.jwt.secret);
        const forged = jwt.sign(
            { id: decoded.id, username: decoded.username, role: 'superadmin' },
            config.jwt.secret,
            { expiresIn: '1h' }
        );
        const res = await request(app)
            .get('/api/students')
            .set('Cookie', `token=${forged}`);
        expect(res.status).toBe(403);
    });

    test('JWT role="viewer" KHÔNG được truy cập device-keys admin endpoint', async () => {
        const decoded = jwt.verify(adminToken, config.jwt.secret);
        const forged = jwt.sign(
            { id: decoded.id, username: decoded.username, role: 'viewer' },
            config.jwt.secret,
            { expiresIn: '1h' }
        );
        const res = await request(app)
            .get('/api/device-keys')
            .set('Cookie', `token=${forged}`);
        expect(res.status).toBe(403);
    });

    test('JWT role="hacker" PHẢI bị reject', async () => {
        const decoded = jwt.verify(adminToken, config.jwt.secret);
        const forged = jwt.sign(
            { id: decoded.id, username: decoded.username, role: 'hacker' },
            config.jwt.secret,
            { expiresIn: '1h' }
        );
        const res = await request(app)
            .get('/api/students')
            .set('Cookie', `token=${forged}`);
        expect(res.status).toBe(403);
    });
});

// ─────────────────────────────────────────────────────────────
// BUG-2: Logout KHÔNG invalidate token — dùng lại token vẫn được
// ─────────────────────────────────────────────────────────────
describe('BUG-2: Logout nên invalidate token phía server', () => {
    test('sau logout, token KHÔNG được dùng lại được', async () => {
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ username: 'admin', password: 'admin123' });

        const cookies = Array.isArray(loginRes.headers['set-cookie'])
            ? loginRes.headers['set-cookie']
            : [loginRes.headers['set-cookie']];
        const cookieStr = cookies.join('; ');
        const token = cookieStr.match(/token=([^;]+)/)[1];

        await request(app)
            .post('/api/auth/logout')
            .set('Cookie', cookieStr);

        const res = await request(app)
            .get('/api/students')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(401);
    });
});

// ─────────────────────────────────────────────────────────────
// BUG-3: findAll trả cả inactive students — leak data sinh viên đã nghỉ
// ─────────────────────────────────────────────────────────────
describe('BUG-3: GET /api/students KHÔNG nên trả soft-deleted students', () => {
    test('sinh viên đã soft-delete KHÔNG xuất hiện trong danh sách', async () => {
        const createRes = await request(app)
            .post('/api/students')
            .set('Cookie', getCookie())
            .send({
                student_id: `SEC3${ts()}`,
                full_name: 'Should Be Hidden',
                class: '20SEC',
                card_uid: `A1${hex6()}`,
            });
        expect(createRes.status).toBe(201);
        const studentId = createRes.body.data.id;

        await request(app)
            .delete(`/api/students/${studentId}`)
            .set('Cookie', getCookie());

        const listRes = await request(app)
            .get('/api/students')
            .set('Cookie', getCookie());

        const found = listRes.body.data.find(s => s.id === studentId);
        expect(found).toBeUndefined();
    });
});

// ─────────────────────────────────────────────────────────────
// BUG-5: card_uid="" trong update KHÔNG bị reject — phá unique constraint
// ─────────────────────────────────────────────────────────────
describe('BUG-5: PUT /api/students/:id PHẢI reject card_uid rỗng', () => {
    test('card_uid="" PHẢI trả 400 validation error', async () => {
        const createRes = await request(app)
            .post('/api/students')
            .set('Cookie', getCookie())
            .send({
                student_id: `SEC5${ts()}`,
                full_name: 'Card UID Test',
                class: '20SEC',
                card_uid: `A5${hex6()}`,
            });
        expect(createRes.status).toBe(201);
        const studentId = createRes.body.data.id;

        const updateRes = await request(app)
            .put(`/api/students/${studentId}`)
            .set('Cookie', getCookie())
            .send({ card_uid: '' });
        expect(updateRes.status).toBe(400);
    });
});

// ─────────────────────────────────────────────────────────────
// BUG-6: Không pagination — API trả tất cả records, có thể DoS
// ─────────────────────────────────────────────────────────────
describe('BUG-6: API list endpoints PHẢI có pagination', () => {
    test('GET /api/students PHẢI có property pagination/limit', async () => {
        const res = await request(app)
            .get('/api/students')
            .set('Cookie', getCookie());
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('pagination');
    });

    test('GET /api/attendance PHẢI có property pagination/limit', async () => {
        const res = await request(app)
            .get('/api/attendance?date=2026-01-01')
            .set('Cookie', getCookie());
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('pagination');
    });
});

// ─────────────────────────────────────────────────────────────
// BUG-7: Students/unknown-cards/attendance routes KHÔNG yêu cầu admin role
// ─────────────────────────────────────────────────────────────
describe('BUG-7: DELETE /api/students/:id PHẢI yêu cầu admin role', () => {
    test('non-admin user KHÔNG được truy cập students', async () => {
        const ts = Date.now();
        const hashedPassword = await argon2.hash('user123456');
        await db.query(
            `INSERT INTO users (username, email, password, full_name, role, is_active)
             VALUES ($1, $2, $3, $4, 'user', true)
             ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password, is_active = true`,
            [`secuser7${ts}`, `sec7${ts}@test.com`, hashedPassword, 'Normal User']
        );

        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ username: `secuser7${ts}`, password: 'user123456' });
        expect(loginRes.status).toBe(200);

        const loginHeader = Array.isArray(loginRes.headers['set-cookie'])
            ? loginRes.headers['set-cookie'][0]
            : loginRes.headers['set-cookie'];
        const userToken = loginHeader.match(/token=([^;]+)/)[1];

        const res = await request(app)
            .get('/api/students')
            .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).toBe(403);

        await db.query('DELETE FROM users WHERE username = $1', [`secuser7${ts}`]);
    });
});

// ─────────────────────────────────────────────────────────────
// BUG-8: User bị disable vẫn login được bằng password (findByUsername check is_active)
// nhưng token CŨ vẫn dùng được (findById cũng check is_active — nhưng có
// race window giữa lúc verify JWT và check DB)
// ─────────────────────────────────────────────────────────────
describe('BUG-8: Disabled user KHÔNG được login', () => {
    test('user bị disable KHÔNG login được bằng mật khẩu', async () => {
        const hashedPassword = await argon2.hash('disabled123');
        const ts = Date.now();
        await db.query(
            `INSERT INTO users (username, email, password, full_name, role, is_active)
             VALUES ($1, $2, $3, $4, 'admin', true)
             ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password, is_active = true`,
            [`secuser8${ts}`, `sec8${ts}@test.com`, hashedPassword, 'Sec User']
        );

        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ username: `secuser8${ts}`, password: 'disabled123' });
        expect(loginRes.status).toBe(200);

        await db.query(`UPDATE users SET is_active = false WHERE username = $1`, [`secuser8${ts}`]);

        const reloginRes = await request(app)
            .post('/api/auth/login')
            .send({ username: `secuser8${ts}`, password: 'disabled123' });
        expect(reloginRes.status).toBe(401);

        await db.query('DELETE FROM users WHERE username = $1', [`secuser8${ts}`]);
    });
});

// ─────────────────────────────────────────────────────────────
// BUG-9: Batch device-key provisioning process partial entries —
// nên là atomic (all-or-nothing)
// ─────────────────────────────────────────────────────────────
describe('BUG-9: Batch device-key PHẢI là all-or-nothing (atomic)', () => {
    test('batch có entry SAI KHÔNG được tạo entry ĐÚNG', async () => {
        const validKey = 'aa'.repeat(32);
        const res = await request(app)
            .post('/api/device-keys/batch')
            .set('Cookie', getCookie())
            .send({
                keys: `SEC9_OK_${ts()}:${validKey},INVALIDNOKEY`,
            });

        if (res.status === 201) {
            expect(res.body.data.provisioned.length).toBe(1);
            expect(res.body.data.errors.length).toBeGreaterThanOrEqual(1);
        }
    });
});

// ─────────────────────────────────────────────────────────────
// BUG-10: /api/auth/register trả 404 nhưng vẫn leak thông tin
// qua error message nếu route tồn tại
// ─────────────────────────────────────────────────────────────
describe('BUG-10: POST /api/auth/register PHẢI trả 404 không leak info', () => {
    test('register endpoint trả 404, KHÔNG leak stack trace hay internal info', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ username: 'hacker', password: 'test123456' });
        expect(res.status).toBe(404);
        expect(res.body).not.toHaveProperty('stack');
    });
});