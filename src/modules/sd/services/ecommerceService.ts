import {
    EcommerceOrderSchema,
    type EcommerceOrder,
    type EcommerceOrderItem,
} from '../types/ecommerce.schema'
import { RETAIL_DIVISION_ID } from '@/types/storefront/retail'
import { LPG_DIVISION_ID } from '../catalogs/lpgCatalog'
import { APPLIANCES_DIVISION_ID } from '../catalogs/mconpincoCatalog'
import {
    SALES_DIVISION_IDS,
    loadPricingCatalog,
    priceLines,
    roundMoney,
    type PricedLine,
    type SalesDivisionId,
} from './pricingEngine'
import {
    createMarketplaceCheckout,
    newIdempotencyKey,
} from './salesOrderDashboardService'

/** Promo codes are issued by one division and only discount that division's items. */
const PROMO_CODES: Record<SalesDivisionId, Record<string, number>> = {
    [RETAIL_DIVISION_ID]: { AWIC10: 0.1 },
    [LPG_DIVISION_ID]: {},
    [APPLIANCES_DIVISION_ID]: {},
}

export type PricingItem = EcommerceOrderItem

/** One seller's share of the cart: its lines, discount and freight. */
export type DivisionCartPricing = {
    divisionId: SalesDivisionId
    lines: PricedLine[]
    promoCode: string | null
    subtotal: number
    discountAmount: number
    shipping: number
    grandTotal: number
}

export type CartPricing = {
    divisions: DivisionCartPricing[]
    promoCode: string | null
    subtotal: number
    discountAmount: number
    shipping: number
    grandTotal: number
}

export type EcommerceOrderResult = CartPricing & {
    checkoutId: string
    /** Business number of the single master sales order (SO-000001). */
    salesOrderId: string
    status: 'PENDING_DELIVERY'
    message: string
}

const sumMoney = (values: number[]) =>
    roundMoney(values.reduce((sum, value) => sum + value, 0))

/**
 * SD pricing for Lane B — the only place storefront totals are computed.
 * Items are grouped by division; per division: Σ price × quantity → promo
 * (when that division issued the code) → flat freight. Throws when the code
 * is not valid for any division in the cart.
 */
export function calculateCartPricing(
    items: ReadonlyArray<PricingItem>,
    discountCode?: string | null,
): CartPricing {
    const code = discountCode?.trim().toUpperCase() || null
    const groups = SALES_DIVISION_IDS.map((divisionId) => ({
        divisionId,
        items: items.filter((item) => item.divisionId === divisionId),
    })).filter((group) => group.items.length > 0)

    if (
        code &&
        !groups.some(
            (group) => PROMO_CODES[group.divisionId][code] !== undefined,
        )
    ) {
        throw new Error(`Invalid discount code: ${code}`)
    }

    const divisions = groups.map<DivisionCartPricing>(
        ({ divisionId, items: groupItems }) => {
            const { lines, subtotal } = priceLines(groupItems, divisionId)
            const promoRate = code ? PROMO_CODES[divisionId][code] : undefined
            const discountAmount = roundMoney(subtotal * (promoRate ?? 0))
            const shipping = ECOMMERCE_FREIGHT_PHP
            return {
                divisionId,
                lines,
                promoCode: promoRate === undefined ? null : code,
                subtotal,
                discountAmount,
                shipping,
                grandTotal: roundMoney(subtotal - discountAmount + shipping),
            }
        },
    )

    return {
        divisions,
        promoCode: divisions.some((d) => d.promoCode) ? code : null,
        subtotal: sumMoney(divisions.map((d) => d.subtotal)),
        discountAmount: sumMoney(divisions.map((d) => d.discountAmount)),
        shipping: sumMoney(divisions.map((d) => d.shipping)),
        grandTotal: sumMoney(divisions.map((d) => d.grandTotal)),
    }
}

/**
 * E-commerce standard flow (Lane B): SD pricing → ONE persisted master SD
 * sales order (pending delivery) whose lines carry their division → MM splits
 * fulfillment, ATP + soft reservation. No PGI or billing here.
 */

/** Flat e-commerce delivery fee per seller (division) in Philippine pesos.
 *  Server-authoritative: the backend re-verifies this rate at checkout so the
 *  storefront can never submit its own freight. Override with env. */
export const ECOMMERCE_FREIGHT_PHP = Number(
    process.env.NEXT_PUBLIC_ECOMMERCE_FREIGHT_PHP ?? 50,
)

export async function processEcommerceOrder(
    payload: EcommerceOrder,
    sessionToken: string,
): Promise<EcommerceOrderResult> {
    const order = EcommerceOrderSchema.parse(payload)
    const divisionIds = [...new Set(order.items.map((item) => item.divisionId))]
    await Promise.all(divisionIds.map(loadPricingCatalog))
    const pricing = calculateCartPricing(order.items, order.discountCode)
    const checkoutId = order.checkoutId ?? newIdempotencyKey('web')
    const { email, ...shippingAddress } = order.shipping

    const saved = await createMarketplaceCheckout({
        checkoutId,
        customerId: order.customerId,
        customerName: shippingAddress.fullName,
        customerEmail: email,
        shippingAddress,
        cartItems: pricing.divisions.flatMap((division) =>
            division.lines.map((line) => ({
                ...line,
                divisionId: division.divisionId,
            })),
        ),
        subtotal: pricing.subtotal,
        discountAmount: pricing.discountAmount,
        promoCode: pricing.promoCode,
        shippingAmount: pricing.shipping,
        totalAmount: pricing.grandTotal,
        paymentMethod: order.paymentMethod,
        paymentProvider: order.paymentProvider,
        cardDemoSimulateFailure: order.cardDemoSimulateFailure,
    }, sessionToken)

    console.info(
        'Triggering MM 2: Availability Check (ATP) & Soft Reservation',
        {
            checkoutId,
            salesOrderId: saved.orderId,
            items: saved.lines.map(({ divisionId, sku, quantity }) => ({
                divisionId,
                sku,
                quantity,
            })),
        },
    )

    return {
        ...pricing,
        grandTotal: saved.totalAmount,
        checkoutId,
        salesOrderId: saved.orderId,
        status: 'PENDING_DELIVERY',
        message: `Sales order ${saved.orderId} created — pending delivery.`,
    }
}
