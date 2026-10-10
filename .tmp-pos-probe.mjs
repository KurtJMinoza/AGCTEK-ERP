import { readFileSync } from 'node:fs'
import { encode } from '@auth/core/jwt'

const env = readFileSync('.env.local', 'utf8')
const secret = env.match(/^AUTH_SECRET\s*=\s*"?([^"\r\n]+)"?/m)?.[1]
if (!secret) throw new Error('AUTH_SECRET not found')

const salt = 'authjs.session-token'
const now = Math.floor(Date.now() / 1000)
const token = await encode({
    salt,
    secret,
    token: { sub: 'probe', name: 'probe', email: 'probe@local', exp: now + 600 },
})

for (const path of process.argv.slice(2)) {
    const res = await fetch(`http://localhost:3010${path}`, {
        headers: { cookie: `${salt}=${token}` },
        redirect: 'manual',
    })
    const html = await res.text()
    const hint = html.match(/<title>([^<]*)<\/title>/)?.[1]
    console.log(path, res.status, res.headers.get('location') ?? '', hint ?? '')
}
