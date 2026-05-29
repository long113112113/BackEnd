const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const config = require('./config');
const routes = require('./routes');
const { doubleCsrfProtection, generateCsrfToken } = require('./config/csrf');
const { errorHandler, notFoundHandler } = require('./middlewares/error.middleware');

const app = express();

app.use(helmet());
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || config.clientOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    exposedHeaders: ['X-CSRF-Token'],
}));
app.use(cookieParser());
morgan.token('path', (req) => req.path);
if (config.nodeEnv === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan(':method :path :status :response-time ms'));
}
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

app.get('/api/csrf-token', (req, res) => {
    res.json({ csrfToken: generateCsrfToken(req, res) });
});
app.use(doubleCsrfProtection);

app.use('/api', routes);

app.get('/', (req, res) => {
    if (config.nodeEnv === 'development' || config.nodeEnv === 'test') {
        return res.json({
            message: 'IoT Attendance Server is active.',
            version: '1.0.0',
            endpoints: {
                health: '/api/health',
                auth: '/api/auth',
                students: '/api/students',
                attendance: '/api/attendance',
                'device-keys': '/api/device-keys',
            },
        });
    }
    res.json({ message: 'IoT Attendance Server is active.' });
});

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
