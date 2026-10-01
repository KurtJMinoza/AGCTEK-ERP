import { create } from 'zustand'
import {
    listProducts,
    type SdProductRecord,
} from '../services/productCatalogService'

/** Storefronts refetch after this so admin edits show up without a reload. */
const MAX_AGE_MS = 60_000

type DivisionCatalog = {
    /** Active products, in storefront order; null until the first load. */
    products: SdProductRecord[] | null
    loading: boolean
    error: string | null
    loadedAt: number | null
}

type ProductCatalogState = {
    catalogs: Partial<Record<string, DivisionCatalog>>
    /** Returns cached active products unless stale or `force` is set. */
    ensureLoaded: (
        divisionId: string,
        options?: { force?: boolean },
    ) => Promise<SdProductRecord[]>
    /** Marks a division stale so the next `ensureLoaded` refetches. */
    invalidate: (divisionId: string) => void
}

const EMPTY: DivisionCatalog = {
    products: null,
    loading: false,
    error: null,
    loadedAt: null,
}

const inFlight = new Map<string, Promise<SdProductRecord[]>>()

export const useProductCatalogStore = create<ProductCatalogState>(
    (set, get) => {
        const patch = (divisionId: string, next: Partial<DivisionCatalog>) =>
            set((state) => ({
                catalogs: {
                    ...state.catalogs,
                    [divisionId]: {
                        ...(state.catalogs[divisionId] ?? EMPTY),
                        ...next,
                    },
                },
            }))

        return {
            catalogs: {},
            ensureLoaded: (divisionId, options) => {
                const current = get().catalogs[divisionId]
                const fresh =
                    current?.products &&
                    current.loadedAt !== null &&
                    Date.now() - current.loadedAt < MAX_AGE_MS
                if (fresh && !options?.force) {
                    return Promise.resolve(current.products!)
                }
                const pending = inFlight.get(divisionId)
                if (pending) return pending

                patch(divisionId, { loading: true, error: null })
                const request = listProducts({ divisionId, activeOnly: true })
                    .then((products) => {
                        patch(divisionId, {
                            products,
                            loading: false,
                            loadedAt: Date.now(),
                        })
                        return products
                    })
                    .catch((error: unknown) => {
                        patch(divisionId, {
                            loading: false,
                            error:
                                error instanceof Error
                                    ? error.message
                                    : 'Unable to load products.',
                        })
                        throw error
                    })
                    .finally(() => inFlight.delete(divisionId))
                inFlight.set(divisionId, request)
                return request
            },
            invalidate: (divisionId) => patch(divisionId, { loadedAt: null }),
        }
    },
)
