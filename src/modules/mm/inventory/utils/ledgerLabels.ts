/**
 * Human-readable labels for the inventory ledger.
 *
 * The ledger stores technical codes (`ADJUSTMENT_IN`, `MATERIAL_STOCK_THRESHOLD`,
 * `material-form`). These helpers translate them into language an operations
 * user can read, while the raw value stays available as a tooltip.
 */

export type LedgerTone = 'inbound' | 'outbound' | 'neutral' | 'warning'

/** Movement type → readable label. */
const MOVEMENT_LABELS: Record<string, string> = {
    ADJUSTMENT_IN: 'Adjustment in',
    ADJUSTMENT_OUT: 'Adjustment out',
    COUNT_GAIN: 'Count gain',
    COUNT_LOSS: 'Count loss',
    INVOICE_MATCH: 'Invoice match',
    ISSUE: 'Goods issue',
    ISSUE_REVERSAL: 'Issue reversal',
    LANDED_COST: 'Landed cost',
    PRICE_VARIANCE: 'Price variance',
    RECEIPT: 'Goods receipt',
    RECEIPT_REVERSAL: 'Receipt reversal',
    RETURN_IN: 'Customer return in',
    RETURN_OUT: 'Return out',
    RETURN_OUT_REVERSAL: 'Return reversal',
    REVALUATION: 'Revaluation',
    REVALUATION_REVERSAL: 'Revaluation reversal',
    SCRAP: 'Scrap',
    SCRAP_REVERSAL: 'Scrap reversal',
    STATUS_CHANGE: 'Status change',
    TRANSFER: 'Transfer',
    TRANSFER_IN: 'Transfer in',
    TRANSFER_OUT: 'Transfer out',
}

/** Source document type → readable label. */
const SOURCE_LABELS: Record<string, string> = {
    ADJUSTMENT: 'Stock adjustment',
    BIN_TRANSFER: 'Bin transfer',
    CUSTOMER_RETURN: 'Customer return',
    DAMAGE_IDENTIFY: 'Damage inspection',
    DISPOSAL: 'Disposal',
    DOC: 'Document',
    EXPIRE_MARK: 'Expiry marking',
    EXPIRY_AUTO_BLOCK: 'Expiry control',
    GOODS_ISSUE: 'Goods issue',
    GOODS_RECEIPT: 'Goods receipt',
    IMR: 'Internal movement',
    INSPECTION_LOT: 'Inspection lot',
    INVENTORY_COUNT_ADJUSTMENT: 'Stock count',
    LANDED_COST: 'Landed cost',
    MANUAL: 'Manual entry',
    MATERIAL_STOCK_THRESHOLD: 'Material stock level',
    ORDER: 'Order',
    PACKAGE: 'Package',
    PLANNED_ORDER: 'Planned order',
    PRODUCTION_ORDER: 'Production order',
    PROJECT: 'Project',
    PUTAWAY: 'Put-away',
    QUALITY_INSPECTION: 'Quality inspection',
    SALES_ORDER: 'Sales order',
    SO: 'Sales order',
    STANDARD_COST_REVISION: 'Standard cost change',
    STOCK_TRANSFER_ORDER: 'Stock transfer order',
    STOCK_TRANSFER_RECEIPT: 'Stock transfer receipt',
    STOCK_TRANSFER_SHIPMENT: 'Stock transfer shipment',
    SUPPLIER_RETURN: 'Supplier return',
    TEST_DOC: 'Test document',
    WAREHOUSE_TASK: 'Warehouse task',
    WAREHOUSE_TRANSFER: 'Warehouse transfer',
    WM_TRANSFER: 'Warehouse transfer',
    WORK_ORDER: 'Work order',
}

/** Reason code → readable label. */
const REASON_LABELS: Record<string, string> = {
    CUSTOMER_REFUSED: 'Customer refused delivery',
    CUSTOMER_UNAVAILABLE: 'Customer unavailable',
    DAMAGE: 'Damaged goods',
    DAMAGED: 'Damaged goods',
    ERROR: 'Data entry error',
    EXPIRY: 'Expired stock',
    OTHER: 'Other reason',
    RESTOCK: 'Restock',
    REPACK: 'Repackaging correction',
    REVERSAL: 'Reversal of a previous posting',
    SCRAP: 'Scrapped',
    SHORTAGE: 'Shortage',
    THRESHOLD_EDIT: 'Stock level updated',
    WRONG_ADDRESS: 'Wrong address',
}

/** Actor code → readable label. */
const ACTOR_LABELS: Record<string, string> = {
    system: 'System',
    'material-form': 'Material Master',
    seed: 'Data import',
    'prisma-seed': 'Data import',
}

export const movementLabel = (movementType?: string | null) =>
    (movementType && MOVEMENT_LABELS[movementType]) ||
    movementType?.replace(/_/g, ' ').toLowerCase() ||
    'Movement'

export const sourceLabel = (sourceDocumentType?: string | null) =>
    (sourceDocumentType && SOURCE_LABELS[sourceDocumentType]) ||
    sourceDocumentType?.replace(/_/g, ' ').toLowerCase() ||
    'Direct entry'

export const reasonLabel = (reasonCode?: string | null) =>
    (reasonCode && REASON_LABELS[reasonCode]) ||
    reasonCode?.replace(/_/g, ' ').toLowerCase() ||
    ''

export const actorLabel = (createdBy?: string | null) => {
    if (!createdBy) return 'System'
    if (ACTOR_LABELS[createdBy]) return ACTOR_LABELS[createdBy]
    if (createdBy.startsWith('user:')) return 'ERP user'
    return createdBy
}

/** Inbound / outbound / reversal tone for a movement. */
export const movementTone = (
    movementType?: string | null,
    signedQuantity?: number | string | null,
): LedgerTone => {
    if (movementType?.endsWith('_REVERSAL')) return 'warning'
    const signed = Number(signedQuantity ?? 0)
    if (signed > 0) return 'inbound'
    if (signed < 0) return 'outbound'
    return 'neutral'
}

/** Tail of an id, for the reference chip. */
export const idTail = (id?: string | null, length = 8) =>
    id ? id.slice(-length) : ''

/** Format a signed quantity with its sign. */
export const signedQty = (
    value?: number | string | null,
    fallback?: number | string | null,
) => {
    const n = Number(value ?? fallback ?? 0)
    return n > 0 ? `+${n}` : `${n}`
}
