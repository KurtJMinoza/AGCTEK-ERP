import { create } from 'zustand'

export type StorefrontCartItem<P> = { product: P; quantity: number }

export type StorefrontCartState<P> = {
    items: StorefrontCartItem<P>[]
    isDrawerOpen: boolean
    openDrawer: () => void
    closeDrawer: () => void
    addItem: (product: P, quantity?: number) => void
    updateQuantity: (sku: string, quantity: number) => void
    removeItem: (sku: string) => void
    clearCart: () => void
    /** Refreshes cart products from the live catalog and drops SKUs no longer sold. */
    syncCatalog: (products: readonly P[]) => void
}

/** One cart per storefront, so division carts never mix. Prices are always recomputed by SD pricing. */
export const createStorefrontCartStore = <P extends { sku: string }>() =>
    create<StorefrontCartState<P>>((set) => ({
        items: [],
        isDrawerOpen: false,
        openDrawer: () => set({ isDrawerOpen: true }),
        closeDrawer: () => set({ isDrawerOpen: false }),
        addItem: (product, quantity = 1) =>
            set((state) => {
                const existing = state.items.find(
                    (item) => item.product.sku === product.sku,
                )
                return {
                    items: existing
                        ? state.items.map((item) =>
                              item.product.sku === product.sku
                                  ? { ...item, quantity: item.quantity + quantity }
                                  : item,
                          )
                        : [...state.items, { product, quantity }],
                }
            }),
        updateQuantity: (sku, quantity) =>
            set((state) => ({
                items:
                    quantity < 1
                        ? state.items.filter((item) => item.product.sku !== sku)
                        : state.items.map((item) =>
                              item.product.sku === sku ? { ...item, quantity } : item,
                          ),
            })),
        removeItem: (sku) =>
            set((state) => ({
                items: state.items.filter((item) => item.product.sku !== sku),
            })),
        clearCart: () => set({ items: [] }),
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
