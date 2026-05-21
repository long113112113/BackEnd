const argon2 = require('argon2');
const UserModel = require('../models/user.model');

const seedAdmin = async () => {
    try {
        const existingUsers = await UserModel.findAll();

        if (existingUsers.length > 0) {
            console.log('[Seed] Users table already has data, skipping admin seed.');
            return;
        }

        const username = process.env.ADMIN_USERNAME || 'admin';
        const email = process.env.ADMIN_EMAIL || 'admin@example.com';
        const password = process.env.ADMIN_PASSWORD || 'admin123';
        const full_name = 'Administrator';

        if (!username || !email || !password) {
            console.log('[Seed] ADMIN_USERNAME, ADMIN_EMAIL, or ADMIN_PASSWORD not set. Skipping admin seed.');
            return;
        }

        const hashedPassword = await argon2.hash(password);

        await UserModel.create({
            username,
            email,
            password: hashedPassword,
            full_name,
            role: 'admin',
        });

        console.log(`[Seed] Default admin account created: ${username} / ${email}`);
    } catch (err) {
        console.error('[Seed] Failed to seed admin:', err.message);
    }
};

module.exports = seedAdmin;
