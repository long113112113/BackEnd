const net = require('net');

const MQTT_PORT = parseInt(process.env.MQTT_PORT, 10) || 1883;

let aedesInstance = null;
let server = null;

const start = async () => {
    const { Aedes } = await import('aedes');
    aedesInstance = await Aedes.createBroker();

    aedesInstance.on('client', (client) => {
        console.log(`🔌 MQTT Client kết nối: ${client.id}`);
    });

    aedesInstance.on('clientDisconnect', (client) => {
        console.log(`🔌 MQTT Client ngắt kết nối: ${client.id}`);
    });

    aedesInstance.on('publish', (packet, client) => {
        if (client) {
            console.log(`📤 MQTT Publish: topic=${packet.topic} from=${client.id}`);
        }
    });

    return new Promise((resolve, reject) => {
        server = net.createServer(aedesInstance.handle);

        server.listen(MQTT_PORT, () => {
            console.log(`📡 MQTT Broker (Aedes) đang chạy tại port ${MQTT_PORT}`);
            resolve(server);
        });

        server.on('error', (err) => {
            reject(err);
        });
    });
};

const getInstance = () => aedesInstance;
const getServer = () => server;

const stop = () => {
    return new Promise((resolve) => {
        if (server) {
            server.close(() => {
                console.log('📡 MQTT Broker đã dừng');
                resolve();
            });
        } else {
            resolve();
        }
    });
};

module.exports = { start, stop, getInstance, getServer };
