/**
 * Cash on Delivery collection state for a set of sales orders (e.g. the orders
 * dropped at one trip stop). Read model over `SdSalesOrderPayment` — the
 * payment record stays the single owner of payment status.
 *
 *   Pending Collection --driver Cash Received--> Paid
 */
export const COD_PENDING_STATUS = 'Pending Collection'
export const COD_COLLECTED_STATUS = 'Paid'

export type CodCollectionStatus = 'PENDING' | 'COLLECTED' | 'NOT_COLLECTIBLE'

export type CodOrderState = {
    salesOrderId: string
    orderNumber: string
    orderStatus: string
    paymentStatus: string | null
    /** Payment record amount; null when the order has no payment record. */
    amount: number | null
    currency: string
    paidAt: Date | null
}

export type CodCollectionSummary = {
    paymentMethod: 'COD'
    status: CodCollectionStatus
    currency: string
    /** Outstanding cash (Pending Collection orders); null when an amount is missing. */
    amountDue: number | null
    amountCollected: number
    collectedAt: Date | null
    orders: CodOrderState[]
}

export type CodCollectionResult = CodCollectionSummary & {
    /** Null on an idempotent replay (already collected). */
    amountReceived: number | null
    change: number | null
    /** Orders this request moved to Paid (empty on replay). */
    collectedOrderIds: string[]
}

export const toCents = (value: number) => Math.round(value * 100)
export const fromCents = (cents: number) => cents / 100

/** Null when none of the orders is Cash on Delivery. */
export function summarizeCodCollection(orders: CodOrderState[]): CodCollectionSummary | null {
    if (!orders.length) return null
    const pending = orders.filter((o) => o.paymentStatus === COD_PENDING_STATUS)
    const collected = orders.filter((o) => o.paymentStatus === COD_COLLECTED_STATUS)
    const status: CodCollectionStatus = pending.length
        ? 'PENDING'
        : collected.length === orders.length
          ? 'COLLECTED'
          : 'NOT_COLLECTIBLE'
    const sum = (rows: CodOrderState[]) =>
        fromCents(rows.reduce((total, o) => total + toCents(o.amount ?? 0), 0))
    const paidTimes = collected
        .map((o) => o.paidAt?.getTime())
        .filter((t): t is number => t != null)
    return {
        paymentMethod: 'COD',
        status,
        currency: orders[0].currency,
        amountDue: pending.some((o) => o.amount == null || o.amount <= 0) ? null : sum(pending),
        amountCollected: sum(collected),
        collectedAt:
            status === 'COLLECTED' && paidTimes.length ? new Date(Math.max(...paidTimes)) : null,
        orders,
    }
}
