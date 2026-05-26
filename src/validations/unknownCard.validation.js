const { param } = require('express-validator');

exports.cardUidParam = [
    param('cardUid')
        .trim()
        .notEmpty().withMessage('Card UID is required')
        .matches(/^[a-fA-F0-9]{8,50}$/).withMessage('Card UID must be 8-50 hex characters'),
];
