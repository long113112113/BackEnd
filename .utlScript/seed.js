'use strict';

/**
 * Seed script — populates the database with realistic test data.
 *
 * Tables populated:
 *   users            → 2 accounts (1 admin, 1 manager)
 *   students         → 30 students with card UIDs
 *
 * Tables intentionally skipped:
 *   device_keys, refresh_tokens, attendance_records, unknown_cards
 *
 * Usage:
 *   node .utlScript/seed.js
 *
 * NOTE: Requires DATABASE_URL (and optionally DB_SSL_REJECT_UNAUTHORIZED) in .env.
 */

require('dotenv').config();

const argon2 = require('argon2');
const { Pool } = require('pg');

// ---------------------------------------------------------------------------
// DB connection — mirrors src/config/db.js but standalone so the script has
// no dependency on the full app boot sequence.
// ---------------------------------------------------------------------------
const sslConfig =
    process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false'
        ? { rejectUnauthorized: false }
        : {};

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: Object.keys(sslConfig).length > 0 ? sslConfig : undefined,
    max: 5,
    connectionTimeoutMillis: 8000,
});

const query = (text, params) => pool.query(text, params);

// ---------------------------------------------------------------------------
// Seed data definitions
// ---------------------------------------------------------------------------

const USERS = [
    {
        username: 'admin2',
        email: 'admin@school.edu.vn',
        password: 'Admin@12345',
        full_name: 'Nguyễn Quản Trị',
        role: 'admin',
    },
    {
        username: 'manager01',
        email: 'manager01@school.edu.vn',
        password: 'Manager@12345',
        full_name: 'Trần Thị Quản Lý',
        role: 'manager',
    },
];

const CLASSES = ['CNTT01', 'CNTT02', 'KTPM01', 'KTPM02', 'HTTT01', 'MMT01'];

/** 30 students — student IDs from SV2024001 to SV2024030. */
const STUDENTS = Array.from({ length: 30 }, (_, i) => {
    const n = String(i + 1).padStart(3, '0');
    return {
        student_id: `SV2024${n}`,
        full_name: [
            'Nguyễn Văn An', 'Trần Thị Bình', 'Lê Hoàng Cường',
            'Phạm Thị Dung', 'Hoàng Văn Em', 'Vũ Thị Phương',
            'Đặng Văn Giang', 'Bùi Thị Hà', 'Đỗ Văn Hùng',
            'Ngô Thị Lan', 'Lý Văn Minh', 'Trương Thị Nga',
            'Phan Văn Oanh', 'Võ Thị Phúc', 'Đinh Văn Quân',
            'Nguyễn Thị Ren', 'Lê Văn Sơn', 'Trần Thị Tâm',
            'Phạm Văn Ước', 'Hoàng Thị Vân', 'Vũ Văn Xuân',
            'Đặng Thị Yến', 'Bùi Văn Zin', 'Đỗ Thị Anh',
            'Ngô Văn Bảo', 'Lý Thị Chi', 'Trương Văn Dũng',
            'Phan Thị Enh', 'Võ Văn Phong', 'Đinh Thị Giang',
        ][i],
        class: CLASSES[i % CLASSES.length],
        // card_uid uses a realistic 8-hex-char UID format (Mifare Classic).
        card_uid: `${(0xA0000000 + i * 0x12345).toString(16).toUpperCase().padStart(8, '0')}`,
        email: `sv2024${n}@student.edu.vn`,
        phone: `09${String(10000000 + i * 13371337).slice(0, 8)}`,
    };
});

// ---------------------------------------------------------------------------
// Seed functions
// ---------------------------------------------------------------------------

async function seedUsers() {
    console.log('\n[1/2] Seeding users...');
    for (const u of USERS) {
        const hash = await argon2.hash(u.password);
        await query(
            `INSERT INTO users (username, email, password, full_name, role)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (username) DO UPDATE SET
                 email     = EXCLUDED.email,
                 password  = EXCLUDED.password,
                 full_name = EXCLUDED.full_name,
                 role      = EXCLUDED.role,
                 updated_at = CURRENT_TIMESTAMP`,
            [u.username, u.email, hash, u.full_name, u.role]
        );
        console.log(`  ✔ ${u.role.padEnd(7)} | ${u.username} / ${u.password}`);
    }
}

async function seedStudents() {
    console.log('\n[2/2] Seeding students...');
    for (const s of STUDENTS) {
        await query(
            `INSERT INTO students (student_id, full_name, class, card_uid, email, phone)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (student_id) DO UPDATE SET
                 full_name  = EXCLUDED.full_name,
                 class      = EXCLUDED.class,
                 card_uid   = EXCLUDED.card_uid,
                 email      = EXCLUDED.email,
                 phone      = EXCLUDED.phone,
                 updated_at = CURRENT_TIMESTAMP`,
            [s.student_id, s.full_name, s.class, s.card_uid, s.email, s.phone]
        );
    }
    console.log(`  ✔ ${STUDENTS.length} students inserted/updated.`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

(async () => {
    try {
        console.log('=== Seed Script ===');
        console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✔ set' : '✘ MISSING');
        if (!process.env.DATABASE_URL) process.exit(1);

        await seedUsers();
        await seedStudents();

        console.log('\n✅ Seed complete.\n');
    } catch (err) {
        console.error('\n❌ Seed failed:', err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        await pool.end();
    }
})();
