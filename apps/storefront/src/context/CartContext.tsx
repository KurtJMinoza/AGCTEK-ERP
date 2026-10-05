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
import type { CurrencyCode, Product } from '../types'

export const MAX_LINE_QUANTITY = 999

/** Snapshot of the product at add time; final prices come from the order response. */
export type CartItem = {
    productId: string
    sku: string
    name: string
    category: string
    uom: string
    unitPrice: number
    currency: CurrencyCode
    imageUrl: string | null
    quantity: number
}

type StoredCart = { version: 1; items: CartItem[] }

type CartContextValue = {
    items: CartItem[]
    hydrated: boolean
    itemCount: number
    /** Display estimate only; the order total returned by the API is authoritative. */
    estimatedSubtotal: number
    getQuantity: (productId: string) => number
    addItem: (product: Product, quantity?: number) => void
    updateQuantity: (productId: string, quantity: number) => void
    removeItem: (productId: string) => void
    clear: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

function clampQuantity(quantity: number): number {
    return Math.min(MAX_LINE_QUANTITY, Math.max(0, Math.floor(quantity)))
}

function isCartItem(value: unknown): value is CartItem {
    const v = value as CartItem
    return (
        !!v &&
        typeof v.productId === 'string' &&
        typeof v.name === 'string' &&
        typeof v.unitPrice === 'number' &&
        typeof v.quantity === 'number' &&
        v.quantity > 0
    )
}

export function CartProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<CartItem[]>([])
    const [hydrated, setHydrated] = useState(false)

    useEffect(() => {
        let cancelled = false
        void loadJson<StoredCart>(STORAGE_KEYS.cart)
            .then((stored) => {
                if (cancelled) return
                if (stored?.version === 1 && Array.isArray(stored.items)) {
                    setItems(stored.items.filter(isCartItem))
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
        const stored: StoredCart = { version: 1, items }
        void saveJson(STORAGE_KEYS.cart, stored)
    }, [items, hydrated])

    const addItem = useCallback((product: Product, quantity = 1) => {
        if (!product.available) return
        setItems((current) => {
            const existing = current.find((i) => i.productId === product.id)
            if (existing) {
                return current.map((i) =>
                    i.productId === product.id
                        ? { ...i, quantity: clampQuantity(i.quantity + quantity) }
                        : i,
                )
            }
            const next = clampQuantity(quantity)
            if (next === 0) return current
            return [
                ...current,
                {
                    productId: product.id,
                    sku: product.sku,
                    name: product.name,
                    category: product.category,
                    uom: product.uom,
                    unitPrice: product.unitPrice,
                    currency: product.currency,
                    imageUrl: product.imageUrl,
                    quantity: next,
                },
            ]
        })
    }, [])

    const updateQuantity = useCallback((productId: string, quantity: number) => {
        const next = clampQuantity(quantity)
        setItems((current) =>
            next === 0
                ? current.filter((i) => i.productId !== productId)
                : current.map((i) => (i.productId === productId ? { ...i, quantity: next } : i)),
        )
    }, [])

    const removeItem = useCallback((productId: string) => {
        setItems((current) => current.filter((i) => i.productId !== productId))
    }, [])

    const clear = useCallback(() => setItems([]), [])

    const value = useMemo<CartContextValue>(() => {
        const quantities = new Map(items.map((i) => [i.productId, i.quantity]))
        return {
            items,
            hydrated,
            itemCount: items.reduce((total, i) => total + i.quantity, 0),
            estimatedSubtotal: items.reduce((total, i) => total + i.unitPrice * i.quantity, 0),
            getQuantity: (productId) => quantities.get(productId) ?? 0,
            addItem,
            updateQuantity,
            removeItem,
            clear,
        }
    }, [items, hydrated, addItem, updateQuantity, removeItem, clear])

    return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
    const ctx = useContext(CartContext)
    if (!ctx) throw new Error('useCart must be used within CartProvider')
    return ctx
}
