const { body, param } = require('express-validator');

exports.createStudent = [
    body('student_id')
        .trim()
        .notEmpty().withMessage('Student ID is required')
        .isLength({ max: 20 }).withMessage('Student ID must not exceed 20 characters')
        .matches(/^[a-zA-Z0-9]+$/).withMessage('Student ID must be alphanumeric'),
    body('full_name')
        .trim()
        .notEmpty().withMessage('Full name is required')
        .isLength({ max: 100 }).withMessage('Full name must not exceed 100 characters'),
    body('class')
        .optional({ values: 'falsy' })
        .trim()
        .isLength({ max: 50 }).withMessage('Class name must not exceed 50 characters'),
    body('card_uid')
        .optional({ values: 'falsy' })
        .trim()
        .isLength({ max: 50 }).withMessage('Card UID must not exceed 50 characters')
        .matches(/^[a-fA-F0-9]+$/).withMessage('Card UID must be hexadecimal'),
    body('email')
        .optional({ values: 'falsy' })
        .trim()
        .isEmail().withMessage('Invalid email format')
        .normalizeEmail()
        .isLength({ max: 100 }).withMessage('Email must not exceed 100 characters'),
    body('phone')
        .optional({ values: 'falsy' })
        .trim()
        .isLength({ max: 20 }).withMessage('Phone must not exceed 20 characters')
        .matches(/^[0-9+\-\s()]+$/).withMessage('Invalid phone number format'),
];

exports.updateStudent = [
    param('id')
        .isInt({ min: 1 }).withMessage('Student ID must be a positive integer'),
    body('full_name')
        .optional({ values: 'falsy' })
        .trim()
        .isLength({ max: 100 }).withMessage('Full name must not exceed 100 characters'),
    body('class')
        .optional({ values: 'falsy' })
        .trim()
        .isLength({ max: 50 }).withMessage('Class name must not exceed 50 characters'),
    body('card_uid')
        .optional({ values: 'falsy' })
        .trim()
        .isLength({ max: 50 }).withMessage('Card UID must not exceed 50 characters')
        .matches(/^[a-fA-F0-9]+$/).withMessage('Card UID must be hexadecimal'),
    body('email')
        .optional({ values: 'falsy' })
        .trim()
        .isEmail().withMessage('Invalid email format')
        .normalizeEmail()
        .isLength({ max: 100 }).withMessage('Email must not exceed 100 characters'),
    body('phone')
        .optional({ values: 'falsy' })
        .trim()
        .isLength({ max: 20 }).withMessage('Phone must not exceed 20 characters')
        .matches(/^[0-9+\-\s()]+$/).withMessage('Invalid phone number format'),
];

exports.studentIdParam = [
    param('id').isInt({ min: 1 }).withMessage('Student ID must be a positive integer'),
];
