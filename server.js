require('dotenv').config();

const os = require('os');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const config = require('./src/config');
const mqttConfig = require('./src/config/mqtt');
const aedesConfig = require('./src/config/aedes');
const routes = require('./src/routes');
const { errorHandler, notFoundHandler } = require('./src/middlewares/error.middleware');
const { handleMqttMessage } = require('./src/services/mqtt.handler');
const initDatabase = require('./src/utils/initDb');
const seedAdmin = require('./src/utils/seedAdmin');
const app = express();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
        },
    });
});

app.use(notFoundHandler);
app.use(errorHandler);
const startServer = async () => {
    try {
        await initDatabase();
        await seedAdmin();
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