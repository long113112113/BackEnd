module.exports = {
    apps: [{
        name: 'iot-attendance-backend',
        script: 'server.js',
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '512M',
        env: {
            NODE_ENV: 'production',
        },
        env_development: {
            NODE_ENV: 'development',
        },
        error_file: './logs/error.log',
        out_file: './logs/output.log',
        merge_logs: true,
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        exp_backoff_restart_delay: 100,
    }],
};
