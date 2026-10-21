export const SD_EVENTS = {
    SALES_ORDER_CONFIRMED: 'SalesOrderConfirmed',
    SALES_ORDER_CANCELLED: 'SalesOrderCancelled',
    SALES_DEMAND_CHANGED: 'SalesDemandChanged',
    /** A customer requested a return on the storefront (CRM opens the case). */
    RETURN_REQUEST_REQUESTED: 'ReturnRequestRequested',
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

export type SdSalesDemandChangedPayload = SdSalesOrderEventPayload & {
    changedLines: Array<{
        lineId: string
        demandReferenceLineId: string
        previousQuantity: string
        newQuantity: string
    }>
}
