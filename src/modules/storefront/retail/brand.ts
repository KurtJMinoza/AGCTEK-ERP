/** Amalgated World Import Corporation — retail storefront brand */
export const AWIC_BRAND = {
    fullName: 'Amalgated World Import Corporation',
    shortName: 'Amalgated World',
    initials: 'AWIC',
} as const

/** App-router path when AWIC is served on the ERP host (e.g. erp.agctek.co/awic) */
export const AWIC_STOREFRONT_PATH = '/awic' as const

/**
 * Hostnames that serve AWIC at the site root (no /awic prefix in the address bar).
 * Built-in: awic.localhost (works locally without DNS).
 * Extra hosts: comma-separated NEXT_PUBLIC_AWIC_HOSTS (e.g. awic.com,www.awic.com).
 */
export function isAwicStorefrontHost(hostname: string): boolean {
    const host = hostname.split(':')[0]?.toLowerCase() ?? ''
    if (!host) return false
    if (host === 'awic.localhost' || host.endsWith('.awic.localhost')) {
        return true
    }
    const extra =
        process.env.NEXT_PUBLIC_AWIC_HOSTS?.split(',')
            .map((value) => value.trim().toLowerCase())
            .filter(Boolean) ?? []
    return extra.includes(host)
}

/** September Sale discount applied to highlighted products */
export const SEPTEMBER_SALE_DISCOUNT = 0.2 as const

export function getSeptemberSalePrice(basePrice: number): number {
    return Math.round(basePrice * (1 - SEPTEMBER_SALE_DISCOUNT))
}
