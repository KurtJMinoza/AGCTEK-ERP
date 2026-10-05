import type { Product, ProductQuery } from '../types'
import { useCommerceQuery } from './useCommerceQuery'

export function useProducts(query: ProductQuery = {}) {
    const { search, category } = query
    return useCommerceQuery<Product[]>(
        (api) => api.getProducts({ search, category }),
        [search, category],
    )
}

export function useProduct(id: string | undefined) {
    return useCommerceQuery<Product | null>(
        (api) => (id ? api.getProduct(id) : Promise.resolve(null)),
        [id],
    )
}
