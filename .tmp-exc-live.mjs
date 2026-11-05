import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { encode } from '@auth/core/jwt'

const wsUrl = process.argv[2]
const outDir = process.argv[3]
const userId = 'cmuw1zn7u000vosos0o6f1ybh'

const env = readFileSync('.env.local', 'utf8')
const secret = env.match(/^AUTH_SECRET\s*=\s*"?([^"\r\n]+)"?/m)?.[1]
if (!secret) throw new Error('AUTH_SECRET not found')

const now = Math.floor(Date.now() / 1000)
const token = await encode({
    salt: 'authjs.session-token',
    secret,
    token: {
        sub: userId,
        name: 'Exception Probe',
        email: 'probe@local',
        exp: now + 3600,
    },
})

const ws = new WebSocket(wsUrl)
let seq = 0
const pending = new Map()
const failed = []
const consoleErrors = []

ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.method === 'Network.loadingFailed') {
        failed.push(msg.params)
        return
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        consoleErrors.push(
            msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '),
        )
        return
    }
    if (!msg.id) return
    const entry = pending.get(msg.id)
    if (!entry) return
    pending.delete(msg.id)
    if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)))
    else entry.resolve(msg.result)
})

function send(method, params = {}) {
    const id = ++seq
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
    })
}

await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
})

await send('Page.enable')
await send('Runtime.enable')
await send('Network.enable')
await send('Network.setCookie', {
    name: 'authjs.session-token',
    value: token,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
})

const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
    })
    return result.result.value
}

const metricsExpression = `(() => {
    const table = document.querySelector('table')
    if (!table) return JSON.stringify({ error: 'no table', text: document.body.innerText.slice(0, 400) })
    const cells = [...table.querySelectorAll('thead th')].map((th) => ({
        text: th.textContent.trim(),
        width: Math.round(th.getBoundingClientRect().width),
        display: getComputedStyle(th).display,
    }))
    const rows = [...table.querySelectorAll('tbody tr')]
    const summary = [...document.querySelectorAll('p')]
        .map((p) => p.textContent.trim())
        .find((t) => t.startsWith('Showing') || t.startsWith('No matching'))
    const pagination = document.querySelector('.pagination')?.textContent?.trim()
    return JSON.stringify({
        viewport: window.innerWidth,
        docScrollWidth: document.documentElement.scrollWidth,
        tableWidth: Math.round(table.getBoundingClientRect().width),
        tableScrollWidth: table.scrollWidth,
        rowCount: rows.length,
        firstRow: rows[0]?.innerText.replace(/\\n/g, ' | ').slice(0, 160) ?? null,
        rowHeight: rows[0] ? Math.round(rows[0].getBoundingClientRect().height) : null,
        summary,
        pagination,
        cells,
    })
})()`

const widths = [390, 640, 768, 1024, 1280, 1536]

for (const width of widths) {
    await send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: false,
    })
    await send('Page.navigate', {
        url: 'http://localhost:3010/modules/mm/exception-center',
    })
    await new Promise((r) => setTimeout(r, 6000))
    console.log(`--- ${width}px ---`)
    console.log(await evaluate(metricsExpression))
    const shot = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
    })
    writeFileSync(join(outDir, `live-${width}.png`), Buffer.from(shot.data, 'base64'))
}

// Pagination smoke: go to page 2 at 1280px.
await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
})
await send('Page.navigate', {
    url: 'http://localhost:3010/modules/mm/exception-center',
})
await new Promise((r) => setTimeout(r, 6000))
const before = await evaluate(metricsExpression)
await evaluate(`document.querySelector('.pagination-pager-next')?.click()`)
await new Promise((r) => setTimeout(r, 3500))
const after = await evaluate(metricsExpression)
console.log('--- pagination ---')
console.log('before:', before)
console.log('after :', after)

console.log('--- failed requests ---')
console.log(JSON.stringify(failed.map((f) => ({ url: f.requestId, error: f.errorText })), null, 2))
console.log('--- console errors ---')
console.log(JSON.stringify(consoleErrors, null, 2))

ws.close()
