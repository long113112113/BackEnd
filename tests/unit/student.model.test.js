require('dotenv').config();
const db = require('../../src/config/db');
const initDatabase = require('../../src/utils/initDb');
const StudentModel = require('../../src/models/student.model');

beforeAll(async () => {
    await initDatabase();
    await db.query('DELETE FROM attendance_records');
    await db.query('DELETE FROM unknown_cards');
    await db.query('DELETE FROM students');
    await db.query('DELETE FROM device_keys');
    await db.query('DELETE FROM users');
}, 30000);

afterAll(async () => {
    await db.query('DELETE FROM attendance_records');
    await db.query('DELETE FROM students WHERE student_id LIKE $1', ['SMTEST_%']);
});

describe('StudentModel.findByCardUID', () => {
    test('returns student with matching active card_uid', async () => {
        await StudentModel.create({
            student_id: 'SMTEST001',
            full_name: 'Card UID Test',
            class: '20DTHX1',
            card_uid: 'SMDEADBEEF',
        });

        const found = await StudentModel.findByCardUID('SMDEADBEEF');
        expect(found).not.toBeNull();
        expect(found.student_id).toBe('SMTEST001');
        expect(found.is_active).toBe(true);
    });

    test('returns null for non-existent card_uid', async () => {
        const found = await StudentModel.findByCardUID('SMNOTEXIST000');
        expect(found).toBeNull();
    });

    test('excludes inactive (soft-deleted) student', async () => {
        await StudentModel.create({
            student_id: 'SMTEST002',
            full_name: 'Inactive Student',
            card_uid: 'SMAAAA0000001',
        });
        await db.query("UPDATE students SET is_active = false WHERE student_id = $1", ['SMTEST002']);

        const found = await StudentModel.findByCardUID('SMAAAA0000001');
        expect(found).toBeNull();
    });
});

describe('StudentModel.findById', () => {
    test('returns student by id', async () => {
        const created = await StudentModel.create({
            student_id: 'SMTEST003',
            full_name: 'FindById Student',
        });
        const found = await StudentModel.findById(created.id);
        expect(found).not.toBeNull();
        expect(found.id).toBe(created.id);
        expect(found.student_id).toBe('SMTEST003');
    });

    test('returns null for non-existent id', async () => {
        const found = await StudentModel.findById(999999);
        expect(found).toBeNull();
    });
});

describe('StudentModel.update', () => {
    test('patches specified fields only', async () => {
        const created = await StudentModel.create({
            student_id: 'SMTEST004',
            full_name: 'Before Update',
            class: '20OLD',
            card_uid: 'SMBBBB0000001',
        });

        const updated = await StudentModel.update(created.id, {
            full_name: 'After Update',
            class: '20NEW',
        });

        expect(updated.full_name).toBe('After Update');
        expect(updated.class).toBe('20NEW');
    });
});

describe('StudentModel.delete', () => {
    test('soft-deletes by setting is_active to false', async () => {
        const created = await StudentModel.create({
            student_id: 'SMTEST005',
            full_name: 'To Be Deleted',
            card_uid: 'SMCCCC0000001',
        });

        const deleted = await StudentModel.delete(created.id);
        expect(deleted.is_active).toBe(false);

        const refetched = await StudentModel.findById(created.id);
        expect(refetched.is_active).toBe(false);
    });
});