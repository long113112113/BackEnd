const { body } = require('express-validator');

exports.login = [
    body('username')
        .trim()
        .notEmpty().withMessage('Username is required')
        .isLength({ max: 50 }).withMessage('Username must not exceed 50 characters')
        .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username must be alphanumeric (letters, numbers, underscore)'),
    body('password')
        .notEmpty().withMessage('Password is required')
        .isLength({ min: 6, max: 128 }).withMessage('Password must be 6-128 characters'),
];
