export type AppConfig = {
    apiPrefix: string
    apiBaseUrl: string
    authenticatedEntryPath: string
    unAuthenticatedEntryPath: string
    locale: string
    activeNavTranslation: boolean
}

const appConfig: AppConfig = {
    apiPrefix: '/api',
    apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || 'https://erp.agctek.co',
    authenticatedEntryPath: '/home',
    unAuthenticatedEntryPath: '/sign-in',
    locale: 'en',
    activeNavTranslation: false,
}

/**
 * Browser HTTP calls stay same-origin (`/api/v1`) so Next rewrites them to Nest.
 * Server actions talk to Nest directly via API_INTERNAL_URL.
 */
export function resolveErpApiBaseUrl() {
    if (typeof window !== 'undefined') {
        return '/api/v1'
    }
    const origin = (
        process.env.API_INTERNAL_URL ||
        process.env.NEXT_PUBLIC_API_BASE_URL ||
        'http://127.0.0.1:3011'
    ).replace(/\/$/, '')
    return origin.endsWith('/api/v1') ? origin : `${origin}/api/v1`
}

/**
 * Socket.IO: on localhost talk to Nest :3011 (Next rewrites do not upgrade WS).
 * Elsewhere use same-origin so nginx/Next can proxy `/socket.io`.
 */
export function resolveErpSocketOrigin() {
    if (typeof window === 'undefined') return ''
    const { protocol, hostname } = window.location
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return `${protocol}//${hostname}:3011`
    }
    return ''
}

export default appConfig
