/**
 * Retail POS tender vocabulary.
 *
 * SD owns the sale and its tenders; the tender method decides which evidence
 * the cashier must capture and how the amount settles.
 */
export const POS_TENDER_METHODS = [
    'CASH',
    'GCASH',
    'BANK_TRANSFER',
    'CARD',
    'CHEQUE',
    'SALARY_LOAN',
] as const
export type PosTenderMethod = (typeof POS_TENDER_METHODS)[number]

/** How the tender was verified at the register. */
export const POS_TENDER_VERIFICATION_STATUSES = [
    'VERIFIED',
    'PENDING',
    'RECEIVABLE',
    'REJECTED',
] as const
export type PosTenderVerificationStatus =
    (typeof POS_TENDER_VERIFICATION_STATUSES)[number]

/** Cash tender settlement status (mirrors `sd_sales_order_payments.status`). */
export const POS_TENDER_SETTLEMENT_STATUS = {
    PAID: 'Paid',
    PENDING_VERIFICATION: 'Pending Verification',
    AUTHORIZED: 'Authorized',
} as const

export const POS_SESSION_STATUSES = ['OPEN', 'CLOSED'] as const
export type PosSessionStatus = (typeof POS_SESSION_STATUSES)[number]

export const POS_HOLD_STATUSES = ['HELD', 'RESUMED', 'DISCARDED'] as const
export type PosHoldStatus = (typeof POS_HOLD_STATUSES)[number]

/** Quick cash denominations offered on the tender screen (PHP). */
export const POS_CASH_DENOMINATIONS = [500, 1000, 2000, 5000] as const
