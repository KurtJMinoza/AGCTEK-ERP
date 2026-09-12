export const STO_TRANSFER_TYPES = [
    'BIN_TO_BIN',
    'WAREHOUSE_TO_WAREHOUSE',
    'BRANCH_TO_BRANCH',
    'PLANT_TO_PLANT',
] as const

export const STO_STATUSES = [
    'DRAFT',
    'SUBMITTED',
    'PENDING_APPROVAL',
    'APPROVED',
    'ALLOCATED',
    'PICKING',
    'DISPATCHED',
    'IN_TRANSIT',
    'PARTIALLY_RECEIVED',
    'FULLY_RECEIVED',
    'CANCELLED',
    'CLOSED',
] as const

export const STO_LINE_STATUSES = [
    'PENDING',
    'ALLOCATED',
    'DISPATCHED',
    'PARTIALLY_RECEIVED',
    'RECEIVED',
] as const

export const PRE_DISPATCH_STATUSES = new Set([
    'DRAFT',
    'SUBMITTED',
    'PENDING_APPROVAL',
    'APPROVED',
    'ALLOCATED',
    'PICKING',
])

export const DISPATCHABLE_STATUSES = new Set(['ALLOCATED', 'PICKING'])
export const RECEIVABLE_STATUSES = new Set(['DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED'])

export type StoTransferType = (typeof STO_TRANSFER_TYPES)[number]
export type StoStatus = (typeof STO_STATUSES)[number]
