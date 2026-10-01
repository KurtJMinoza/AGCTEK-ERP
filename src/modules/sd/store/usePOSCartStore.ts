import { create } from 'zustand'
import type { CartItem, RetailProduct } from '@/types/storefront/retail'

export type POSCartItem = CartItem & { itemTotal: number }

type POSCartState = {
    items: POSCartItem[]
    addItem: (product: RetailProduct, quantity?: number) => void
    /** Sets the line quantity; 0 or below removes the line. */
    updateQuantity: (sku: string, newQuantity: number) => void
    removeItem: (sku: string) => void
    /** Resets the terminal after checkout or a voided transaction. */
    clearCart: () => void
    /** Subtotal at base price (price × quantity), before discounts. */
    getCartTotal: () => number
}

const toCartItem = (product: RetailProduct, quantity: number): POSCartItem => ({
    product,
    quantity,
    itemTotal: Number((product.basePrice * quantity).toFixed(2)),
})

/** Cashier-only cart. Not persisted and not shared with the AWIC storefront cart. */
export const usePOSCartStore = create<POSCartState>((set, get) => ({
    items: [],
    addItem: (product, quantity = 1) => {
        const qty = Math.max(1, quantity)
        set((state) => {
            const existing = state.items.find(
                (item) => item.product.sku === product.sku,
            )
            if (existing) {
                return {
                    items: state.items.map((item) =>
                        item.product.sku === product.sku
                            ? toCartItem(product, item.quantity + qty)
                            : item,
                    ),
                }
            }
            return { items: [...state.items, toCartItem(product, qty)] }
        })
    },
    updateQuantity: (sku, newQuantity) =>
        set((state) => ({
            items:
                newQuantity <= 0
                    ? state.items.filter((item) => item.product.sku !== sku)
                    : state.items.map((item) =>
                          item.product.sku === sku
                              ? toCartItem(item.product, Math.floor(newQuantity))
                              : item,
                      ),
        })),
    removeItem: (sku) =>
        set((state) => ({
            items: state.items.filter((item) => item.product.sku !== sku),
        })),
    clearCart: () => set({ items: [] }),
    getCartTotal: () =>
        Number(
            get()
                .items.reduce((sum, item) => sum + item.itemTotal, 0)
                .toFixed(2),
        ),
}))
