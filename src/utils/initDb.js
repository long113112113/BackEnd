const StudentModel = require('../models/student.model');
const AttendanceModel = require('../models/attendance.model');
const UserModel = require('../models/user.model');
const UnknownCardModel = require('../models/unknownCard.model');
const DeviceKeyModel = require('../models/deviceKey.model');
const db = require('../config/db');

const initDatabase = async () => {
    try {
        console.log('\n[Database] Initializing database...');

        const connected = await db.testConnection();
        if (!connected) {
            throw new Error('Cant connect to database');
        }

        await UserModel.createTable();
        await StudentModel.createTable();
        await AttendanceModel.createTable();
        await UnknownCardModel.createTable();
        await DeviceKeyModel.createTable();

        console.log('[Database] Database is ready.\n');
    } catch (err) {
        console.error('[Database] Database initialization failed:', err.message);
        process.exit(1);
    }
};

module.exports = initDatabase;
