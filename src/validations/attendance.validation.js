const { query, param } = require('express-validator');

// Shared validators for date range, student_id, and class filters.
const dateRangeValidators = [
    query('start_date')
        .optional()
        .trim()
        .isDate({ format: 'YYYY-MM-DD', strictMode: true })
        .withMessage('start_date must be a valid calendar date in YYYY-MM-DD format'),
    query('end_date')
        .optional()
        .trim()
        .isDate({ format: 'YYYY-MM-DD', strictMode: true })
        .withMessage('end_date must be a valid calendar date in YYYY-MM-DD format'),
    query('student_id')
        .optional()
        .trim()
        .isString().withMessage('student_id must be a string')
        .isLength({ max: 20 }).withMessage('student_id must not exceed 20 characters')
        .matches(/^[a-zA-Z0-9_-]+$/).withMessage('student_id contains invalid characters'),
    query('class')
        .optional()
        .trim()
        .isString().withMessage('class must be a string')
        .isLength({ max: 50 }).withMessage('class must not exceed 50 characters')
        .matches(/^[a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF\s._-]+$/).withMessage('class contains invalid characters'),
];

exports.getByDate = [
    query('date')
        .optional()
        .trim()
        .isDate({ format: 'YYYY-MM-DD', strictMode: true })
        .withMessage('Date must be a valid calendar date in YYYY-MM-DD format'),
    ...dateRangeValidators,
    query('groupBy')
        .optional()
        .trim()
        .isIn(['student']).withMessage('groupBy must be "student" or omitted'),
];

exports.getByStudent = [
    param('id')
        .trim()
        .notEmpty().withMessage('Student ID is required')
        .isString().withMessage('Student ID must be a string'),
];

exports.exportAttendance = [
    query('format')
        .optional()
        .trim()
        .isIn(['csv', 'xlsx']).withMessage('format must be "csv" or "xlsx"'),
    ...dateRangeValidators,
];
