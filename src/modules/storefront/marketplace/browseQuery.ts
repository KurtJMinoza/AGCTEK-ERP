import {
    MARKETPLACE_PRODUCTS_PATH,
    divisionForStoreSlug,
    storeSlug,
} from './host'

export type SortKey = 'recommended' | 'discount' | 'price-asc' | 'price-desc'

const SORT_KEYS: readonly SortKey[] = [
    'recommended',
    'discount',
    'price-asc',
    'price-desc',
]

/** What the /shop/products page shows; lives in the URL so it can be shared and survives Back. */
export type BrowseQuery = {
    /** Division ids (the URL carries store slugs, e.g. `store=awic`). */
    stores: string[]
    /** MM company ids resolved by active SD product-to-material assignments. */
    companies: string[]
    categories: string[]
    sort: SortKey
    q: string
}

export const EMPTY_BROWSE_QUERY: BrowseQuery = {
    stores: [],
    companies: [],
    categories: [],
    sort: 'recommended',
    q: '',
}

export const parseBrowseQuery = (params: URLSearchParams): BrowseQuery => {
    const sort = params.get('sort') as SortKey | null
    return {
        stores: [
            ...new Set(
                params
                    .getAll('store')
                    .map(divisionForStoreSlug)
                    .filter((id): id is string => id !== null),
            ),
        ],
        companies: [
            ...new Set(
                params
                    .getAll('company')
                    .map((id) => id.trim())
                    .filter(Boolean),
            ),
        ],
        categories: [
            ...new Set(params.getAll('category').filter((c) => c.trim())),
        ],
        sort: sort && SORT_KEYS.includes(sort) ? sort : 'recommended',
        q: params.get('q')?.trim() ?? '',
    }
}

export const productsHref = (query: Partial<BrowseQuery> = {}) => {
    const params = new URLSearchParams()
    const q = query.q?.trim()
    if (q) params.set('q', q)
    for (const divisionId of query.stores ?? [])
        params.append('store', storeSlug(divisionId))
    for (const companyId of query.companies ?? [])
        params.append('company', companyId)
    for (const category of query.categories ?? [])
        params.append('category', category)
    if (query.sort && query.sort !== 'recommended')
        params.set('sort', query.sort)
    const search = params.toString()
    return search
        ? `${MARKETPLACE_PRODUCTS_PATH}?${search}`
        : MARKETPLACE_PRODUCTS_PATH
}
