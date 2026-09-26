const path = require('path')

const root = __dirname
const tile38Dir = path.join(root, 'tools', 'tile38', 'tile38-1.38.0-windows-amd64')
const tile38Data = path.join(root, 'tools', 'tile38', 'data')
// const nginxDir = path.join(root, 'tools', 'nginx', 'nginx-1.28.0') // Traccar path paused

module.exports = {
    apps: [
        // Cloudflare tunnel → :3010. Next cannot proxy Socket.IO; edge proxy does.
        {
            name: 'erp-edge',
            cwd: root,
            script: path.join(root, 'scripts', 'erp-edge-proxy.cjs'),
            interpreter: 'node',
            env: {
                NODE_ENV: 'production',
                EDGE_PORT: '3010',
                API_INTERNAL_URL: 'http://127.0.0.1:3011',
                NEXT_INTERNAL_URL: 'http://127.0.0.1:3020',
            },
        },
        {
            name: 'erp-frontend',
            cwd: root,
            script: path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'),
            args: 'start -p 3020',
            interpreter: 'node',
            env: {
                NODE_ENV: 'production',
                API_INTERNAL_URL: 'http://127.0.0.1:3011',
            },
        },
        {
            name: 'erp-backend',
            cwd: path.join(root, 'backend'),
            script: path.join(root, 'backend', 'dist', 'main.js'),
            interpreter: 'node',
            env: {
                NODE_ENV: 'production',
            },
        },
        {
            name: 'tile38',
            cwd: tile38Dir,
            script: path.join(tile38Dir, 'tile38-server.exe'),
            args: `-d "${tile38Data}" -h 127.0.0.1 -p 9851`,
            interpreter: 'none',
        },
        // Traccar path paused — use flespi MQTT (docs/SCM_FLESPI_VL502.md).
        // Re-enable nginx-telematics only when reviving docs/SCM_NGINX_TRACCAR.md.
        // {
        //     name: 'nginx-telematics',
        //     cwd: nginxDir,
        //     script: path.join(nginxDir, 'nginx.exe'),
        //     interpreter: 'none',
        //     kill_timeout: 5000,
        // },
    ],
}
