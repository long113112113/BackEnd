const { body, param } = require('express-validator');

const DEVICE_ID_REGEX = /^[a-zA-Z0-9_-]{1,50}$/;
const HMAC_KEY_REGEX = /^[a-fA-F0-9]{64}$/;

exports.createDeviceKey = [
    body('device_id')
        .trim()
        .notEmpty().withMessage('device_id is required')
        .matches(DEVICE_ID_REGEX).withMessage('device_id must be 1-50 chars (alphanumeric, hyphen, underscore)'),
    body('hmac_key')
        .trim()
        .notEmpty().withMessage('hmac_key is required')
        .matches(HMAC_KEY_REGEX).withMessage('hmac_key must be a 64-character hex string'),
];

exports.createBatch = [
    body('keys')
        .trim()
        .notEmpty().withMessage('keys is required')
        .isString().withMessage('keys must be a string')
        .custom((value) => {
            const entries = value.split(',').map(s => s.trim()).filter(Boolean);
            if (entries.length === 0) throw new Error('keys must contain at least one entry');
            if (entries.length > 100) throw new Error('Maximum 100 entries allowed per batch request');
            for (const entry of entries) {
                const colonIdx = entry.indexOf(':');
                if (colonIdx === -1) throw new Error(`Invalid entry "${entry}": missing colon separator`);
            }
            return true;
        }),
];

exports.deviceIdParam = [
    param('deviceId')
        .trim()
        .matches(DEVICE_ID_REGEX).withMessage('device_id must be 1-50 chars (alphanumeric, hyphen, underscore)'),
];
