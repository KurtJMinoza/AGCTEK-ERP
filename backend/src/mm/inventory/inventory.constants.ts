export const MM_STOCK_STATUSES = [
    'UNRESTRICTED',
    'QUALITY_INSPECTION',
    'BLOCKED',
    'QUARANTINE',
    'IN_TRANSIT',
    'EXPIRED',
    'DAMAGED',
] as const

export type MmStockStatus = (typeof MM_STOCK_STATUSES)[number]

/** Statuses excluded from unrestricted ATP. */
export const RESTRICTED_STOCK_STATUSES = new Set<MmStockStatus>([
    'QUALITY_INSPECTION',
    'BLOCKED',
    'QUARANTINE',
    'IN_TRANSIT',
    'EXPIRED',
    'DAMAGED',
])

export const MM_MOVEMENT_TYPES = [
    'RECEIPT',
    'ISSUE',
    'TRANSFER_OUT',
    'TRANSFER_IN',
    'COUNT_GAIN',
    'COUNT_LOSS',
    'RETURN_OUT',
    'RETURN_IN',
    'SCRAP',
    'ADJUSTMENT_IN',
    'ADJUSTMENT_OUT',
    'STATUS_CHANGE',
] as const

export type MmMovementType = (typeof MM_MOVEMENT_TYPES)[number]

export const MOVEMENT_DIRECTION: Record<string, 1 | -1 | 0> = {
    RECEIPT: 1,
    ISSUE: -1,
    TRANSFER_IN: 1,
    TRANSFER_OUT: -1,
    ADJUSTMENT_IN: 1,
    ADJUSTMENT_OUT: -1,
    RETURN_IN: 1,
    RETURN_OUT: -1,
    SCRAP: -1,
    COUNT_GAIN: 1,
    COUNT_LOSS: -1,
    STATUS_CHANGE: 0,
}

/** Allowed status transitions for STATUS_CHANGE (from → to). */
export const ALLOWED_STATUS_TRANSITIONS: Record<string, Set<string>> = {
    QUALITY_INSPECTION: new Set(['UNRESTRICTED', 'BLOCKED', 'QUARANTINE', 'SCRAP']),
    BLOCKED: new Set(['UNRESTRICTED', 'QUARANTINE', 'SCRAP', 'DAMAGED']),
    QUARANTINE: new Set(['UNRESTRICTED', 'BLOCKED', 'SCRAP']),
    UNRESTRICTED: new Set(['QUALITY_INSPECTION', 'BLOCKED', 'QUARANTINE', 'IN_TRANSIT']),
    IN_TRANSIT: new Set(['UNRESTRICTED', 'QUALITY_INSPECTION', 'BLOCKED']),
    EXPIRED: new Set(['SCRAP', 'BLOCKED']),
    DAMAGED: new Set(['SCRAP', 'BLOCKED']),
}
