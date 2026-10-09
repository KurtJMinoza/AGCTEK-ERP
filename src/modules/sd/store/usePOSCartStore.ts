import { create } from 'zustand'
import type { CartItem, RetailProduct } from '@/types/storefront/retail'

export type POSVariant = {
    id: string
    name: string
    sku: string
    unitPrice: number
}

export type POSCartItem = CartItem & {
    itemTotal: number
    variant?: POSVariant | null
}

type POSCartState = {
    items: POSCartItem[]
    addItem: (product: RetailProduct, quantity?: number, variant?: POSVariant) => void
    /** Sets the line quantity; 0 or below removes the line. `key` is the line key. */
    updateQuantity: (key: string, newQuantity: number) => void
    removeItem: (key: string) => void
    /** Resets the terminal after checkout or a voided transaction. */
    clearCart: () => void
    /** Subtotal at line price (variant price when selected), before discounts. */
    getCartTotal: () => number
}

/** Line key: variants of the same product coexist under `sku#variantId`. */
export const posLineKey = (
    item: Pick<POSCartItem, 'product' | 'variant'>,
) =>
    item.variant
        ? `${item.product.sku}#${item.variant.id}`
        : item.product.sku

const toCartItem = (
    product: RetailProduct,
    quantity: number,
    variant?: POSVariant,
): POSCartItem => ({
    product,
    quantity,
    variant: variant ?? null,
    itemTotal: Number(
        ((variant?.unitPrice ?? product.basePrice) * quantity).toFixed(2),
    ),
})

/** Cashier-only cart. Not persisted and not shared with the AWIC storefront cart. */
export const usePOSCartStore = create<POSCartState>((set, get) => ({
    items: [],
    addItem: (product, quantity = 1, variant) => {
        const qty = Math.max(1, quantity)
        const key = posLineKey({ product, variant })
        set((state) => {
            const existing = state.items.find(
                (item) => posLineKey(item) === key,
            )
            if (existing) {
                return {
                    items: state.items.map((item) =>
                        posLineKey(item) === key
                            ? toCartItem(
                                  item.product,
                                  item.quantity + qty,
                                  item.variant ?? undefined,
                              )
                            : item,
                    ),
                }
            }
            return {
                items: [...state.items, toCartItem(product, qty, variant)],
            }
        })
    },
    updateQuantity: (key, newQuantity) =>
        set((state) => ({
            items:
                newQuantity <= 0
                    ? state.items.filter(
                          (item) => posLineKey(item) !== key,
                      )
                    : state.items.map((item) =>
                          posLineKey(item) === key
                              ? toCartItem(
                                    item.product,
                                    Math.floor(newQuantity),
                                    item.variant ?? undefined,
                                )
                              : item,
                      ),
        })),
    removeItem: (key) =>
        set((state) => ({
            items: state.items.filter((item) => posLineKey(item) !== key),
        })),
    clearCart: () => set({ items: [] }),
    getCartTotal: () =>
        Number(
            get()
                .items.reduce((sum, item) => sum + item.itemTotal, 0)
                .toFixed(2),
        ),
}))