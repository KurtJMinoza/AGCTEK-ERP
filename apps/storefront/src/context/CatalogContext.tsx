import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react'
import { commerceApi } from '../api/client'
import { productKey } from '../catalog'
import type { Product } from '../types'

type CatalogContextValue = {
    products: Product[]
    byKey: Map<string, Product>
    byId: Map<string, Product>
    /** First load finished (successfully or not). */
    ready: boolean
    loading: boolean
    refreshing: boolean
    error: string | null
    /** Re-fetches the catalogue; resolves with the fresh products. */
    refresh: () => Promise<Product[] | null>
}

const CatalogContext = createContext<CatalogContextValue | null>(null)

/** All active products from every store, loaded once and shared by every screen (like the web shop). */
export function CatalogProvider({ children }: { children: ReactNode }) {
    const [products, setProducts] = useState<Product[]>([])
    const [ready, setReady] = useState(false)
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const requestId = useRef(0)

    const load = useCallback(async (mode: 'initial' | 'refresh') => {
        const id = ++requestId.current
        if (mode === 'initial') setLoading(true)
        else setRefreshing(true)
        setError(null)
        try {
            const next = await commerceApi.getProducts()
            if (id === requestId.current) setProducts(next)
            return next
        } catch (e) {
            if (id === requestId.current) {
                setError(e instanceof Error ? e.message : 'Unable to load products')
            }
            return null
        } finally {
            if (id === requestId.current) {
                setLoading(false)
                setRefreshing(false)
                setReady(true)
            }
        }
    }, [])

    useEffect(() => {
        void load('initial')
    }, [load])

    const refresh = useCallback(() => load('refresh'), [load])

    const value = useMemo<CatalogContextValue>(
        () => ({
            products,
            byKey: new Map(products.map((p) => [productKey(p), p])),
            byId: new Map(products.map((p) => [p.id, p])),
            ready,
            loading,
            refreshing,
            error,
            refresh,
        }),
        [products, ready, loading, refreshing, error, refresh],
    )

    return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
}

export function useCatalog(): CatalogContextValue {
    const ctx = useContext(CatalogContext)
    if (!ctx) throw new Error('useCatalog must be used within CatalogProvider')
    return ctx
}
