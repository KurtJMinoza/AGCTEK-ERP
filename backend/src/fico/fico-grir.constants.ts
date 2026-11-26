export const FICO_GRIR_OPEN_STATUSES = [
    'OPEN',
    'PARTIALLY_CLEARED',
    'CLEARED',
    'REVERSED',
] as const

export const FICO_GRIR_RECONCILIATION_STATUSES = [
    'GR_NOT_INVOICED',
    'PARTIALLY_INVOICED',
    'FULLY_MATCHED',
    'INVOICE_EXCESS',
    'BLOCKED',
    'REVERSED',
] as const

export type FicoGrIrOpenStatus = (typeof FICO_GRIR_OPEN_STATUSES)[number]
export type FicoGrIrReconciliationStatus =
    (typeof FICO_GRIR_RECONCILIATION_STATUSES)[number]