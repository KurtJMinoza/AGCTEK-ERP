import type { MmIntegrationEventEnvelope } from './mm-integration-event.types'

/** Canonical PascalCase event type constants — aligned with MM_EVENT_CATALOG. */
export const MM_DOMAIN_EVENTS = {
    // Master data
    MATERIAL_CREATED: 'MaterialCreated',
    MATERIAL_ACTIVATED: 'MaterialActivated',
    MATERIAL_BLOCKED: 'MaterialBlocked',

    // Supplier
    SUPPLIER_ACTIVATED: 'SupplierActivated',
    SUPPLIER_BLOCKED: 'SupplierBlocked',

    // Procurement
    PURCHASE_REQUISITION_APPROVED: 'PurchaseRequisitionApproved',
    PURCHASE_ORDER_APPROVED: 'PurchaseOrderApproved',
    PURCHASE_ORDER_SENT: 'PurchaseOrderSent',
    PURCHASE_ORDER_CANCELLED: 'PurchaseOrderCancelled',
    PURCHASE_ORDER_OVERDUE: 'PurchaseOrderOverdue',

    // Receiving
    EXPECTED_RECEIPT_CREATED: 'ExpectedReceiptCreated',
    ASN_RECEIVED: 'ASNReceived',
    RECEIVING_VALIDATED: 'ReceivingValidated',
    RECEIVING_POSTED: 'ReceivingPosted',
    RECEIVING_COMPLETED: 'ReceivingCompleted',
    GOODS_RECEIPT_POSTED: 'GoodsReceiptPosted',

    // Quality
    INSPECTION_LOT_CREATED: 'InspectionLotCreated',
    QUALITY_DECISION_MADE: 'QualityDecisionMade',
    USAGE_DECISION_RECORDED: 'UsageDecisionRecorded',
    QUALITY_HOLD_CREATED: 'QualityHoldCreated',
    QUALITY_HOLD_RELEASED: 'QualityHoldReleased',
    QUALITY_ACCEPTED: 'QualityAccepted',
    QUALITY_REJECTED: 'QualityRejected',
    SUPPLIER_QUALITY_INCIDENT: 'SupplierQualityIncident',
    PUTAWAY_REQUESTED: 'PutawayRequested',
    SUPPLIER_RETURN_REQUESTED: 'SupplierReturnRequested',

    // Inventory
    GOODS_ISSUE_POSTED: 'GoodsIssuePosted',
    INVENTORY_TRANSACTION_POSTED: 'InventoryTransactionPosted',
    INVENTORY_TRANSACTION_REVERSED: 'InventoryTransactionReversed',
    INVENTORY_ADJUSTED: 'InventoryAdjusted',
    INVENTORY_TRANSFERRED: 'InventoryTransferred',
    STOCK_STATUS_CHANGED: 'StockStatusChanged',

    // Reservation / allocation
    RESERVATION_CREATED: 'ReservationCreated',
    RESERVATION_RELEASED: 'ReservationReleased',
    ALLOCATION_CREATED: 'AllocationCreated',
    ALLOCATION_RELEASED: 'AllocationReleased',

    // Warehouse
    PUTAWAY_COMPLETED: 'PutawayCompleted',
    PICKING_COMPLETED: 'PickingCompleted',
    PACKING_COMPLETED: 'PackingCompleted',

    // Returns
    SUPPLIER_RETURN_POSTED: 'SupplierReturnPosted',
    SUPPLIER_RETURN_REVERSED: 'SupplierReturnReversed',
    CUSTOMER_RETURN_POSTED: 'CustomerReturnPosted',
    DISPOSAL_POSTED: 'DisposalPosted',
    SCRAP_POSTED: 'ScrapPosted',
    DISPOSAL_REVERSED: 'DisposalReversed',

    // Valuation
    INVENTORY_VALUATION_UPDATED: 'InventoryValuationUpdated',
    INVENTORY_REVALUATION_POSTED: 'InventoryRevaluationPosted',
    INVENTORY_VALUATION_REVERSED: 'InventoryValuationReversed',
    LANDED_COST_ALLOCATED: 'LandedCostAllocated',
    PRICE_VARIANCE_POSTED: 'PriceVariancePosted',

    // Reversals
    GOODS_RECEIPT_REVERSED: 'GoodsReceiptReversed',
    GOODS_ISSUE_REVERSED: 'GoodsIssueReversed',

    // Planning
    MRP_COMPLETED: 'MRPCompleted',
    MRP_SHORTAGE_DETECTED: 'MRPShortageDetected',
    PROCUREMENT_SUGGESTION_CREATED: 'ProcurementSuggestionCreated',
    STOCK_BELOW_SAFETY_LEVEL: 'StockBelowSafetyLevel',
    SHORTAGE_DETECTED: 'ShortageDetected',
} as const

export type MmDomainEventType =
    (typeof MM_DOMAIN_EVENTS)[keyof typeof MM_DOMAIN_EVENTS]

/** Legacy envelope — prefer MmIntegrationEventEnvelope for new integrations. */
export type MmDomainEventPayload = {
    eventType: MmDomainEventType | string
    companyId: string
    sourceModule: string
    documentType: string
    documentId: string
    occurredAt: string
    payload: Record<string, unknown>
}

/** In-process bus catch-all and integration envelope channel. */
export type MmIntegrationEventBusPayload = MmIntegrationEventEnvelope
