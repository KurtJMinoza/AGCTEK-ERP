export const FICO_RECONCILIATION_CATEGORIES = {
    MISSING_FINANCIAL_POSTING: 'MISSING_FINANCIAL_POSTING',
    FAILED_ACCOUNTING_EVENT: 'FAILED_ACCOUNTING_EVENT',
    INCOMPLETE_JOURNAL_LINES: 'INCOMPLETE_JOURNAL_LINES',
    UNBALANCED_JOURNAL: 'UNBALANCED_JOURNAL',
    DUPLICATE_SOURCE_POSTING: 'DUPLICATE_SOURCE_POSTING',
    SOURCE_AMOUNT_MISMATCH: 'SOURCE_AMOUNT_MISMATCH',
    MISSING_REVERSAL_DOCUMENT: 'MISSING_REVERSAL_DOCUMENT',
    MISSING_OFFICIAL_DOCUMENT_NUMBER: 'MISSING_OFFICIAL_DOCUMENT_NUMBER',
    INVENTORY_VALUATION_MISMATCH: 'INVENTORY_VALUATION_MISMATCH',
    POS_REVENUE_MISMATCH: 'POS_REVENUE_MISMATCH',
    GR_IR_EXCEPTION: 'GR_IR_EXCEPTION',
    INVALID_JOURNAL_LIFECYCLE: 'INVALID_JOURNAL_LIFECYCLE',
    TRIAL_BALANCE_OUT_OF_BALANCE: 'TRIAL_BALANCE_OUT_OF_BALANCE',
    PENDING_ACCOUNTING_EVENTS: 'PENDING_ACCOUNTING_EVENTS',
    NOT_APPLICABLE: 'NOT_APPLICABLE',
} as const

export type FicoReconciliationCategory =
    (typeof FICO_RECONCILIATION_CATEGORIES)[keyof typeof FICO_RECONCILIATION_CATEGORIES]

export const FICO_RECONCILIATION_RECOMMENDED: Partial<
    Record<FicoReconciliationCategory, string>
> = {
    MISSING_FINANCIAL_POSTING:
        'Review MM/SD source document; retry or post missing accounting event.',
    FAILED_ACCOUNTING_EVENT:
        'Inspect event error; fix determination/period config; authorized retry.',
    UNBALANCED_JOURNAL:
        'Do not edit posted amounts — post correcting journal or authorized reversal.',
    DUPLICATE_SOURCE_POSTING:
        'Identify duplicate idempotency; reverse duplicate journal if confirmed.',
    POS_REVENUE_MISMATCH:
        'Post POS revenue event or reverse erroneous journal; verify tenders and tax.',
    TRIAL_BALANCE_OUT_OF_BALANCE:
        'Run journal integrity; reconcile MM and POS before period close.',
}