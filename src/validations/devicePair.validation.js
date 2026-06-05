const { body, param } = require('express-validator');

const DEVICE_ID_REGEX = /^[a-zA-Z0-9_-]{1,50}$/;

const createPair = [
    body('nfc_device_id')
        .isString().withMessage('nfc_device_id must be a string')
        .matches(DEVICE_ID_REGEX).withMessage('nfc_device_id format invalid'),
    body('cam_device_id')
        .isString().withMessage('cam_device_id must be a string')
        .matches(DEVICE_ID_REGEX).withMessage('cam_device_id format invalid'),
    body('classroom')
        .optional()
        .isString().isLength({ max: 100 }).withMessage('classroom too long'),
    body('active')
        .optional()
        .isBoolean().withMessage('active must be boolean'),
];

const updatePair = [
    param('id').isInt({ min: 1 }),
    body('classroom').optional().isString().isLength({ max: 100 }),
    body('active').optional().isBoolean(),
    body('cam_device_id').optional().matches(DEVICE_ID_REGEX).withMessage('cam_device_id format invalid'),
];

const pairIdParam = [
    param('id').isInt({ min: 1 }),
];

module.exports = { createPair, updatePair, pairIdParam };
