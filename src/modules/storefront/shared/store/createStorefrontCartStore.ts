import { create } from 'zustand'

export type StorefrontCartItem<P> = { product: P; quantity: number }

export type StorefrontCartState<P> = {
    items: StorefrontCartItem<P>[]
    isDrawerOpen: boolean
    openDrawer: () => void
    closeDrawer: () => void
    addItem: (product: P, quantity?: number) => void
    updateQuantity: (key: string, quantity: number) => void
    removeItem: (key: string) => void
    clearCart: () => void
    /** Refreshes cart products from the live catalog and drops products no longer sold. */
    syncCatalog: (products: readonly P[]) => void
}

/**
 * Storefront cart. `keyOf` identifies a product line (e.g. division + SKU,
 * since SKUs are only unique per division). Prices are always recomputed by
 * SD pricing; the stored product is for display only.
 */
export const createStorefrontCartStore = <P>(keyOf: (product: P) => string) =>
    create<StorefrontCartState<P>>((set) => ({
        items: [],
        isDrawerOpen: false,
        openDrawer: () => set({ isDrawerOpen: true }),
        closeDrawer: () => set({ isDrawerOpen: false }),
        addItem: (product, quantity = 1) =>
            set((state) => {
                const key = keyOf(product)
                const existing = state.items.find(
                    (item) => keyOf(item.product) === key,
                )
                return {
                    items: existing
                        ? state.items.map((item) =>
                              keyOf(item.product) === key
                                  ? {
                                        ...item,
                                        quantity: item.quantity + quantity,
                                    }
                                  : item,
                          )
                        : [...state.items, { product, quantity }],
                }
            }),
        updateQuantity: (key, quantity) =>
            set((state) => ({
                items:
                    quantity < 1
                        ? state.items.filter(
                              (item) => keyOf(item.product) !== key,
                          )
                        : state.items.map((item) =>
                              keyOf(item.product) === key
                                  ? { ...item, quantity }
                                  : item,
                          ),
            })),
        removeItem: (key) =>
            set((state) => ({
                items: state.items.filter(
                    (item) => keyOf(item.product) !== key,
                ),
            })),
        clearCart: () => set({ items: [] }),
        syncCatalog: (products) =>
            set((state) => {
                const byKey = new Map(products.map((p) => [keyOf(p), p]))
                const unchanged = state.items.every(
                    (item) => byKey.get(keyOf(item.product)) === item.product,
                )
                if (unchanged) return state
                return {
                    items: state.items.flatMap((item) => {
                        const product = byKey.get(keyOf(item.product))
                        return product ? [{ ...item, product }] : []
                    }),
                }
            }),
    }))
