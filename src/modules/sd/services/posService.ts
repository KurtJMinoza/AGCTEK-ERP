import { POSOrderSchema, type POSOrder } from '../types/pos.schema'
import { RETAIL_DIVISION_ID } from '@/types/storefront/retail'
import {
    loadPricingCatalog,
    priceLines,
    type PricedLine,
} from './pricingEngine'
import {
    createRetailSalesOrder,
    newIdempotencyKey,
} from './salesOrderDashboardService'

export type POSCheckoutLine = PricedLine

export type POSCheckoutResult = {
    receiptId: string
    branchId: string
    completedAt: string
    lines: POSCheckoutLine[]
    subtotal: number
    orderTotal: number
    paymentReceived: number
    change: number
}

/**
 * POS fast-track checkout (Lane A): SD pricing → persisted SD order
 * (COMPLETED) → MM immediate PGI → FICO cash-sale billing. The receipt uses the
 * totals and document number returned by the SD backend.
 */
export async function processPOSCheckout(
    payload: POSOrder,
): Promise<POSCheckoutResult> {
    const order = POSOrderSchema.parse(payload)
    await loadPricingCatalog(RETAIL_DIVISION_ID)
    const { lines, subtotal } = priceLines(order.items, RETAIL_DIVISION_ID)

    if (order.paymentReceived < subtotal) {
        throw new Error(
            `Insufficient payment: received ${order.paymentReceived}, due ${subtotal}`,
        )
    }

    const saved = await createRetailSalesOrder({
        channel: 'POS',
        idempotencyKey: newIdempotencyKey('pos'),
        divisionId: RETAIL_DIVISION_ID,
        branchId: order.branchId,
        customerId: 'WALK-IN',
        customerName: 'Walk-in customer',
        lines,
        subtotal,
        discountAmount: 0,
        shippingAmount: 0,
        totalAmount: subtotal,
        paymentReceived: order.paymentReceived,
    })

    console.info('Triggering MM 1B: Immediate PGI Stock Deduction', {
        receiptId: saved.orderId,
        items: saved.lines.map(({ sku, quantity }) => ({ sku, quantity })),
    })
    console.info('Triggering FICO 5B: Instant Cash-Sale Billing', {
        receiptId: saved.orderId,
        orderTotal: saved.totalAmount,
    })

    return {
        receiptId: saved.orderId,
        branchId: saved.branchId ?? order.branchId,
        completedAt: saved.createdAt,
        lines: saved.lines,
        subtotal: saved.subtotal,
        orderTotal: saved.totalAmount,
        paymentReceived: saved.paymentReceived ?? order.paymentReceived,
        change: saved.change ?? 0,
    }
}
