import {
    EcommerceOrderSchema,
    type EcommerceOrder,
} from '../types/ecommerce.schema'
import { RETAIL_DIVISION_ID } from '@/types/storefront/retail'
import { LPG_DIVISION_ID } from '../catalogs/lpgCatalog'
import { APPLIANCES_DIVISION_ID } from '../catalogs/mconpincoCatalog'
import {
    loadPricingCatalog,
    priceLines,
    roundMoney,
    type PricedLine,
    type SalesDivisionId,
} from './pricingEngine'
import {
    createRetailSalesOrder,
    newIdempotencyKey,
} from './salesOrderDashboardService'

export const ECOMMERCE_FREIGHT_PHP = 150

const PROMO_CODES: Record<SalesDivisionId, Record<string, number>> = {
    [RETAIL_DIVISION_ID]: { AWIC10: 0.1 },
    [LPG_DIVISION_ID]: {},
    [APPLIANCES_DIVISION_ID]: {},
}

export type PricingItem = { sku: string; quantity: number }

export type CartPricing = {
    lines: PricedLine[]
    promoCode: string | null
    subtotal: number
    discountAmount: number
    shipping: number
    grandTotal: number
}

export type EcommerceOrderResult = CartPricing & {
    salesOrderId: string
    status: 'PENDING_DELIVERY'
    message: string
}

/**
 * SD pricing for Lane B — the only place storefront totals are computed:
 * Σ basePrice × quantity → optional promo code → flat freight.
 * Throws on an unknown promo code.
 */
export function calculateCartPricing(
    items: ReadonlyArray<PricingItem>,
    discountCode?: string | null,
    divisionId: SalesDivisionId = RETAIL_DIVISION_ID,
): CartPricing {
    const { lines, subtotal } = priceLines(items, divisionId)

    const code = discountCode?.trim().toUpperCase() || null
    const promoRate = code ? PROMO_CODES[divisionId][code] : undefined
    if (code && promoRate === undefined) {
        throw new Error(`Invalid discount code: ${code}`)
    }
    const discountAmount = roundMoney(subtotal * (promoRate ?? 0))
    const shipping = lines.length > 0 ? ECOMMERCE_FREIGHT_PHP : 0

    return {
        lines,
        promoCode: promoRate === undefined ? null : code,
        subtotal,
        discountAmount,
        shipping,
        grandTotal: roundMoney(subtotal - discountAmount + shipping),
    }
}

/**
 * E-commerce standard flow (Lane B): SD pricing → persisted SD sales order
 * (pending delivery) → MM ATP + soft reservation. No PGI or billing here.
 */
export async function processEcommerceOrder(
    payload: EcommerceOrder,
): Promise<EcommerceOrderResult> {
    const order = EcommerceOrderSchema.parse(payload)
    await loadPricingCatalog(order.divisionId)
    const pricing = calculateCartPricing(
        order.items,
        order.discountCode,
        order.divisionId,
    )

    const saved = await createRetailSalesOrder({
        channel: 'ECOMMERCE',
        idempotencyKey: newIdempotencyKey('web'),
        divisionId: order.divisionId,
        customerId: order.customerId,
        customerName: order.shipping.fullName,
        customerEmail: order.shipping.email,
        lines: pricing.lines,
        subtotal: pricing.subtotal,
        discountAmount: pricing.discountAmount,
        promoCode: pricing.promoCode,
        shippingAmount: pricing.shipping,
        totalAmount: pricing.grandTotal,
    })

    console.info('Triggering MM 2: Availability Check (ATP) & Soft Reservation', {
        salesOrderId: saved.orderId,
        items: saved.lines.map(({ sku, quantity }) => ({ sku, quantity })),
    })
    console.info('Creating Sales Order in SD - Pending Delivery', {
        salesOrderId: saved.orderId,
        customerId: order.customerId,
        grandTotal: saved.totalAmount,
    })

    return {
        lines: saved.lines,
        promoCode: saved.promoCode,
        subtotal: saved.subtotal,
        discountAmount: saved.discountAmount,
        shipping: saved.shipping,
        grandTotal: saved.totalAmount,
        salesOrderId: saved.orderId,
        status: 'PENDING_DELIVERY',
        message: `Sales order ${saved.orderId} created — pending delivery.`,
    }
}
