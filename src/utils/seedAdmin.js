const argon2 = require('argon2');
const UserModel = require('../models/user.model');
const logger = require('./logger');

const seedAdmin = async () => {
    try {
        const existingUsers = await UserModel.findAll();

        if (existingUsers.length > 0) {
            logger.info('[Seed] Users table already has data, skipping admin seed.');
            return;
        }

        const username = process.env.ADMIN_USERNAME;
        const email = process.env.ADMIN_EMAIL;
        const password = process.env.ADMIN_PASSWORD;
        const full_name = process.env.ADMIN_FULLNAME;

        if (!username || !email || !password) {
            logger.info('[Seed] ADMIN_USERNAME, ADMIN_EMAIL, or ADMIN_PASSWORD not set. Skipping admin seed.');
            return;
        }

        if (password.length < 12) {
            logger.warn('[Seed] ADMIN_PASSWORD is too short (< 12 chars). Consider a stronger password.');
        }

        const hashedPassword = await argon2.hash(password);

        await UserModel.create({
            username,
            email,
            password: hashedPassword,
            full_name,
            role: 'admin',
        });

        logger.info(`[Seed] Default admin account created: ${username} / ${email}`);
    } catch (err) {
        logger.error('[Seed] Failed to seed admin:', err.message);
    }
};

module.exports = seedAdmin;
