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

/** Customer attached to the running sale (walk-in when none is picked). */
export type POSCartCustomer = {
    id: string
    name: string
    accountType: string
}

/** Parked cart of a held sale — the snapshot the terminal owns. */
export type POSCartSnapshot = {
    items: POSCartItem[]
    discountAmount: number
    customer: POSCartCustomer | null
}

type POSCartState = {
    items: POSCartItem[]
    /** Transaction-level discount of the running sale. */
    discountAmount: number
    customer: POSCartCustomer | null
    addItem: (product: RetailProduct, quantity?: number, variant?: POSVariant) => void
    /** Sets the line quantity; 0 or below removes the line. `key` is the line key. */
    updateQuantity: (key: string, newQuantity: number) => void
    removeItem: (key: string) => void
    /** Resets the terminal after checkout or a voided transaction. */
    clearCart: () => void
    /** Subtotal at line price (variant price when selected), before discounts. */
    getCartTotal: () => number
    /** Sets the transaction-level discount of the running sale. */
    setDiscountAmount: (amount: number) => void
    /** Attaches (or clears) the customer of the running sale. */
    setCustomer: (customer: POSCartCustomer | null) => void
    /** Snapshot of the running sale — the payload of a held sale. */
    snapshot: () => POSCartSnapshot
    /** Restores a parked cart (resumed held sale). */
    restore: (snapshot: POSCartSnapshot) => void
}

/** Line key: variants of the same product coexist under `sku#variantId`. */
export const posLineKey = (
    item: Pick<POSCartItem, 'product' | 'variant'>,
) =>
    item.variant
        ? `${item.product.sku}#${item.variant.id}`
        : item.product.sku

/** The server rejects a discount above the cart subtotal. */
const clampDiscount = (discount: number, items: POSCartItem[]) => {
    const subtotal = items.reduce((sum, item) => sum + item.itemTotal, 0)
    return Math.min(Math.max(0, discount), Number(subtotal.toFixed(2)))
}

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
    discountAmount: 0,
    customer: null,
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
        set((state) => {
            const items =
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
                      )
            return {
                items,
                discountAmount: clampDiscount(state.discountAmount, items),
            }
        }),
    removeItem: (key) =>
        set((state) => {
            const items = state.items.filter(
                (item) => posLineKey(item) !== key,
            )
            return {
                items,
                discountAmount: clampDiscount(
                    state.discountAmount,
                    items,
                ),
            }
        }),
    clearCart: () =>
        set({ items: [], discountAmount: 0, customer: null }),
    getCartTotal: () =>
        Number(
            get()
                .items.reduce((sum, item) => sum + item.itemTotal, 0)
                .toFixed(2),
        ),
    setDiscountAmount: (amount) =>
        set((state) => {
            const subtotal = state.items.reduce(
                (sum, item) => sum + item.itemTotal,
                0,
            )
            const value = Number.isFinite(amount) ? amount : 0
            // The server rejects a discount above the cart subtotal.
            return {
                discountAmount: Math.min(
                    Math.max(0, value),
                    Number(subtotal.toFixed(2)),
                ),
            }
        }),
    setCustomer: (customer) => set({ customer }),
    snapshot: () => ({
        items: get().items,
        discountAmount: get().discountAmount,
        customer: get().customer,
    }),
    restore: (snapshot) =>
        set({
            items: snapshot.items ?? [],
            discountAmount: snapshot.discountAmount ?? 0,
            customer: snapshot.customer ?? null,
        }),
}))
