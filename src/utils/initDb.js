/**
 * ==========================================
 * KHỞI TẠO DATABASE
 * ==========================================
 * Tạo tất cả các bảng cần thiết khi server start.
 */

const StudentModel = require('../models/student.model');
const AttendanceModel = require('../models/attendance.model');
const UserModel = require('../models/user.model');
const UnknownCardModel = require('../models/unknownCard.model');
const db = require('../config/db');

const initDatabase = async () => {
    try {
        console.log('\n🔧 Đang khởi tạo Database...');

        const connected = await db.testConnection();
        if (!connected) {
            throw new Error('Không thể kết nối tới Database');
        }

        await UserModel.createTable();
        await StudentModel.createTable();
        await AttendanceModel.createTable();
        await UnknownCardModel.createTable();

        console.log('✅ Database đã sẵn sàng!\n');
    } catch (err) {
        console.error('❌ Lỗi khởi tạo Database:', err.message);
        process.exit(1);
    }
};

module.exports = initDatabase;
