const pino = require('pino');

const isProd = process.env.NODE_ENV === 'production';

const pinoLogger = pino({
    level: isProd ? 'info' : 'debug',
    formatters: {
        level: (label) => ({ level: label }),
    },
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
});

const formatArgs = (args) => {
    if (args.length === 0) return '';
    if (args.length === 1) return String(args[0]);
    const [first, ...rest] = args;
    if (typeof first === 'string') {
        return `${first} ${rest.map(v => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(' ')}`;
    }
    return args.map(v => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(' ');
};

const logger = {
    info: (...args) => pinoLogger.info(formatArgs(args)),
    warn: (...args) => pinoLogger.warn(formatArgs(args)),
    error: (...args) => pinoLogger.error(formatArgs(args)),
    debug: (...args) => pinoLogger.debug(formatArgs(args)),
    log: (...args) => pinoLogger.info(formatArgs(args)),
};

module.exports = logger;
