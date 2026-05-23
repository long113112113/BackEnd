const { param } = require('express-validator');

exports.cardUidParam = [
    param('cardUid')
        .trim()
        .notEmpty().withMessage('Card UID is required')
        .isLength({ max: 50 }).withMessage('Card UID must not exceed 50 characters')
        .matches(/^[a-fA-F0-9]+$/).withMessage('Card UID must be hexadecimal'),
];
