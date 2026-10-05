/** Amalgated World Import Corporation — retail storefront brand */
export const AWIC_BRAND = {
    fullName: 'Amalgated World Import Corporation',
    shortName: 'Amalgated World',
    initials: 'AWIC',
} as const

/** App-router path when AWIC is served on the ERP host (e.g. erp.agctek.co/awic) */
export const AWIC_STOREFRONT_PATH = '/awic' as const

/**
 * Hostnames that serve AWIC retail at the site root (no /awic prefix in the bar).
 * Does not include awic.localhost — that host serves the marketplace (see marketplace/host).
 * Extra hosts: comma-separated NEXT_PUBLIC_AWIC_HOSTS.
 */
export function isAwicStorefrontHost(hostname: string): boolean {
    const host = hostname.split(':')[0]?.toLowerCase() ?? ''
    if (!host) return false
    const extra =
        process.env.NEXT_PUBLIC_AWIC_HOSTS?.split(',')
            .map((value) => value.trim().toLowerCase())
            .filter(Boolean) ?? []
    return extra.includes(host)
}
