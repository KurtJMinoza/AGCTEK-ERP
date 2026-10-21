import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Variant details attached to a cart line when adding a variant product. */
export type CartVariantInfo = {
    variantId: string
    variantName: string
    variantSku: string
    materialId?: string
    unitPrice?: number
    companyId?: string
    /** Selected option values for display, e.g. ["Black", "Medium"]. */
    optionValues?: string[]
}

export type StorefrontCartItem<P> = {
    product: P
    quantity: number
    /** When set, this cart line refers to a specific variant (not the parent product). */
    variant?: CartVariantInfo
}

export type StorefrontCartState<P> = {
    items: StorefrontCartItem<P>[]
    /** Keys of checked items — used for selective checkout and bulk delete. */
    selectedKeys: string[]
    isDrawerOpen: boolean
    openDrawer: () => void
    closeDrawer: () => void
    addItem: (product: P, quantity?: number, variant?: CartVariantInfo) => void
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
 * Cart-line key of an item. The key is variant-aware: the same parent product
 * with two different variants occupies two cart lines with two different keys.
 *
 * Consumers MUST use this key (not the bare product key) when filtering or
 * selecting cart lines — otherwise a variant line can never be selected.
 */
export const storefrontCartItemKey = <P,>(
    item: StorefrontCartItem<P>,
    keyOf: (product: P) => string,
): string =>
    item.variant
        ? `${keyOf(item.product)}#${item.variant.variantId}`
        : keyOf(item.product)

/**
 * Storefront cart. `keyOf` identifies a product line (e.g. division + SKU,
 * since SKUs are only unique per division). When a variant is present, the key
 * is extended with `#variantId` so the same parent product with different
 * variants occupies separate cart lines.
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
                const itemKey = (item: StorefrontCartItem<P>) =>
                    storefrontCartItemKey(item, keyOf)

                const prune = (
                    selectedKeys: string[],
                    items: StorefrontCartItem<P>[],
                ) => {
                    const valid = new Set(items.map(itemKey))
                    return selectedKeys.filter((key) => valid.has(key))
                }
                return {
                    items: [],
                    selectedKeys: [],
                    isDrawerOpen: false,
                    openDrawer: () => set({ isDrawerOpen: true }),
                    closeDrawer: () => set({ isDrawerOpen: false }),
                    addItem: (product, quantity = 1, variant) =>
                        set((state) => {
                            const candidateKey = variant
                                ? `${keyOf(product)}#${variant.variantId}`
                                : keyOf(product)
                            const existing = state.items.find(
                                (item) => itemKey(item) === candidateKey,
                            )
                            return {
                                items: existing
                                    ? state.items.map((item) =>
                                          itemKey(item) === candidateKey
                                              ? {
                                                    ...item,
                                                    quantity:
                                                        item.quantity +
                                                        quantity,
                                                }
                                              : item,
                                      )
                                    : [...state.items, { product, quantity, variant }],
                            }
                        }),
                    updateQuantity: (key, quantity) =>
                        set((state) => {
                            const newItems =
                                quantity < 1
                                    ? state.items.filter(
                                          (item) =>
                                              itemKey(item) !== key,
                                      )
                                    : state.items.map((item) =>
                                          itemKey(item) === key
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
                                (item) => itemKey(item) !== key,
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
                                    !excluded.has(itemKey(item)),
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
                                ? state.items.map(itemKey)
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