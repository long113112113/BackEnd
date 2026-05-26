const { body, param } = require('express-validator');

exports.createStudent = [
    body('student_id')
        .isString().withMessage('Student ID must be a string')
        .trim()
        .notEmpty().withMessage('Student ID is required')
        .isLength({ max: 20 }).withMessage('Student ID must not exceed 20 characters')
        .isAlphanumeric().withMessage('Student ID must be alphanumeric'),
    body('full_name')
        .isString().withMessage('Full name must be a string')
        .trim()
        .notEmpty().withMessage('Full name is required')
        .isLength({ max: 100 }).withMessage('Full name must not exceed 100 characters'),
    body('class')
        .optional({ values: 'falsy' })
        .isString().withMessage('Class name must be a string')
        .trim()
        .isLength({ max: 50 }).withMessage('Class name must not exceed 50 characters'),
    body('card_uid')
        .optional({ nullable: true })
        .isString().withMessage('Card UID must be a string')
        .trim()
        .notEmpty().withMessage('Card UID cannot be empty')
        .isLength({ max: 50 }).withMessage('Card UID must not exceed 50 characters')
        .isHexadecimal().withMessage('Card UID must be hexadecimal'),
    body('email')
        .optional({ values: 'falsy' })
        .isString().withMessage('Email must be a string')
        .trim()
        .isEmail().withMessage('Invalid email format')
        .normalizeEmail()
        .isLength({ max: 100 }).withMessage('Email must not exceed 100 characters'),
    body('phone')
        .optional({ values: 'falsy' })
        .isString().withMessage('Phone must be a string')
        .trim()
        .isLength({ max: 20 }).withMessage('Phone must not exceed 20 characters')
        .matches(/^[0-9+\-\s()]+$/).withMessage('Invalid phone number format'),
];

exports.updateStudent = [
    param('id')
        .isInt({ min: 1 }).withMessage('Student ID must be a positive integer'),
    body('full_name')
        .optional({ nullable: true })
        .isString().withMessage('Full name must be a string')
        .trim()
        .notEmpty().withMessage('Full name cannot be empty')
        .isLength({ max: 100 }).withMessage('Full name must not exceed 100 characters'),
    body('class')
        .optional({ nullable: true })
        .isString().withMessage('Class name must be a string')
        .trim()
        .isLength({ max: 50 }).withMessage('Class name must not exceed 50 characters'),
    body('card_uid')
        .optional({ nullable: true })
        .isString().withMessage('Card UID must be a string')
        .trim()
        .notEmpty().withMessage('Card UID cannot be empty')
        .isLength({ max: 50 }).withMessage('Card UID must not exceed 50 characters')
        .isHexadecimal().withMessage('Card UID must be hexadecimal'),
    body('email')
        .optional({ values: 'falsy' })
        .isString().withMessage('Email must be a string')
        .trim()
        .isEmail().withMessage('Invalid email format')
        .normalizeEmail()
        .isLength({ max: 100 }).withMessage('Email must not exceed 100 characters'),
    body('phone')
        .optional({ values: 'falsy' })
        .isString().withMessage('Phone must be a string')
        .trim()
        .isLength({ max: 20 }).withMessage('Phone must not exceed 20 characters')
        .matches(/^[0-9+\-\s()]+$/).withMessage('Invalid phone number format'),
];

exports.studentIdParam = [
    param('id').isInt({ min: 1 }).withMessage('Student ID must be a positive integer'),
];
