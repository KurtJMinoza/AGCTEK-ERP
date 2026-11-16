/**
 * Edge proxy for Cloudflare → this host.
 *
 * Cloudflare tunnel points at :3010. Next.js rewrites cannot proxy Socket.IO
 * (empty Engine.IO responses / no WS upgrade). This process owns :3010 and:
 *   /socket.io  → Nest :3011  (HTTP + WebSocket)
 *   /api/v1     → Nest :3011
 *   /uploads    → public/uploads on disk (falls back to Next)
 *   everything else → Next :3020
 */
const fs = require('fs')
const http = require('http')
const path = require('path')
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

/**
 * cloudflared → :3010 is plain HTTP. With changeOrigin, Host becomes
 * 127.0.0.1:3020 (or Next's 0.0.0.0 bind) and Auth.js builds broken
 * callback URLs like https://0.0.0.0:3020 — sign-in fails on erp.agctek.co.
 * Always forward the browser-facing host + real proto.
 */
function publicHost(req) {
    const raw =
        req.headers['x-forwarded-host'] ||
        req.headers['host'] ||
        ''
    return String(raw).split(',')[0].trim()
}

function publicProto(req) {
    const fromHeader = req.headers['x-forwarded-proto']
    if (fromHeader) return String(fromHeader).split(',')[0].trim()
    const visitor = req.headers['cf-visitor']
    if (typeof visitor === 'string') {
        try {
            const scheme = JSON.parse(visitor).scheme
            if (scheme) return String(scheme)
        } catch {
            /* ignore */
        }
    }
    // Cloudflare / public hostname over the tunnel is always HTTPS.
    const host = publicHost(req)
    if (host && !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host) && !/^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(host)) {
        return 'https'
    }
    return 'http'
}

function preserveForwardedHeaders(proxyReq, req) {
    const host = publicHost(req)
    const proto = publicProto(req)
    if (host) proxyReq.setHeader('X-Forwarded-Host', host)
    if (proto) proxyReq.setHeader('X-Forwarded-Proto', proto)
    // Keep the browser Host visible to Next/Auth even after changeOrigin.
    if (host) proxyReq.setHeader('X-Forwarded-Server', host)
    if (req.headers['cf-connecting-ip'] && !req.headers['x-real-ip']) {
        proxyReq.setHeader('X-Real-IP', req.headers['cf-connecting-ip'])
    }
}

nestProxy.on('proxyReq', preserveForwardedHeaders)
nextProxy.on('proxyReq', preserveForwardedHeaders)

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
    return url.startsWith('/socket.io') || url.startsWith('/api/v1')
}

/**
 * `next start` only serves files that were in public/ at build time, so product
 * photos/videos uploaded later are served here straight from disk.
 */
const UPLOADS_ROOT = path.resolve(
    process.env.UPLOADS_DIR || path.join(__dirname, '..', 'public', 'uploads'),
)
const UPLOAD_TYPES = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
}

/** Returns true when the request was answered from public/uploads. */
function serveUpload(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false
    let relative
    try {
        relative = decodeURIComponent((req.url || '').split('?')[0]).slice(
            '/uploads/'.length,
        )
    } catch {
        return false
    }
    const filePath = path.resolve(UPLOADS_ROOT, relative)
    const type = UPLOAD_TYPES[path.extname(filePath).toLowerCase()]
    if (!type || !filePath.startsWith(UPLOADS_ROOT + path.sep)) return false
    let stat
    try {
        stat = fs.statSync(filePath)
    } catch {
        return false
    }
    if (!stat.isFile()) return false

    const headers = {
        'Content-Type': type,
        'Accept-Ranges': 'bytes',
        // Upload names are random UUIDs, so a URL never changes content.
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Last-Modified': stat.mtime.toUTCString(),
    }
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '')
    let start = 0
    let end = stat.size - 1
    let status = 200
    if (range && (range[1] || range[2])) {
        if (range[1]) {
            start = Number(range[1])
            if (range[2]) end = Math.min(Number(range[2]), end)
        } else {
            start = Math.max(0, stat.size - Number(range[2]))
        }
        if (start > end || start >= stat.size) {
            res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` })
            res.end()
            return true
        }
        status = 206
        headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`
    }
    headers['Content-Length'] = end - start + 1
    res.writeHead(status, headers)
    if (req.method === 'HEAD') {
        res.end()
        return true
    }
    fs.createReadStream(filePath, { start, end })
        .on('error', () => res.destroy())
        .pipe(res)
    return true
}

function proxyPath(url) {
    const pathOnly = (url || '/').split('?')[0]
    if (pathOnly === '/favicon.ico') {
        const qs = url.includes('?') ? url.slice(url.indexOf('?')) : ''
        return `/icon${qs}`
    }
    return url
}

const server = http.createServer((req, res) => {
    const url = req.url || '/'
    if (isNestPath(url)) {
        nestProxy.web(req, res)
        return
    }
    if (url.startsWith('/uploads/') && serveUpload(req, res)) return
    req.url = proxyPath(url)
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
