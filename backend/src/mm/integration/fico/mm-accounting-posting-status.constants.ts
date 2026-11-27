/** Phase 04 — MM document accounting posting display states (physical ≠ financial). */
export const MM_ACCOUNTING_POSTING_DISPLAY_STATES = [
    'NOT_FINANCIALLY_RELEVANT',
    'PENDING_ACCOUNTING',
    'ACCOUNTING_PROCESSING',
    'ACCOUNTING_POSTED',
    'ACCOUNTING_FAILED',
    'ACCOUNTING_REVERSED',
] as const

export type MmAccountingPostingDisplayState =
    (typeof MM_ACCOUNTING_POSTING_DISPLAY_STATES)[number]

export function mmAccountingDisplayFromEventStatus(
    eventStatus: string,
    outcomeReason?: string | null,
    lastErrorCode?: string | null,
): MmAccountingPostingDisplayState {
    const status = eventStatus.toUpperCase()
    if (status === 'SKIPPED') {
        if (lastErrorCode === 'NON_FINANCIAL' || outcomeReason?.includes('non-financial')) {
            return 'NOT_FINANCIALLY_RELEVANT'
        }
        return 'NOT_FINANCIALLY_RELEVANT'
    }
    if (status === 'CONSUMED') return 'ACCOUNTING_POSTED'
    if (status === 'PROCESSING') return 'ACCOUNTING_PROCESSING'
    if (status === 'PENDING' || status === 'RETRY_SCHEDULED') {
        return 'PENDING_ACCOUNTING'
    }
    if (status === 'FAILED' || status === 'DEAD_LETTER') {
        return 'ACCOUNTING_FAILED'
    }
    return 'PENDING_ACCOUNTING'
}