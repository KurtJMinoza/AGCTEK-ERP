export const INSPECTION_LOT_STATUSES = [
    'CREATED',
    'READY',
    'IN_PROGRESS',
    'COMPLETED',
    'PENDING_DECISION',
    'DECIDED',
    'CLOSED',
    'CANCELLED',
] as const

/** Legacy status aliases accepted during transition */
export const LEGACY_LOT_STATUS_MAP: Record<string, string> = {
    PENDING: 'CREATED',
    COMPLETED: 'DECIDED',
}

export const SAMPLING_TYPES = ['FIXED', 'PERCENTAGE', 'FULL'] as const

export const INSPECTION_RULE_ACTIONS = [
    'NO_INSPECTION',
    'INSPECTION_REQUIRED',
    'FULL_INSPECTION',
    'SAMPLE_INSPECTION',
] as const

export type InspectionRuleAction = (typeof INSPECTION_RULE_ACTIONS)[number]

export const PURCHASE_TYPES = ['PO', 'CONTRACT', 'NON_PO'] as const
export const RECEIPT_TYPES = ['PO', 'ASN', 'DIRECT'] as const

export const USAGE_DECISION_CODES = [
    'ACCEPT',
    'ACCEPT_WITH_DEVIATION',
    'BLOCK',
    'REJECT',
    'REWORK',
    'RETURN',
] as const

export const DECISION_STOCK_TARGETS: Record<string, string> = {
    ACCEPT: 'UNRESTRICTED',
    ACCEPT_WITH_DEVIATION: 'UNRESTRICTED',
    BLOCK: 'BLOCKED',
    REJECT: 'QUARANTINE',
    REWORK: 'BLOCKED',
    RETURN: 'QUARANTINE',
}

export const HOLD_TYPES = ['QUALITY_HOLD', 'QUARANTINE', 'BLOCKED'] as const

export const NC_STATUSES = [
    'OPEN',
    'UNDER_REVIEW',
    'CORRECTIVE_ACTION',
    'RESOLVED',
    'CLOSED',
] as const

export const RESULT_VALUES = ['PASS', 'FAIL', 'NOT_APPLICABLE'] as const

// ── CAPA (Phase 1C) ──

export const CAPA_STATUSES = [
    'OPEN',
    'IN_PROGRESS',
    'COMPLETED',
    'VERIFIED',
    'CLOSED',
] as const

export const CAPA_TRANSITIONS: Record<string, string[]> = {
    OPEN: ['IN_PROGRESS', 'CLOSED'],
    IN_PROGRESS: ['COMPLETED', 'CLOSED'],
    COMPLETED: ['VERIFIED', 'IN_PROGRESS'],
    VERIFIED: ['CLOSED'],
    CLOSED: [],
}

/**
 * Derive effective CAPA status — OVERDUE is API-only (not persisted).
 * A CAPA is overdue when dueDate < now AND status is OPEN or IN_PROGRESS.
 */
export function deriveCapaStatus(persisted: string, dueDate: Date | null | undefined): string {
    if (
        dueDate &&
        (persisted === 'OPEN' || persisted === 'IN_PROGRESS') &&
        dueDate.getTime() < Date.now()
    ) {
        return 'OVERDUE'
    }
    return persisted
}

export function assertCapaTransition(from: string, to: string): void {
    const allowed = CAPA_TRANSITIONS[from] ?? []
    if (!allowed.includes(to)) {
        throw new Error(`Invalid CAPA status transition: ${from} → ${to}`)
    }
}

export const LOT_STATUS_TRANSITIONS: Record<string, string[]> = {
    CREATED: ['READY', 'IN_PROGRESS', 'CANCELLED'],
    READY: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['PENDING_DECISION', 'CANCELLED'],
    PENDING_DECISION: ['DECIDED', 'IN_PROGRESS'],
    DECIDED: ['CLOSED'],
    CLOSED: [],
    CANCELLED: [],
    // legacy aliases
    PENDING: ['READY', 'IN_PROGRESS', 'CANCELLED'],
    COMPLETED: ['CLOSED'],
}

export function normalizeLotStatus(status: string): string {
    return LEGACY_LOT_STATUS_MAP[status] ?? status
}

export function assertLotTransition(from: string, to: string): void {
    const normalized = normalizeLotStatus(from)
    const allowed = LOT_STATUS_TRANSITIONS[normalized] ?? LOT_STATUS_TRANSITIONS[from] ?? []
    if (!allowed.includes(to)) {
        throw new Error(`Invalid lot status transition: ${from} → ${to}`)
    }
}
