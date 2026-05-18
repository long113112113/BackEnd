/**
 * ==========================================
 * CONTROLLER: AUTH (XÁC THỰC)
 * ==========================================
 * Đăng nhập, đăng ký cho tài khoản admin.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/user.model');
const config = require('../config');

const AuthController = {
    /**
     * POST /api/auth/register - Đăng ký tài khoản
     */
    register: async (req, res, next) => {
        try {
            const { username, email, password, full_name } = req.body;

            if (!username || !email || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Username, email và password là bắt buộc',
                });
            }

            // Kiểm tra username/email đã tồn tại
            const existingUser = await UserModel.findByUsername(username);
            if (existingUser) {
                return res.status(409).json({
                    success: false,
                    message: 'Username đã tồn tại',
                });
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 12);

            const user = await UserModel.create({
                username,
                email,
                password: hashedPassword,
                full_name,
            });

            // Tạo JWT token
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

    /**
     * POST /api/auth/login - Đăng nhập
     */
    login: async (req, res, next) => {
        try {
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Username và password là bắt buộc',
                });
            }

            // Tìm user
            const user = await UserModel.findByUsername(username);
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'Sai username hoặc password',
                });
            }

            // So sánh password
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).json({
                    success: false,
                    message: 'Sai username hoặc password',
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
                    message: 'User không tồn tại',
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
