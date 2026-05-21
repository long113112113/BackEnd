
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/user.model');
const config = require('../config');

const AuthController = {

    register: async (req, res, next) => {
        try {
            const { username, email, password, full_name } = req.body;

            if (!username || !email || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Username, email, and password are required',
                });
            }
            const existingUser = await UserModel.findByUsername(username);
            if (existingUser) {
                return res.status(409).json({
                    success: false,
                    message: 'Username already exists',
                });
            }

            const hashedPassword = await argon2.hash(password);

            const user = await UserModel.create({
                username,
                email,
                password: hashedPassword,
                full_name,
            });

            const token = jwt.sign(
                { id: user.id, username: user.username, role: user.role },
                config.jwt.secret,
                { expiresIn: config.jwt.expiresIn }
            );

            res.status(201).json({
                success: true,
                data: { user, token },
            });
        } catch (err) {
            next(err);
        }
    },
    login: async (req, res, next) => {
        try {
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Username and password are required',
                });
            }

            const user = await UserModel.findByUsername(username);
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid username or password',
                });
            }

            const isMatch = await argon2.verify(user.password, password);
            if (!isMatch) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid username or password',
                });
            }

            // Tạo JWT token
            const token = jwt.sign(
                { id: user.id, username: user.username, role: user.role },
                config.jwt.secret,
                { expiresIn: config.jwt.expiresIn }
            );

            res.json({
                success: true,
                data: {
                    user: {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        full_name: user.full_name,
                        role: user.role,
                    },
                    token,
                },
            });
        } catch (err) {
            next(err);
        }
    },

    /**
     * GET /api/auth/me - Lấy thông tin user hiện tại
     */
    getMe: async (req, res, next) => {
        try {
            const user = await UserModel.findByUsername(req.user.username);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found',
                });
            }

            res.json({
                success: true,
                data: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    full_name: user.full_name,
                    role: user.role,
                },
            });
        } catch (err) {
            next(err);
        }
    },
};

module.exports = AuthController;
