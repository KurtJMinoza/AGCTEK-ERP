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
 * Cookie Secure / `__Secure-` prefix must match between sign-in and sign-out.
 * Server actions often call NextAuth without a request — never default those to
 * Secure cookies when AUTH_URL is http://localhost, or logout clears the wrong name
 * and the browser JWT keeps the user signed in across Next restarts.
 */
function shouldUseSecureCookies(req?: Request | { headers: Headers } | null) {
    const authUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? ''
    if (authUrl.startsWith('http://')) return false

    const host =
        req?.headers?.get('x-forwarded-host') ?? req?.headers?.get('host')
    const proto = (req?.headers?.get('x-forwarded-proto') ?? '')
        .split(',')[0]
        .trim()
        .toLowerCase()

    // No request context (some server actions): trust AUTH_URL / https only.
    if (!host) return authUrl.startsWith('https://')

    // Public HTTPS (erp.agctek.co) keeps Secure cookies; LAN http://IP:3010 does not.
    if (isLanOrLocalHost(host) && proto !== 'https') return false
    if (proto === 'https') return true
    return authUrl.startsWith('https://')
}

/**
 * Lazy config so public HTTPS keeps Secure cookies, while local/LAN http works
 * and sign-out clears the same cookie name sign-in wrote.
 */
export const { handlers, signIn, signOut, auth } = NextAuth((req) => {
    const useSecureCookies = shouldUseSecureCookies(req)

    return {
        trustHost: true,
        useSecureCookies,
        pages: {
            signIn: appConfig.unAuthenticatedEntryPath,
            error: appConfig.unAuthenticatedEntryPath,
        },
        ...authConfig,
    }
})
