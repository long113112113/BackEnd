const { query, param } = require('express-validator');

exports.getByDate = [
    query('date')
        .optional()
        .trim()
        .isDate({ format: 'YYYY-MM-DD', strictMode: true })
        .withMessage('Date must be a valid calendar date in YYYY-MM-DD format'),
];

exports.getByStudent = [
    param('id')
        .isInt({ min: 1 }).withMessage('Student ID must be a positive integer'),
];
