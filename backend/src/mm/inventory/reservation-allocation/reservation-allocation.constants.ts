export const RESERVATION_STATUSES = [
    'DRAFT',
    'RESERVED',
    'PARTIALLY_ALLOCATED',
    'ALLOCATED',
    'PICKING',
    'PARTIALLY_PICKED',
    'FULLY_PICKED',
    'ISSUED',
    'RELEASED',
    'CANCELLED',
    'EXPIRED',
    'SHORT',
] as const

export const ALLOCATION_STRATEGIES = [
    'FIFO',
    'FEFO',
    'BIN_PRIORITY',
    'FIXED_BIN',
    'CUSTOM',
] as const

export const ALLOCATION_STATUSES = ['ACTIVE', 'RELEASED', 'PICKING', 'COMPLETED'] as const

export const ACTIVE_RESERVATION_STATUSES = new Set([
    'RESERVED',
    'PARTIALLY_ALLOCATED',
    'ALLOCATED',
    'PICKING',
    'PARTIALLY_PICKED',
    'FULLY_PICKED',
])

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number]
export type AllocationStrategy = (typeof ALLOCATION_STRATEGIES)[number]
