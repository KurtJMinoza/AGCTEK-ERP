import { LPG_DIVISION_ID } from '@/modules/sd/catalogs/lpgCatalog'
import { APPLIANCES_DIVISION_ID } from '@/modules/sd/catalogs/mconpincoCatalog'
import { RETAIL_DIVISION_ID } from '@/types/storefront/retail'

/** App-router path of the marketplace on the ERP host (e.g. erp.agctek.co/shop). */
export const MARKETPLACE_PATH = '/shop' as const

/** URL segment per store, e.g. /shop/mconpinco/MCO-PRD-000001. */
const STORE_SLUGS: Record<string, string> = {
    [RETAIL_DIVISION_ID]: 'awic',
    [LPG_DIVISION_ID]: 'lpg',
    [APPLIANCES_DIVISION_ID]: 'mconpinco',
}

/** Full catalogue page (search, filters, sort), e.g. /shop/products?store=awic. */
export const MARKETPLACE_PRODUCTS_PATH = `${MARKETPLACE_PATH}/products` as const

export const storeSlug = (divisionId: string) =>
    STORE_SLUGS[divisionId] ?? divisionId.toLowerCase()

export const divisionForStoreSlug = (slug: string) =>
    Object.keys(STORE_SLUGS).find(
        (divisionId) => STORE_SLUGS[divisionId] === slug.toLowerCase(),
    ) ?? null

/** Product page link (SKUs are unique per store, so both are in the path). */
export const productHref = (product: { divisionId: string; sku: string }) =>
    `${MARKETPLACE_PATH}/${storeSlug(product.divisionId)}/${encodeURIComponent(product.sku)}`

/** `/<store>/<sku>` on a dedicated marketplace host. */
export const isMarketplaceProductPath = (path: string) => {
    const [store, sku, ...rest] = path.split('/').filter(Boolean)
    return Boolean(
        store && sku && rest.length === 0 && divisionForStoreSlug(store),
    )
}

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
