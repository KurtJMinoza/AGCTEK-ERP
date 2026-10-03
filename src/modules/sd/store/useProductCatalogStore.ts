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
    /**
     * Loads the active products of every listed division with one request
     * (marketplace), filling each division's cache. Returns them combined.
     */
    ensureAllLoaded: (
        divisionIds: readonly string[],
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

const isFresh = (catalog: DivisionCatalog | undefined) =>
    Boolean(
        catalog?.products &&
            catalog.loadedAt !== null &&
            Date.now() - catalog.loadedAt < MAX_AGE_MS,
    )

export const useProductCatalogStore = create<ProductCatalogState>(
    (set, get) => {
        const patchMany = (
            divisionIds: readonly string[],
            next: (divisionId: string) => Partial<DivisionCatalog>,
        ) =>
            set((state) => {
                const catalogs = { ...state.catalogs }
                for (const id of divisionIds) {
                    catalogs[id] = { ...(catalogs[id] ?? EMPTY), ...next(id) }
                }
                return { catalogs }
            })
        const patch = (divisionId: string, next: Partial<DivisionCatalog>) =>
            patchMany([divisionId], () => next)

        return {
            catalogs: {},
            ensureAllLoaded: (divisionIds, options) => {
                const { catalogs } = get()
                if (!options?.force && divisionIds.every((id) => isFresh(catalogs[id]))) {
                    return Promise.resolve(
                        divisionIds.flatMap((id) => catalogs[id]!.products!),
                    )
                }
                const key = `*:${divisionIds.join(',')}`
                const pending = inFlight.get(key)
                if (pending) return pending

                patchMany(divisionIds, () => ({ loading: true, error: null }))
                const request = listProducts({ activeOnly: true })
                    .then((products) => {
                        const loadedAt = Date.now()
                        patchMany(divisionIds, (id) => ({
                            products: products.filter((p) => p.divisionId === id),
                            loading: false,
                            loadedAt,
                        }))
                        return products.filter((p) => divisionIds.includes(p.divisionId))
                    })
                    .catch((error: unknown) => {
                        patchMany(divisionIds, () => ({
                            loading: false,
                            error:
                                error instanceof Error
                                    ? error.message
                                    : 'Unable to load products.',
                        }))
                        throw error
                    })
                    .finally(() => inFlight.delete(key))
                inFlight.set(key, request)
                return request
            },
            ensureLoaded: (divisionId, options) => {
                const current = get().catalogs[divisionId]
                if (isFresh(current) && !options?.force) {
                    return Promise.resolve(current!.products!)
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
