const { query, param } = require('express-validator');

exports.getByDate = [
    query('date')
        .optional()
        .trim()
        .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date must be in YYYY-MM-DD format'),
];

exports.getByStudent = [
    param('id')
        .isInt({ min: 1 }).withMessage('Student ID must be a positive integer'),
];
