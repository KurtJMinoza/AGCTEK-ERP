import type { SortKey } from './catalog'

/** Filters for the full products page (same query as the web /shop/products). */
export type BrowseQuery = {
    store?: string
    category?: string
    sort?: SortKey
    q?: string
}

/** Route object for `router.push` to the products page; empty values are dropped. */
export const productsRoute = (query: BrowseQuery = {}) => {
    const params: Record<string, string> = {}
    for (const [key, value] of Object.entries(query)) {
        if (value) params[key] = value
    }
    return { pathname: '/products' as const, params }
}
