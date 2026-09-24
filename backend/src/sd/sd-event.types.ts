export const SD_EVENTS = {
    SALES_ORDER_CONFIRMED: 'SalesOrderConfirmed',
    SALES_ORDER_CANCELLED: 'SalesOrderCancelled',
    SALES_DEMAND_CHANGED: 'SalesDemandChanged',
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
    companyId: string
    warehouseId: string
    customerId: string
    correlationId: string
    idempotencyKey?: string | null
    lines: SdSalesOrderLinePayload[]
}

export type SdSalesDemandChangedPayload = SdSalesOrderEventPayload & {
    changedLines: Array<{
        lineId: string
        demandReferenceLineId: string
        previousQuantity: string
        newQuantity: string
    }>
}
