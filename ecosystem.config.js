const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, 'logs');
fs.mkdirSync(logsDir, { recursive: true });

module.exports = {
    apps: [
        {
            name: 'cxc-whatsapp',
            script: 'index.js',
            cwd: __dirname,
            exec_mode: 'fork',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '700M',
            restart_delay: 5000,
            exp_backoff_restart_delay: 200,
            max_restarts: 20,
            min_uptime: '60s',
            kill_timeout: 10000,
            time: true,
            merge_logs: true,
            out_file: path.join(logsDir, 'out.log'),
            error_file: path.join(logsDir, 'error.log'),
            env: {
                NODE_ENV: 'production'
            }
        }
    ]
};
