export const MM_DOMAIN_EVENTS = {
    GOODS_RECEIPT_POSTED: 'GoodsReceiptPosted',
    GOODS_ISSUE_POSTED: 'GoodsIssuePosted',
    INVENTORY_ADJUSTED: 'InventoryAdjusted',
    INVENTORY_TRANSFERRED: 'InventoryTransferred',
    RESERVATION_CREATED: 'ReservationCreated',
    RESERVATION_RELEASED: 'ReservationReleased',
    QUALITY_DECISION_MADE: 'QualityDecisionMade',
    SUPPLIER_RETURN_POSTED: 'SupplierReturnPosted',
    INVENTORY_TRANSACTION_POSTED: 'InventoryTransactionPosted',
    INVENTORY_TRANSACTION_REVERSED: 'InventoryTransactionReversed',
    STOCK_BELOW_SAFETY_LEVEL: 'StockBelowSafetyLevel',
    PURCHASE_ORDER_OVERDUE: 'PurchaseOrderOverdue',
    RECEIVING_VALIDATED: 'ReceivingValidated',
    RECEIVING_POSTED: 'ReceivingPosted',
    INSPECTION_LOT_CREATED: 'InspectionLotCreated',
    USAGE_DECISION_RECORDED: 'UsageDecisionRecorded',
    PUTAWAY_REQUESTED: 'PutawayRequested',
    SUPPLIER_RETURN_REQUESTED: 'SupplierReturnRequested',
} as const

export type MmDomainEventType =
    (typeof MM_DOMAIN_EVENTS)[keyof typeof MM_DOMAIN_EVENTS]

export type MmDomainEventPayload = {
    eventType: MmDomainEventType | string
    companyId: string
    sourceModule: string
    documentType: string
    documentId: string
    occurredAt: string
    payload: Record<string, unknown>
}
