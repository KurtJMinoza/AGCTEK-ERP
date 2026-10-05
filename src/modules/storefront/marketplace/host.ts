/** App-router path of the marketplace on the ERP host (e.g. erp.agctek.co/shop). */
export const MARKETPLACE_PATH = '/shop' as const

const BUILT_IN_HOSTS = ['shop.localhost', 'awic.localhost']

/**
 * Hostnames that serve the marketplace at the site root. Built-in:
 * shop.localhost and awic.localhost (no DNS needed locally). Extra hosts:
 * comma-separated NEXT_PUBLIC_SHOP_HOSTS, or the older NEXT_PUBLIC_AWIC_HOSTS.
 */
export function isMarketplaceHost(hostname: string): boolean {
    const host = hostname.split(':')[0]?.toLowerCase() ?? ''
    if (!host) return false
    if (
        BUILT_IN_HOSTS.some(
            (base) => host === base || host.endsWith(`.${base}`),
        )
    ) {
        return true
    }
    const extra = [
        process.env.NEXT_PUBLIC_SHOP_HOSTS,
        process.env.NEXT_PUBLIC_AWIC_HOSTS,
    ]
        .flatMap((value) => value?.split(',') ?? [])
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    return extra.includes(host)
}
