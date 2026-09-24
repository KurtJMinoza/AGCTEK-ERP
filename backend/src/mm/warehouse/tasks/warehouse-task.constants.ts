export const WAREHOUSE_TASK_TYPES = [
    'PUTAWAY',
    'PICK',
    'TRANSFER',
    'REPLENISHMENT',
    'RELOCATION',
    'COUNT',
] as const

export type WarehouseTaskType = (typeof WAREHOUSE_TASK_TYPES)[number]

export const WAREHOUSE_TASK_STATUSES = [
    'PENDING',
    'ASSIGNED',
    'IN_PROGRESS',
    'PARTIALLY_COMPLETED',
    'COMPLETED',
    'CANCELLED',
    'EXCEPTION',
] as const

export type WarehouseTaskStatus = (typeof WAREHOUSE_TASK_STATUSES)[number]

export const WAREHOUSE_EXCEPTION_CODES = [
    'INSUFFICIENT_STOCK',
    'WRONG_BIN',
    'WRONG_MATERIAL',
    'WRONG_BATCH',
    'WRONG_SERIAL',
    'DAMAGED_STOCK',
    'QUANTITY_MISMATCH',
    'BLOCKED_LOCATION',
] as const

export type WarehouseExceptionCode = (typeof WAREHOUSE_EXCEPTION_CODES)[number]

export const ACTIVE_TASK_STATUSES: WarehouseTaskStatus[] = [
    'PENDING',
    'ASSIGNED',
    'IN_PROGRESS',
    'PARTIALLY_COMPLETED',
]
