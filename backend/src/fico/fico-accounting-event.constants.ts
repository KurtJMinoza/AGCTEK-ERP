export const FICO_ACCOUNTING_EVENT_STATUSES = [
    'PENDING',
    'PROCESSING',
    'CONSUMED',
    'FAILED',
    'SKIPPED',
] as const

export type FicoAccountingEventStatus =
    (typeof FICO_ACCOUNTING_EVENT_STATUSES)[number]

/** Abandoned PROCESSING rows older than this are eligible for reclaim. */
export const FICO_ACCOUNTING_PROCESSING_STALE_MS = 5 * 60 * 1000

export const FICO_ACCOUNTING_MAX_ATTEMPTS = 8

export const FICO_ACCOUNTING_ERROR_CODES = {
    NON_FINANCIAL: 'NON_FINANCIAL',
    VALIDATION: 'VALIDATION',
    DETERMINATION: 'DETERMINATION',
    PERIOD: 'PERIOD',
    CONFLICT: 'CONFLICT',
    DUPLICATE: 'DUPLICATE',
    UNKNOWN: 'UNKNOWN',
} as const