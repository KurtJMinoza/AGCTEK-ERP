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
 * Cookie Secure / `__Secure-` prefix must match between sign-in, RSC `auth()`,
 * and sign-out. If they disagree, the layout sees `session: null` while
 * `/api/auth/session` still works — empty home + Anonymous dropdown — or
 * logout clears the wrong cookie name and the JWT survives Next restarts.
 *
 * Explicit AUTH_SECURE_COOKIES wins; otherwise AUTH_URL=http://… forces
 * non-Secure; public HTTPS (erp.agctek.co) keeps Secure cookies; LAN HTTP does not.
 */
function shouldUseSecureCookies(req?: Request | { headers: Headers } | null) {
    if (process.env.AUTH_SECURE_COOKIES === 'true') return true
    if (process.env.AUTH_SECURE_COOKIES === 'false') return false

    const authUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? ''
    if (authUrl.startsWith('http://')) return false

    const host =
        req?.headers?.get('x-forwarded-host') ?? req?.headers?.get('host')
    const proto = (req?.headers?.get('x-forwarded-proto') ?? '')
        .split(',')[0]
        .trim()
        .toLowerCase()

    // No request context (RSC / some server actions): trust AUTH_URL / https only.
    if (!host) return authUrl.startsWith('https://')

    if (isLanOrLocalHost(host) && proto !== 'https') return false
    if (proto === 'https') return true
    return authUrl.startsWith('https://')
}

/**
 * Lazy config so public HTTPS keeps Secure cookies, while local/LAN http works
 * and sign-out clears the same cookie name sign-in wrote.
 */
export const { handlers, signIn, signOut, auth } = NextAuth((req) => {
    return {
        trustHost: true,
        useSecureCookies: shouldUseSecureCookies(req),
        pages: {
            signIn: appConfig.unAuthenticatedEntryPath,
            error: appConfig.unAuthenticatedEntryPath,
        },
        ...authConfig,
    }
})
