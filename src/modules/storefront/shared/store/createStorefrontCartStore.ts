import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type StorefrontCartItem<P> = { product: P; quantity: number }

export type StorefrontCartState<P> = {
    items: StorefrontCartItem<P>[]
    /** Keys of checked items — used for selective checkout and bulk delete. */
    selectedKeys: string[]
    isDrawerOpen: boolean
    openDrawer: () => void
    closeDrawer: () => void
    addItem: (product: P, quantity?: number) => void
    updateQuantity: (key: string, quantity: number) => void
    removeItem: (key: string) => void
    removeItems: (keys: string[]) => void
    clearCart: () => void
    /** Refreshes cart products from the live catalog and drops products no longer sold. */
    syncCatalog: (products: readonly P[]) => void
    toggleSelect: (key: string) => void
    setSelectAll: (select: boolean) => void
}

/**
 * Storefront cart. `keyOf` identifies a product line (e.g. division + SKU,
 * since SKUs are only unique per division). Prices are always recomputed by
 * SD pricing; the stored product is for display only.
 *
 * Items persist in the browser under `storageKey`, so a guest's cart survives
 * reloads and carries over when they sign in or register. Selection is
 * per-session only (not persisted) and is pruned automatically whenever a
 * selected item disappears from the cart.
 */
export const createStorefrontCartStore = <P>(
    keyOf: (product: P) => string,
    storageKey: string,
) =>
    create<StorefrontCartState<P>>()(
        persist(
            (set) => {
                const prune = (
                    selectedKeys: string[],
                    items: StorefrontCartItem<P>[],
                ) => {
                    const valid = new Set(
                        items.map((item) => keyOf(item.product)),
                    )
                    return selectedKeys.filter((key) => valid.has(key))
                }
                return {
                    items: [],
                    selectedKeys: [],
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
                                                    quantity:
                                                        item.quantity +
                                                        quantity,
                                                }
                                              : item,
                                      )
                                    : [...state.items, { product, quantity }],
                            }
                        }),
                    updateQuantity: (key, quantity) =>
                        set((state) => {
                            const newItems =
                                quantity < 1
                                    ? state.items.filter(
                                          (item) =>
                                              keyOf(item.product) !== key,
                                      )
                                    : state.items.map((item) =>
                                          keyOf(item.product) === key
                                              ? { ...item, quantity }
                                              : item,
                                      )
                            return {
                                items: newItems,
                                selectedKeys: prune(
                                    state.selectedKeys,
                                    newItems,
                                ),
                            }
                        }),
                    removeItem: (key) =>
                        set((state) => {
                            const newItems = state.items.filter(
                                (item) => keyOf(item.product) !== key,
                            )
                            return {
                                items: newItems,
                                selectedKeys: prune(
                                    state.selectedKeys,
                                    newItems,
                                ),
                            }
                        }),
                    removeItems: (keys) =>
                        set((state) => {
                            const excluded = new Set(keys)
                            const newItems = state.items.filter(
                                (item) =>
                                    !excluded.has(keyOf(item.product)),
                            )
                            return {
                                items: newItems,
                                selectedKeys: prune(
                                    state.selectedKeys,
                                    newItems,
                                ),
                            }
                        }),
                    clearCart: () => set({ items: [], selectedKeys: [] }),
                    syncCatalog: (products) =>
                        set((state) => {
                            const byKey = new Map(
                                products.map((p) => [keyOf(p), p]),
                            )
                            const unchanged = state.items.every(
                                (item) =>
                                    byKey.get(keyOf(item.product)) ===
                                    item.product,
                            )
                            if (unchanged) return state
                            const newItems = state.items.flatMap((item) => {
                                const product = byKey.get(
                                    keyOf(item.product),
                                )
                                return product
                                    ? [{ ...item, product }]
                                    : []
                            })
                            return {
                                items: newItems,
                                selectedKeys: prune(
                                    state.selectedKeys,
                                    newItems,
                                ),
                            }
                        }),
                    toggleSelect: (key) =>
                        set((state) => ({
                            selectedKeys: state.selectedKeys.includes(key)
                                ? state.selectedKeys.filter((k) => k !== key)
                                : [...state.selectedKeys, key],
                        })),
                    setSelectAll: (select) =>
                        set((state) => ({
                            selectedKeys: select
                                ? state.items.map((item) =>
                                      keyOf(item.product),
                                  )
                                : [],
                        })),
                }
            },
            {
                name: storageKey,
                partialize: (state) => ({ items: state.items }),
            },
        ),
    )