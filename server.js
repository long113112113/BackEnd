require('dotenv').config();

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
const app = express();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', routes);

app.get('/', (req, res) => {
    res.json({
        message: '🎓 Server Điểm Danh IoT đang chạy ngon lành!',
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
        await aedesConfig.start();
        mqttConfig.connect(handleMqttMessage);

        app.listen(config.port, () => {
            console.log(`\n🌐 Web server đang chạy tại http://localhost:${config.port}`);
            console.log(`📡 Môi trường: ${config.nodeEnv}`);
            console.log('==========================================\n');
        });
    } catch (err) {
        console.error('❌ Không thể khởi động server:', err.message);
        process.exit(1);
    }
};

startServer();