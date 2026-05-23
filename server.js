require('dotenv').config();

const os = require('os');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const config = require('./src/config');
const mqttConfig = require('./src/config/mqtt');
const aedesConfig = require('./src/config/aedes');
const routes = require('./src/routes');
const { errorHandler, notFoundHandler } = require('./src/middlewares/error.middleware');
const { handleMqttMessage } = require('./src/services/mqtt.handler');
const initDatabase = require('./src/utils/initDb');
const seedAdmin = require('./src/utils/seedAdmin');
const seedDevices = require('./src/utils/seedDevices');
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
}));
app.use(cookieParser());
if (config.nodeEnv === 'development') {
    app.use(morgan('dev'));
} else {
    morgan.token('path', (req) => req.path);
    app.use(morgan(':method :path :status :response-time ms'));
}
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

app.use('/api', routes);

app.get('/', (req, res) => {
    res.json({
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
});

app.use(notFoundHandler);
app.use(errorHandler);
const startServer = async () => {
    try {
        await initDatabase();
        await seedAdmin();
        await seedDevices();
        await aedesConfig.start();
        mqttConfig.connect(handleMqttMessage);

        app.listen(config.port, () => {
            const nets = os.networkInterfaces();
            let serverIp = 'localhost';
            for (const name of Object.keys(nets)) {
                for (const net of nets[name]) {
                    if (net.family === 'IPv4' && !net.internal) {
                        serverIp = net.address;
                    }
                }
            }

            console.log(`\n[Server] Web server is running at http://${serverIp}:${config.port}`);
            console.log(`[Server] Environment: ${config.nodeEnv}`);
            console.log('==========================================\n');
        });
    } catch (err) {
        console.error('[Server] Failed to start server:', err.message);
        process.exit(1);
    }
};

startServer();