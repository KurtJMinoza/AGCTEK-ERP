/**
 * Phase 04.16 — cash/bank account determination guidance.
 * Payment-method hints are configuration examples only; finance rules and
 * settlement policy (per company / bank account) are authoritative.
 * No automatic settlement posting unless Treasury consumes resolve API.
 */

export type FicoTreasuryPaymentMethodHint = {
    paymentMethodCode: string
    label: string
    /** Suggested primary transaction keys for rule authoring (not hardcoded G/L). */
    typicalTransactionKeys: string[]
    settlementPattern: 'IMMEDIATE_CASH' | 'CLEARING_THEN_BANK' | 'RECEIVABLE' | 'PETTY_CASH'
    notes?: string
}

export const FICO_TREASURY_PAYMENT_METHOD_HINTS: FicoTreasuryPaymentMethodHint[] = [
    {
        paymentMethodCode: 'CASH',
        label: 'Physical cash',
        typicalTransactionKeys: ['CASH_ON_HAND', 'PAYMENT_CLEARING'],
        settlementPattern: 'IMMEDIATE_CASH',
    },
    {
        paymentMethodCode: 'BANK_TRANSFER',
        label: 'Bank transfer',
        typicalTransactionKeys: ['BANK_CLEARING', 'BANK_ACCOUNT', 'PAYMENT_CLEARING'],
        settlementPattern: 'CLEARING_THEN_BANK',
        notes: 'Use clearing when settlement is confirmed separately from customer payment capture.',
    },
    {
        paymentMethodCode: 'CREDIT_CARD',
        label: 'Credit card',
        typicalTransactionKeys: ['PAYMENT_CLEARING', 'BANK_CLEARING'],
        settlementPattern: 'CLEARING_THEN_BANK',
    },
    {
        paymentMethodCode: 'DEBIT_CARD',
        label: 'Debit card',
        typicalTransactionKeys: ['PAYMENT_CLEARING', 'BANK_ACCOUNT'],
        settlementPattern: 'CLEARING_THEN_BANK',
    },
    {
        paymentMethodCode: 'GCASH',
        label: 'GCash e-wallet',
        typicalTransactionKeys: ['PAYMENT_CLEARING', 'BANK_CLEARING'],
        settlementPattern: 'CLEARING_THEN_BANK',
        notes: 'E-wallet clearing; bank settlement may net merchant fees (BANK_CHARGES).',
    },
    {
        paymentMethodCode: 'MAYA',
        label: 'Maya e-wallet',
        typicalTransactionKeys: ['PAYMENT_CLEARING', 'BANK_CLEARING'],
        settlementPattern: 'CLEARING_THEN_BANK',
    },
    {
        paymentMethodCode: 'CHECK',
        label: 'Check',
        typicalTransactionKeys: ['BANK_CLEARING', 'CASH_IN_TRANSIT'],
        settlementPattern: 'CLEARING_THEN_BANK',
    },
    {
        paymentMethodCode: 'PETTY_CASH',
        label: 'Petty cash',
        typicalTransactionKeys: ['PETTY_CASH', 'CASH_ON_HAND'],
        settlementPattern: 'PETTY_CASH',
    },
    {
        paymentMethodCode: 'PLATFORM_PAYOUT',
        label: 'Marketplace / platform payout',
        typicalTransactionKeys: ['PAYMENT_CLEARING', 'BANK_ACCOUNT', 'BANK_CHARGES'],
        settlementPattern: 'CLEARING_THEN_BANK',
        notes: 'Provider fee is a separate determination key (BANK_CHARGES), not netted into revenue.',
    },
]

/** Illustrative two-step intermediary settlement (resolve API / future Treasury only). */
export const FICO_TREASURY_SETTLEMENT_EXAMPLE = {
    customerPayment: {
        description: 'Customer payment captured into clearing',
        lines: [
            { side: 'DEBIT' as const, key: 'PAYMENT_CLEARING' },
            { side: 'CREDIT' as const, key: 'CUSTOMER_RECON' },
        ],
    },
    providerSettlement: {
        description: 'Provider settles to bank net of fees',
        lines: [
            { side: 'DEBIT' as const, key: 'BANK_ACCOUNT' },
            { side: 'DEBIT' as const, key: 'BANK_CHARGES' },
            { side: 'CREDIT' as const, key: 'PAYMENT_CLEARING' },
        ],
    },
}

export const FICO_PHASE0416_TRANSACTION_KEYS = [
    'CASH_ON_HAND',
    'BANK_ACCOUNT',
    'PETTY_CASH',
    'BANK_CLEARING',
    'CASH_IN_TRANSIT',
    'PAYMENT_CLEARING',
    'BANK_CHARGES',
    'INTEREST_INCOME',
    'INTEREST_EXPENSE',
    'FX_GAIN',
    'FX_LOSS',
    'CASH_OVERAGE',
    'CASH_SHORTAGE',
] as const