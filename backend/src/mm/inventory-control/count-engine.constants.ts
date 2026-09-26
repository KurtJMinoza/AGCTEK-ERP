export const COUNT_TYPES = [
    'CYCLE_COUNT',
    'PHYSICAL_INVENTORY',
    'BLIND_COUNT',
    'RECOUNT',
] as const

export const COUNT_PLAN_STATUSES = [
    'PLANNED',
    'OPEN',
    'IN_PROGRESS',
    'COUNTED',
    'VARIANCE',
    'RECOUNT_REQUIRED',
    'PENDING_APPROVAL',
    'APPROVED',
    'REJECTED',
    'ADJUSTED',
    'CLOSED',
] as const

export const COUNT_TASK_STATUSES = [
    'PENDING',
    'COUNTED',
    'VARIANCE',
    'RECOUNT_REQUIRED',
    'APPROVED',
    'REJECTED',
    'ADJUSTED',
] as const

export const ADJUSTMENT_REQUEST_STATUSES = [
    'DRAFT',
    'PENDING_APPROVAL',
    'APPROVED',
    'REJECTED',
    'POSTED',
] as const

/** Map canonical session/plan status → legacy MmInventoryCount status */
export function toLegacyCountStatus(status: string): string {
    switch (status) {
        case 'PLANNED':
        case 'OPEN':
            return 'OPEN'
        case 'IN_PROGRESS':
        case 'COUNTED':
            return 'COUNTING'
        case 'VARIANCE':
        case 'RECOUNT_REQUIRED':
            return 'RECOUNT'
        case 'PENDING_APPROVAL':
        case 'APPROVED':
        case 'REJECTED':
            return 'APPROVAL'
        case 'ADJUSTED':
            return 'POSTED'
        case 'CLOSED':
            return 'CLOSED'
        default:
            return status
    }
}

export function toCanonicalCountType(legacy: string): string {
    if (legacy === 'CYCLE') return 'CYCLE_COUNT'
    if (legacy === 'PHYSICAL') return 'PHYSICAL_INVENTORY'
    return legacy
}

export function toLegacyCountType(canonical: string): string {
    if (canonical === 'CYCLE_COUNT' || canonical === 'BLIND_COUNT') return 'CYCLE'
    if (canonical === 'PHYSICAL_INVENTORY') return 'PHYSICAL'
    if (canonical === 'RECOUNT') return 'CYCLE'
    return canonical
}

export type CountType = (typeof COUNT_TYPES)[number]
export type CountPlanStatus = (typeof COUNT_PLAN_STATUSES)[number]
