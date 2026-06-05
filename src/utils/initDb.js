const logger = require('./logger');
const StudentModel = require('../models/student.model');
const AttendanceModel = require('../models/attendance.model');
const UserModel = require('../models/user.model');
const UnknownCardModel = require('../models/unknownCard.model');
const DeviceKeyModel = require('../models/deviceKey.model');
const RefreshTokenModel = require('../models/refreshToken.model');
const DevicePairModel = require('../models/devicePair.model');
const FaceCaptureModel = require('../models/faceCapture.model');
const db = require('../config/db');

const initDatabase = async () => {
    try {
        logger.info('\n[Database] Initializing database...');

        const connected = await db.testConnection();
        if (!connected) {
            throw new Error('Cant connect to database');
        }

        await UserModel.createTable();
        await StudentModel.createTable();
        await AttendanceModel.createTable();
        await UnknownCardModel.createTable();
        await DeviceKeyModel.createTable();
        await DevicePairModel.createTable();
        await RefreshTokenModel.createTable();
        await FaceCaptureModel.createTable();

        logger.info('[Database] Database is ready.\n');
    } catch (err) {
        logger.error('[Database] Database initialization failed:', err.message);
        process.exit(1);
    }
};

module.exports = initDatabase;
