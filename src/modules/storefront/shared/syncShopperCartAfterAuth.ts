import {
    fetchRetailClientCart,
    saveRetailClientCart,
    type RetailClientSession,
} from '@/services/storefront/retailClientService'
import type { StorefrontCartItem } from './store/createStorefrontCartStore'

/**
 * Merges the browser guest cart with the signed-in customer's server cart
 * (same SKU lines combine quantities; guest-only lines are appended).
 */
export async function syncShopperCartAfterAuth<P extends { sku: string }>(
    session: RetailClientSession,
    guestItems: StorefrontCartItem<P>[],
    keyOf: (product: P) => string,
): Promise<StorefrontCartItem<P>[]> {
    if (!guestItems.length) {
        const server = await fetchRetailClientCart(session.token)
        return server as StorefrontCartItem<P>[]
    }

    let server: StorefrontCartItem<P>[] = []
    try {
        server = (await fetchRetailClientCart(
            session.token,
        )) as StorefrontCartItem<P>[]
    } catch {
        server = []
    }

    const merged = new Map<string, StorefrontCartItem<P>>()
    const lineKey = (item: StorefrontCartItem<P>) =>
        item.variant
            ? `${keyOf(item.product)}#${item.variant.variantId}`
            : keyOf(item.product)

    for (const item of server) {
        merged.set(lineKey(item), { ...item })
    }
    for (const item of guestItems) {
        const key = lineKey(item)
        const existing = merged.get(key)
        if (existing) {
            merged.set(key, {
                ...existing,
                quantity: existing.quantity + item.quantity,
            })
        } else {
            merged.set(key, { ...item })
        }
    }

    const items = [...merged.values()]
    await saveRetailClientCart(session.token, items as Parameters<typeof saveRetailClientCart>[1])
    return items
}
