require('dotenv').config();

const os = require('os');
const app = require('./src/app');
const config = require('./src/config');
const mqttConfig = require('./src/config/mqtt');
const aedesConfig = require('./src/config/aedes');
const { handleMqttMessage } = require('./src/services/mqtt.handler');
const initDatabase = require('./src/utils/initDb');
const seedAdmin = require('./src/utils/seedAdmin');
const seedDevices = require('./src/utils/seedDevices');

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