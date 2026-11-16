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
 * Lazy config so public HTTPS (erp.agctek.co) keeps Secure cookies, while
 * LAN http://IP:3010 can still establish a session without Secure.
 */
export const { handlers, signIn, signOut, auth } = NextAuth((req) => {
    const host =
        req?.headers?.get('x-forwarded-host') ?? req?.headers?.get('host')
    const proto = (
        req?.headers?.get('x-forwarded-proto') ??
        ''
    )
        .split(',')[0]
        .trim()
        .toLowerCase()
    const lanHttp = isLanOrLocalHost(host) && proto !== 'https'

    return {
        trustHost: true,
        useSecureCookies: !lanHttp,
        pages: {
            signIn: appConfig.unAuthenticatedEntryPath,
            error: appConfig.unAuthenticatedEntryPath,
        },
        ...authConfig,
    }
})
