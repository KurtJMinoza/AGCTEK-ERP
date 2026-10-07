import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react'
import { loadJson, saveJson, STORAGE_KEYS } from '../api/storage'
import { productKey } from '../catalog'
import { calculateCartPricing } from '../pricing'
import type { CartPricing, Product } from '../types'
import { useCatalog } from './CatalogContext'

export const MAX_LINE_QUANTITY = 99

/** Display snapshot of the product; prices are always recomputed from the live catalogue. */
export type CartItem = { product: Product; quantity: number }

type StoredCart = { version: 2; items: CartItem[] }

type CartContextValue = {
    items: CartItem[]
    hydrated: boolean
    itemCount: number
    quantityByKey: Map<string, number>
    promoCode: string | null
    /** Per-store pricing (null while the cart is empty or the catalogue is loading). */
    pricing: CartPricing | null
    addItem: (product: Product, quantity?: number) => void
    updateQuantity: (key: string, quantity: number) => void
    removeItem: (key: string) => void
    clear: () => void
    /** Applies (or clears with null) a promo code; returns an error message when invalid. */
    applyPromo: (code: string | null) => string | null
}

const CartContext = createContext<CartContextValue | null>(null)

const clampQuantity = (quantity: number) =>
    Math.min(MAX_LINE_QUANTITY, Math.max(0, Math.floor(quantity)))

function isCartItem(value: unknown): value is CartItem {
    const v = value as CartItem
    return (
        !!v?.product &&
        typeof v.product.sku === 'string' &&
        typeof v.product.divisionId === 'string' &&
        typeof v.quantity === 'number' &&
        v.quantity > 0
    )
}

/** One cart across every store; checkout splits it into one order per store (like the web shop). */
export function CartProvider({ children }: { children: ReactNode }) {
    const catalog = useCatalog()
    const [items, setItems] = useState<CartItem[]>([])
    const [hydrated, setHydrated] = useState(false)
    const [promoCode, setPromoCode] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        void loadJson<StoredCart>(STORAGE_KEYS.cart)
            .then((stored) => {
                if (cancelled) return
                if (stored?.version === 2 && Array.isArray(stored.items)) {
                    setItems(
                        stored.items
                            .filter(isCartItem)
                            .map((i) => ({ ...i, quantity: clampQuantity(i.quantity) })),
                    )
                }
            })
            .finally(() => {
                if (!cancelled) setHydrated(true)
            })
        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        if (!hydrated) return
        const stored: StoredCart = { version: 2, items }
        void saveJson(STORAGE_KEYS.cart, stored)
    }, [items, hydrated])

    // Refresh snapshots from the live catalogue and drop products no longer sold.
    const catalogLoaded = catalog.ready && !catalog.error
    useEffect(() => {
        if (!hydrated || !catalogLoaded) return
        setItems((current) => {
            const unchanged = current.every(
                (i) => catalog.byKey.get(productKey(i.product)) === i.product,
            )
            if (unchanged) return current
            return current.flatMap((i) => {
                const product = catalog.byKey.get(productKey(i.product))
                return product ? [{ ...i, product }] : []
            })
        })
    }, [hydrated, catalogLoaded, catalog.byKey])

    const addItem = useCallback((product: Product, quantity = 1) => {
        const key = productKey(product)
        setItems((current) => {
            const existing = current.find((i) => productKey(i.product) === key)
            if (existing) {
                return current.map((i) =>
                    i === existing
                        ? { product, quantity: clampQuantity(i.quantity + quantity) }
                        : i,
                )
            }
            const next = clampQuantity(quantity)
            return next === 0 ? current : [...current, { product, quantity: next }]
        })
    }, [])

    const updateQuantity = useCallback((key: string, quantity: number) => {
        const next = clampQuantity(quantity)
        setItems((current) =>
            next === 0
                ? current.filter((i) => productKey(i.product) !== key)
                : current.map((i) =>
                      productKey(i.product) === key ? { ...i, quantity: next } : i,
                  ),
        )
    }, [])

    const removeItem = useCallback((key: string) => {
        setItems((current) => current.filter((i) => productKey(i.product) !== key))
    }, [])

    const clear = useCallback(() => {
        setItems([])
        setPromoCode(null)
    }, [])

    const pricingItems = useMemo(
        () =>
            items.map((i) => ({
                divisionId: i.product.divisionId,
                sku: i.product.sku,
                quantity: i.quantity,
            })),
        [items],
    )

    const pricing = useMemo<CartPricing | null>(() => {
        if (items.length === 0 || !catalogLoaded) return null
        try {
            return calculateCartPricing(pricingItems, catalog.byKey, promoCode)
        } catch {
            try {
                return calculateCartPricing(pricingItems, catalog.byKey, null)
            } catch {
                return null
            }
        }
    }, [items.length, catalogLoaded, pricingItems, catalog.byKey, promoCode])

    // The code stops applying once its store's items leave the cart.
    useEffect(() => {
        if (promoCode && pricing && !pricing.promoCode) setPromoCode(null)
    }, [promoCode, pricing])

    const applyPromo = useCallback(
        (code: string | null) => {
            if (!code?.trim()) {
                setPromoCode(null)
                return null
            }
            try {
                const next = calculateCartPricing(pricingItems, catalog.byKey, code)
                setPromoCode(next.promoCode)
                return null
            } catch (e) {
                return e instanceof Error ? e.message : 'Invalid code'
            }
        },
        [pricingItems, catalog.byKey],
    )

    const value = useMemo<CartContextValue>(
        () => ({
            items,
            hydrated,
            itemCount: items.reduce((total, i) => total + i.quantity, 0),
            quantityByKey: new Map(items.map((i) => [productKey(i.product), i.quantity])),
            promoCode,
            pricing,
            addItem,
            updateQuantity,
            removeItem,
            clear,
            applyPromo,
        }),
        [items, hydrated, promoCode, pricing, addItem, updateQuantity, removeItem, clear, applyPromo],
    )

    return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
    const ctx = useContext(CartContext)
    if (!ctx) throw new Error('useCart must be used within CartProvider')
    return ctx
}
