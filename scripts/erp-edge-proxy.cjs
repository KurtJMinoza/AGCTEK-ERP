/**
 * Edge proxy for Cloudflare → this host.
 *
 * Cloudflare tunnel points at :3010. Next.js rewrites cannot proxy Socket.IO
 * (empty Engine.IO responses / no WS upgrade). This process owns :3010 and:
 *   /socket.io  → Nest :3011  (HTTP + WebSocket)
 *   /api/v1     → Nest :3011
 *   everything else → Next :3020
 */
const http = require('http')
const httpProxy = (() => {
    try {
        return require('http-proxy')
    } catch {
        return null
    }
})()

const EDGE_PORT = Number(process.env.EDGE_PORT) || 3010
const NEST_ORIGIN = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3011'
const NEXT_ORIGIN = process.env.NEXT_INTERNAL_URL || 'http://127.0.0.1:3020'

if (!httpProxy) {
    console.error(
        '[erp-edge-proxy] Missing dependency http-proxy. Run: npm install http-proxy',
    )
    process.exit(1)
}

const nestProxy = httpProxy.createProxyServer({
    target: NEST_ORIGIN,
    ws: true,
    xfwd: true,
    changeOrigin: true,
})

const nextProxy = httpProxy.createProxyServer({
    target: NEXT_ORIGIN,
    ws: true,
    xfwd: true,
    changeOrigin: true,
})

function onProxyError(label) {
    return (err, req, res) => {
        console.error(`[erp-edge-proxy] ${label} error:`, err.message)
        if (res && !res.headersSent && typeof res.writeHead === 'function') {
            res.writeHead(502, { 'Content-Type': 'text/plain' })
            res.end(`Bad gateway (${label})`)
        }
    }
}

nestProxy.on('error', onProxyError('nest'))
nextProxy.on('error', onProxyError('next'))

function isNestPath(url) {
    return (
        url.startsWith('/socket.io') ||
        url.startsWith('/api/v1')
    )
}

const server = http.createServer((req, res) => {
    const url = req.url || '/'
    if (isNestPath(url)) {
        nestProxy.web(req, res)
        return
    }
    nextProxy.web(req, res)
})

server.on('upgrade', (req, socket, head) => {
    const url = req.url || '/'
    if (isNestPath(url)) {
        nestProxy.ws(req, socket, head)
        return
    }
    nextProxy.ws(req, socket, head)
})

server.listen(EDGE_PORT, '0.0.0.0', () => {
    console.log(
        `[erp-edge-proxy] :${EDGE_PORT} → nest ${NEST_ORIGIN} (/api/v1,/socket.io) | next ${NEXT_ORIGIN}`,
    )
})
