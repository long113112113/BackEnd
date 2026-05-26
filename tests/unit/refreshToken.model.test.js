require('dotenv').config();
const db = require('../../src/config/db');
const initDatabase = require('../../src/utils/initDb');
const UserModel = require('../../src/models/user.model');
const RefreshTokenModel = require('../../src/models/refreshToken.model');
const argon2 = require('argon2');
const crypto = require('crypto');

let userId;

beforeAll(async () => {
    await initDatabase();
    await db.query('DROP TABLE IF EXISTS refresh_tokens');
    await RefreshTokenModel.createTable();
    await db.query('DELETE FROM refresh_tokens');
    await db.query('DELETE FROM users WHERE username = $1', ['rt_test_user']);

    const hashedPassword = await argon2.hash('test123');
    const user = await db.query(
        `INSERT INTO users (username, email, password, full_name, role, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING id`,
        ['rt_test_user', 'rt@test.com', hashedPassword, 'RT Test User', 'admin']
    );
    userId = user.rows[0].id;
}, 30000);

afterAll(async () => {
    await db.query('DELETE FROM refresh_tokens');
    await db.query('DELETE FROM users WHERE username = $1', ['rt_test_user']);
});

describe('RefreshTokenModel.create', () => {
    test('creates token and returns rawToken + tokenHash + expiresAt', async () => {
        const result = await RefreshTokenModel.create(userId, 7 * 86400000);
        expect(result).toHaveProperty('rawToken');
        expect(result).toHaveProperty('tokenHash');
        expect(result).toHaveProperty('expiresAt');
        expect(result.rawToken).toHaveLength(64);
        expect(result.tokenHash).toHaveLength(64);
    });

    test('tokenHash is SHA-256 of rawToken', async () => {
        const result = await RefreshTokenModel.create(userId, 7 * 86400000);
        const expectedHash = crypto.createHash('sha256').update(result.rawToken).digest('hex');
        expect(result.tokenHash).toBe(expectedHash);
    });

    test('replaces old token for same user (one token per user)', async () => {
        const first = await RefreshTokenModel.create(userId, 7 * 86400000);
        const second = await RefreshTokenModel.create(userId, 7 * 86400000);

        const found1 = await RefreshTokenModel.findByHash(first.tokenHash);
        const found2 = await RefreshTokenModel.findByHash(second.tokenHash);

        expect(found1).toBeNull();
        expect(found2).not.toBeNull();
        expect(found2.user_id).toBe(userId);
    });
});

describe('RefreshTokenModel.findByHash', () => {
    test('returns token with user info for valid non-expired token', async () => {
        const { tokenHash } = await RefreshTokenModel.create(userId, 7 * 86400000);

        const found = await RefreshTokenModel.findByHash(tokenHash);
        expect(found).not.toBeNull();
        expect(found.user_id).toBe(userId);
        expect(found).toHaveProperty('username', 'rt_test_user');
        expect(found).toHaveProperty('role', 'admin');
        expect(found.is_active).toBe(true);
    });

    test('returns null for non-existent hash', async () => {
        const found = await RefreshTokenModel.findByHash('0'.repeat(64));
        expect(found).toBeNull();
    });

    test('returns null for expired token', async () => {
        const { tokenHash } = await RefreshTokenModel.create(userId, -10000);

        const found = await RefreshTokenModel.findByHash(tokenHash);
        expect(found).toBeNull();
    });
});

describe('RefreshTokenModel.deleteByHash', () => {
    test('removes token from database', async () => {
        const { tokenHash } = await RefreshTokenModel.create(userId, 7 * 86400000);

        await RefreshTokenModel.deleteByHash(tokenHash);
        const found = await RefreshTokenModel.findByHash(tokenHash);
        expect(found).toBeNull();
    });

    test('does not throw for non-existent hash', async () => {
        await expect(RefreshTokenModel.deleteByHash('0'.repeat(64))).resolves.not.toThrow();
    });
});

describe('RefreshTokenModel.deleteAllForUser', () => {
    test('removes all tokens for a user', async () => {
        await RefreshTokenModel.create(userId, 7 * 86400000);

        await RefreshTokenModel.deleteAllForUser(userId);
        const result = await db.query(
            'SELECT COUNT(*) FROM refresh_tokens WHERE user_id = $1',
            [userId]
        );
        expect(parseInt(result.rows[0].count, 10)).toBe(0);
    });
});

describe('RefreshTokenModel.cleanupExpired', () => {
    test('removes expired tokens', async () => {
        const { tokenHash } = await RefreshTokenModel.create(userId, -10000);

        await RefreshTokenModel.cleanupExpired();
        const found = await RefreshTokenModel.findByHash(tokenHash);
        expect(found).toBeNull();
    });
});
