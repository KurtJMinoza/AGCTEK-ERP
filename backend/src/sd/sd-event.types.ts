export const SD_EVENTS = {
    SALES_ORDER_CONFIRMED: 'SalesOrderConfirmed',
    SALES_ORDER_CANCELLED: 'SalesOrderCancelled',
    SALES_DEMAND_CHANGED: 'SalesDemandChanged',
    /** A customer requested a return on the storefront (CRM opens the case). */
    RETURN_REQUEST_REQUESTED: 'ReturnRequestRequested',
    /**
     * A customer sales invoice was settled (ISSUED → PAID). CRM loyalty earns on it until FICO
     * publishes receivable clearance.
     */
    SALES_INVOICE_PAID: 'SalesInvoicePaid',
    /** A POS sale was completed: tenders captured and stock issued. */
    POS_SALE_COMPLETED: 'PosSaleCompleted',
    /** A POS sale was voided: the stock returned and the tenders cancelled. */
    POS_SALE_VOIDED: 'PosSaleVoided',
    /** A subsequent payment was collected against an outstanding POS receivable. */
    POS_COLLECTION_COMPLETED: 'PosCollectionCompleted',
    /**
     * An SD sales-return refund was marked PAID. FICO posts the commercial
     * reversal (Dr Revenue ± VAT / Cr Cash or AR). Inventory/COGS stays on the
     * MM restock path.
     */
    RETURN_REFUND_PAID: 'ReturnRefundPaid',
} as const

export type SdEventType = (typeof SD_EVENTS)[keyof typeof SD_EVENTS]

export type SdSalesOrderLinePayload = {
    lineId: string
    lineNumber: number
    materialId: string
    quantity: string
    demandReferenceLineId: string
}

export type SdSalesOrderEventPayload = {
    salesOrderId: string
    orderNumber: string
    channel: string
    companyId: string
    warehouseId: string
    customerId: string
    correlationId: string
    idempotencyKey?: string | null
    /** Deterministic key for an explicit idempotent fulfillment repair. */
    fulfillmentRepairKey?: string
    lines: SdSalesOrderLinePayload[]
    /**
     * A marketplace order can be fulfilled from more than one warehouse. The
     * parent event stays one SalesOrderConfirmed message (one consumer receipt)
     * while each segment carries the exact warehouse and line set to reserve.
     */
    fulfillments?: Array<
        Omit<SdSalesOrderEventPayload, 'fulfillments'> & {
            fulfillmentId: string
        }
    >
}

export type SdReturnRequestRequestedPayload = {
    returnRequestId: string
    requestNumber: string
    salesOrderId: string
    orderNumber: string
    preferredResolution: string | null
    /** The return id: one outbox row per return. */
    idempotencyKey: string
}

export type SdSalesInvoicePaidPayload = {
    salesInvoiceId: string
    invoiceNumber: string
    salesOrderId: string
    /** The order's customer id (Customer Master or storefront shop account). */
    customerId: string
    companyId: string
    currency: string
    /** Decimal string. */
    totalAmount: string
    paidAt: string
    /** The invoice id: one outbox row per invoice. */
    idempotencyKey: string
}

/** Emitted when an SD refund transitions APPROVED → PAID (Phase 2 FICO leg). */
export type SdReturnRefundPaidPayload = {
    companyId: string
    returnRequestId: string
    requestNumber: string
    refundId: string
    refundNumber: string
    salesOrderId: string
    orderNumber: string
    invoiceNumber?: string | null
    customerId: string
    currency: string
    /** Gross refund amount (decimal string). */
    refundAmount: string
    /** Proportional VAT portion of the refund (decimal string). */
    taxAmount?: string
    refundMethod?: string | null
    paymentMethod?: string | null
    paidAt: string
    paidBy?: string | null
    /** Stable: `sd-return-refund:{refundId}`. */
    idempotencyKey: string
}

export type SdSalesDemandChangedPayload = SdSalesOrderEventPayload & {
    changedLines: Array<{
        lineId: string
        demandReferenceLineId: string
        previousQuantity: string
        newQuantity: string
    }>
}
