const sanitize = (val) => {
    if (typeof val !== 'string') return val;
    return val.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, '');
};

const sanitizeArgs = (args) => args.map(sanitize);

const logger = {
    log: (...args) => console.log(...sanitizeArgs(args)),
    info: (...args) => console.log(...sanitizeArgs(args)),
    warn: (...args) => console.warn(...sanitizeArgs(args)),
    error: (...args) => console.error(...sanitizeArgs(args)),
    debug: (...args) => console.debug(...sanitizeArgs(args)),
};

module.exports = logger;
