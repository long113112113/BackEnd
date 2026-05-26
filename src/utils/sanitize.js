const sanitizeHtml = require('sanitize-html');

const sanitizeInput = (value) => {
    if (typeof value !== 'string') return value;
    return sanitizeHtml(value, {
        allowedTags: [],
        allowedAttributes: {},
        nonTextTags: [],
    });
};

module.exports = sanitizeInput;
