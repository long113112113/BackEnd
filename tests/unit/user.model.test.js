require('dotenv').config();
const db = require('../../src/config/db');
const initDatabase = require('../../src/utils/initDb');
const UserModel = require('../../src/models/user.model');
const argon2 = require('argon2');

beforeAll(async () => {
    await initDatabase();
    await db.query('DELETE FROM attendance_records');
    await db.query('DELETE FROM unknown_cards');
    await db.query('DELETE FROM students');
    await db.query('DELETE FROM device_keys');
    await db.query('DELETE FROM users');
}, 30000);

afterAll(async () => {
    await db.query('DELETE FROM users WHERE username LIKE $1', ['umtest_%']);
});

describe('UserModel.findByUsername', () => {
    test('returns active user by username', async () => {
        const hashedPassword = await argon2.hash('test123');
        await UserModel.create({
            username: 'umtest_active',
            email: 'umtest_active@test.com',
            password: hashedPassword,
            full_name: 'Active User',
            role: 'admin',
        });

        const user = await UserModel.findByUsername('umtest_active');
        expect(user).not.toBeNull();
        expect(user.username).toBe('umtest_active');
        expect(user.is_active).toBe(true);
    });

    test('returns null for non-existent username', async () => {
        const user = await UserModel.findByUsername('umtest_nonexistent');
        expect(user).toBeNull();
    });

    test('excludes inactive (disabled) user', async () => {
        const hashedPassword = await argon2.hash('test123');
        await UserModel.create({
            username: 'umtest_inactive',
            email: 'umtest_inactive@test.com',
            password: hashedPassword,
            full_name: 'Inactive User',
            role: 'admin',
        });
        await db.query("UPDATE users SET is_active = false WHERE username = $1", ['umtest_inactive']);

        const user = await UserModel.findByUsername('umtest_inactive');
        expect(user).toBeNull();
    });
});

describe('UserModel.findById', () => {
    test('returns user by id', async () => {
        const hashedPassword = await argon2.hash('test123');
        const created = await UserModel.create({
            username: 'umtest_findid',
            email: 'umtest_findid@test.com',
            password: hashedPassword,
            full_name: 'FindById User',
            role: 'admin',
        });

        const user = await UserModel.findById(created.id);
        expect(user).not.toBeNull();
        expect(user.id).toBe(created.id);
        expect(user.username).toBe('umtest_findid');
    });

    test('returns null for non-existent id', async () => {
        const user = await UserModel.findById(999999);
        expect(user).toBeNull();
    });
});

describe('UserModel.findAll', () => {
    test('returns array of users', async () => {
        const hashedPassword = await argon2.hash('test123');
        await UserModel.create({
            username: 'umtest_findall1',
            email: 'umtest_findall1@test.com',
            password: hashedPassword,
            full_name: 'Find All 1',
            role: 'admin',
        });
        await UserModel.create({
            username: 'umtest_findall2',
            email: 'umtest_findall2@test.com',
            password: hashedPassword,
            full_name: 'Find All 2',
            role: 'admin',
        });

        const users = await UserModel.findAll();
        expect(users.length).toBeGreaterThanOrEqual(2);
    });
});