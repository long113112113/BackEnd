/**
 * ==========================================
 * CẤU HÌNH KẾT NỐI DATABASE - NEON POSTGRESQL
 * ==========================================
 * Sử dụng Pool để quản lý connection hiệu quả.
 * SSL bắt buộc khi kết nối Neon.
 */

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false, // Neon yêu cầu SSL
    },
    max: 20,               // Tối đa 20 connections trong pool
    idleTimeoutMillis: 30000,   // Đóng connection sau 30s không dùng
    connectionTimeoutMillis: 5000, // Timeout kết nối sau 5s
});

// Test kết nối khi khởi động
pool.on('connect', () => {
    console.log('📦 Kết nối mới tới Neon PostgreSQL');
});

pool.on('error', (err) => {
    console.error('❌ Lỗi kết nối Database:', err.message);
});

/**
 * Hàm tiện ích để chạy query
 * @param {string} text - Câu SQL
 * @param {Array} params - Tham số truyền vào
 * @returns {Promise} Kết quả query
 */
const query = async (text, params) => {
    const start = Date.now();
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    // Log query trong môi trường development
    if (process.env.NODE_ENV === 'development') {
        console.log('🔍 Query:', { text, duration: `${duration}ms`, rows: result.rowCount });
    }

    return result;
};

/**
 * Test kết nối database
 */
const testConnection = async () => {
    try {
        const result = await pool.query('SELECT NOW()');
        console.log('✅ Database kết nối thành công! Thời gian server:', result.rows[0].now);
        return true;
    } catch (err) {
        console.error('❌ Không thể kết nối Database:', err.message);
        return false;
    }
};

module.exports = {
    pool,
    query,
    testConnection,
};
