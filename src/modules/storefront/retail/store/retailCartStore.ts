import { create } from 'zustand'
import type { CartItem, RetailProduct } from '@/types/storefront/retail'

type RetailCartState = {
    items: CartItem[]
    isDrawerOpen: boolean
    openDrawer: () => void
    closeDrawer: () => void
    setItems: (items: CartItem[]) => void
    addItem: (
        product: RetailProduct,
        quantity?: number,
        options?: { openDrawer?: boolean },
    ) => void
    updateQuantity: (sku: string, quantity: number) => void
    removeItem: (sku: string) => void
    clearCart: () => void
    itemCount: () => number
    subtotal: () => number
}

const recalcItem = (product: RetailProduct, quantity: number): CartItem => ({
    product,
    quantity,
    itemTotal: Number((product.basePrice * quantity).toFixed(2)),
})

export const useRetailCartStore = create<RetailCartState>((set, get) => ({
    items: [],
    isDrawerOpen: false,
    openDrawer: () => set({ isDrawerOpen: true }),
    closeDrawer: () => set({ isDrawerOpen: false }),
    setItems: (items) => set({ items }),
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
                            ? recalcItem(product, existing.quantity + qty)
                            : item,
                    ),
                    isDrawerOpen: shouldOpenDrawer
                        ? true
                        : state.isDrawerOpen,
                }
            }
            return {
                items: [...state.items, recalcItem(product, qty)],
                isDrawerOpen: shouldOpenDrawer ? true : state.isDrawerOpen,
            }
        })
    },
    updateQuantity: (sku, quantity) => {
        const qty = Math.max(1, quantity)
        set((state) => ({
            items: state.items.map((item) =>
                item.product.sku === sku
                    ? recalcItem(item.product, qty)
                    : item,
            ),
        }))
    },
    removeItem: (sku) =>
        set((state) => ({
            items: state.items.filter((item) => item.product.sku !== sku),
        })),
    clearCart: () => set({ items: [] }),
    itemCount: () =>
        get().items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: () =>
        Number(
            get()
                .items.reduce((sum, item) => sum + item.itemTotal, 0)
                .toFixed(2),
        ),
}))
