import { DIVISION_ORDER, isDivisionId, productKey } from './catalog'
import type { CartPricing, DivisionId, Product, StoreCartPricing } from './types'

/**
 * Mirrors `calculateCartPricing` in the web marketplace
 * (src/modules/sd/services/ecommerceService.ts). The checkout API re-checks
 * unit prices and totals but not these rules, so keep both in sync.
 */
export const DELIVERY_FEE_PHP = 150

/** Promo codes are issued by one store and only discount that store's items. */
const PROMO_CODES: Record<DivisionId, Record<string, number>> = {
    DIV_RETAIL: { AWIC10: 0.1 },
    DIV_LPG: {},
    DIV_APPLIANCES: {},
}

const round2 = (value: number) => Math.round(value * 100) / 100

export type PricingItem = { divisionId: string; sku: string; quantity: number }

export class PricingError extends Error {}

/** Prices the cart per store from the live catalogue; throws on an invalid promo code or unknown item. */
export function calculateCartPricing(
    items: PricingItem[],
    catalogue: Map<string, Product>,
    discountCode?: string | null,
): CartPricing {
    const code = discountCode?.trim().toUpperCase() || null
    const stores: StoreCartPricing[] = []

    for (const divisionId of DIVISION_ORDER) {
        const storeItems = items.filter((item) => item.divisionId === divisionId)
        if (storeItems.length === 0) continue
        const lines = storeItems.map((item) => {
            const product = catalogue.get(productKey(item))
            if (!product) {
                throw new PricingError(
                    `${item.sku} is no longer available. Remove it from your cart.`,
                )
            }
            return {
                sku: product.sku,
                name: product.name,
                quantity: item.quantity,
                unitPrice: product.price,
                lineTotal: round2(product.price * item.quantity),
            }
        })
        const subtotal = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0))
        const rate = code ? PROMO_CODES[divisionId][code] : undefined
        const discountAmount = rate ? round2(subtotal * rate) : 0
        stores.push({
            divisionId,
            lines,
            promoCode: rate ? code : null,
            subtotal,
            discountAmount,
            shipping: DELIVERY_FEE_PHP,
            grandTotal: round2(subtotal - discountAmount + DELIVERY_FEE_PHP),
        })
    }

    const unknown = items.find((item) => !isDivisionId(item.divisionId))
    if (unknown) throw new PricingError(`${unknown.sku} cannot be sold here.`)

    if (code && !stores.some((store) => store.promoCode)) {
        throw new PricingError(`Invalid discount code: ${code}`)
    }

    const sum = (pick: (store: StoreCartPricing) => number) =>
        round2(stores.reduce((total, store) => total + pick(store), 0))

    return {
        stores,
        promoCode: stores.some((store) => store.promoCode) ? code : null,
        subtotal: sum((s) => s.subtotal),
        discountAmount: sum((s) => s.discountAmount),
        shipping: sum((s) => s.shipping),
        grandTotal: sum((s) => s.grandTotal),
    }
}
