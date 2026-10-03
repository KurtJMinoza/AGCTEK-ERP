import { create } from 'zustand'
import type { CartItem, RetailProduct } from '@/types/storefront/retail'

type RetailCartState = {
    items: CartItem[]
    /** Promo code accepted by SD pricing; totals come from calculateCartPricing. */
    discountCode: string | null
    isDrawerOpen: boolean
    openDrawer: () => void
    closeDrawer: () => void
    setItems: (items: CartItem[]) => void
    setDiscountCode: (code: string | null) => void
    addItem: (
        product: RetailProduct,
        quantity?: number,
        options?: { openDrawer?: boolean },
    ) => void
    updateQuantity: (sku: string, quantity: number) => void
    removeItem: (sku: string) => void
    clearCart: () => void
    itemCount: () => number
    /** Refreshes cart products from the live catalog and drops SKUs no longer sold. */
    syncCatalog: (products: readonly RetailProduct[]) => void
}

export const useRetailCartStore = create<RetailCartState>((set, get) => ({
    items: [],
    discountCode: null,
    isDrawerOpen: false,
    openDrawer: () => set({ isDrawerOpen: true }),
    closeDrawer: () => set({ isDrawerOpen: false }),
    setItems: (items) => set({ items }),
    setDiscountCode: (discountCode) => set({ discountCode }),
    addItem: (product, quantity = 1, options) => {
        const qty = Math.max(1, quantity)
        const shouldOpenDrawer = options?.openDrawer !== false
        set((state) => {
            const existing = state.items.find(
                (item) => item.product.sku === product.sku,
            )
            if (existing) {
                return {
                    items: state.items.map((item) =>
                        item.product.sku === product.sku
                            ? { product, quantity: existing.quantity + qty }
                            : item,
                    ),
                    isDrawerOpen: shouldOpenDrawer
                        ? true
                        : state.isDrawerOpen,
                }
            }
            return {
                items: [...state.items, { product, quantity: qty }],
                isDrawerOpen: shouldOpenDrawer ? true : state.isDrawerOpen,
            }
        })
    },
    updateQuantity: (sku, quantity) => {
        const qty = Math.max(1, quantity)
        set((state) => ({
            items: state.items.map((item) =>
                item.product.sku === sku ? { ...item, quantity: qty } : item,
            ),
        }))
    },
    removeItem: (sku) =>
        set((state) => ({
            items: state.items.filter((item) => item.product.sku !== sku),
        })),
    clearCart: () => set({ items: [], discountCode: null }),
    itemCount: () =>
        get().items.reduce((sum, item) => sum + item.quantity, 0),
    syncCatalog: (products) =>
        set((state) => {
            const bySku = new Map(products.map((p) => [p.sku, p]))
            const unchanged = state.items.every(
                (item) => bySku.get(item.product.sku) === item.product,
            )
            if (unchanged) return state
            return {
                items: state.items.flatMap((item) => {
                    const product = bySku.get(item.product.sku)
                    return product ? [{ ...item, product }] : []
                }),
            }
        }),
}))
