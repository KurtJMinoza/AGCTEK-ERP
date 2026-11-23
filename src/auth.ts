import NextAuth from 'next-auth'
import appConfig from '@/configs/app.config'
import authConfig from '@/configs/auth.config'

function isLanOrLocalHost(host: string | null | undefined) {
    if (!host) return false
    const h = host.split(',')[0].trim().toLowerCase()
    return (
        h.startsWith('localhost') ||
        h.startsWith('127.0.0.1') ||
        h.startsWith('[::1]') ||
        /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(h)
    )
}

/**
 * Cookie Secure flag must match between login (route handler, has `req`) and
 * RSC `auth()` (often no `req`). If they disagree, the layout sees `session: null`
 * while `/api/auth/session` still works — empty home + Anonymous dropdown.
 *
 * Default: non-Secure (localhost / LAN HTTP). Opt into Secure only when the
 * request is clearly public HTTPS, or AUTH_SECURE_COOKIES=true.
 */
function resolveUseSecureCookies(req: Request | undefined) {
    if (process.env.AUTH_SECURE_COOKIES === 'true') return true
    if (process.env.AUTH_SECURE_COOKIES === 'false') return false
    if (!req) {
        // RSC / server actions: keep the same jar as typical local login.
        return false
    }
    const host =
        req.headers.get('x-forwarded-host') ?? req.headers.get('host')
    const proto = (req.headers.get('x-forwarded-proto') ?? '')
        .split(',')[0]
        .trim()
        .toLowerCase()
    if (isLanOrLocalHost(host)) return false
    return proto === 'https'
}

/**
 * Lazy config so public HTTPS (erp.agctek.co) can use Secure cookies, while
 * LAN http://IP:3010 keeps a readable non-Secure session in RSC.
 */
export const { handlers, signIn, signOut, auth } = NextAuth((req) => {
    return {
        trustHost: true,
        useSecureCookies: resolveUseSecureCookies(req),
        pages: {
            signIn: appConfig.unAuthenticatedEntryPath,
            error: appConfig.unAuthenticatedEntryPath,
        },
        ...authConfig,
    }
})
