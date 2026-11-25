/**
 * Phase 04.08–04.12 — MM inventory, GR/IR, and purchase variance determination contracts.
 * Valuation classes come from `mm_valuation_classes` (material master), not SD product categories.
 */

import type { MmAccountingDispatchPayload } from '../mm/common/mm-accounting-event.types'

/** Legacy MM keys emitted today → canonical catalogue code for centralized rules. */
export const FICO_MM_LEGACY_TRANSACTION_KEY_ALIASES: Record<string, string> = {
    INVENTORY_SHRINKAGE: 'INVENTORY_LOSS',
    GI_EXPENSE: 'CONSUMPTION_EXPENSE',
    INVENTORY_INCREASE_ADJ: 'INVENTORY_GAIN',
}

/** Keys resolved for live MM automatic posting events. */
export const FICO_MM_EVENT_TRANSACTION_KEYS: ReadonlyArray<{
    eventTypes: string[]
    resolve: (payload: MmAccountingDispatchPayload) => string | null
}> = [
    {
        eventTypes: ['GoodsReceiptPosted'],
        resolve: () => 'GR_IR',
    },
    {
        eventTypes: ['GoodsIssuePosted'],
        resolve: (payload) =>
            payload.issuePurpose === 'SALES' ? 'GI_COGS' : 'CONSUMPTION_EXPENSE',
    },
    {
        eventTypes: ['*'],
        resolve: (payload) => {
            const effects = new Set(payload.accountingEffects)
            if (effects.has('INVENTORY_LOSS')) return 'INVENTORY_LOSS'
            if (effects.has('LANDED_COST')) return 'LANDED_COST'
            if (effects.has('PRICE_VARIANCE')) return 'PURCHASE_VARIANCE'
            if (effects.has('INVENTORY_ADJUSTMENT')) {
                return payload.lines.some((line) =>
                    line.movementType.toUpperCase().includes('IN'),
                )
                    ? 'INVENTORY_GAIN'
                    : 'INVENTORY_LOSS'
            }
            return null
        },
    },
]

/** Central determination `transactionType` for rule matching. */
export const FICO_MM_KEY_TO_TRANSACTION_TYPE: Record<string, string> = {
    GR_IR: 'GOODS_RECEIPT',
    INVENTORY: 'GOODS_RECEIPT',
    GI_COGS: 'INVENTORY_CONSUMPTION',
    COGS: 'INVENTORY_CONSUMPTION',
    CONSUMPTION_EXPENSE: 'INVENTORY_DECREASE',
    GI_EXPENSE: 'INVENTORY_DECREASE',
    INVENTORY_GAIN: 'INVENTORY_INCREASE',
    INVENTORY_INCREASE_ADJ: 'INVENTORY_INCREASE',
    INVENTORY_LOSS: 'INVENTORY_DECREASE',
    INVENTORY_SHRINKAGE: 'INVENTORY_DECREASE',
    INVENTORY_WRITEOFF: 'INVENTORY_WRITE_OFF',
    LANDED_COST: 'GOODS_RECEIPT',
    FREIGHT_CLEARING: 'GOODS_RECEIPT',
    PURCHASE_VARIANCE: 'SUPPLIER_INVOICE',
    PRICE_VARIANCE: 'SUPPLIER_INVOICE',
}

/**
 * Illustrative debit/credit roles per MM movement (actual amounts from MM valuation).
 * One legacy mapping row still maps both sides for a single transaction key.
 */
export const FICO_MM_POSTING_ROLE_GUIDE: ReadonlyArray<{
    scenario: string
    transactionKey: string
    debitRole: string
    creditRole: string
}> = [
    {
        scenario: 'Valuated goods receipt',
        transactionKey: 'GR_IR',
        debitRole: 'INVENTORY',
        creditRole: 'GR_IR',
    },
    {
        scenario: 'Consumption goods issue',
        transactionKey: 'CONSUMPTION_EXPENSE',
        debitRole: 'CONSUMPTION_EXPENSE',
        creditRole: 'INVENTORY',
    },
    {
        scenario: 'Sales goods issue',
        transactionKey: 'GI_COGS',
        debitRole: 'COGS',
        creditRole: 'INVENTORY',
    },
    {
        scenario: 'Inventory shortage',
        transactionKey: 'INVENTORY_LOSS',
        debitRole: 'INVENTORY_LOSS',
        creditRole: 'INVENTORY',
    },
    {
        scenario: 'Inventory surplus',
        transactionKey: 'INVENTORY_GAIN',
        debitRole: 'INVENTORY',
        creditRole: 'INVENTORY_GAIN',
    },
    {
        scenario: 'Purchase price variance',
        transactionKey: 'PURCHASE_VARIANCE',
        debitRole: 'INVENTORY or PURCHASE_VARIANCE',
        creditRole: 'GR_IR',
    },
]

export function ficoCanonicalMmTransactionKey(key: string): string {
    const upper = key.trim().toUpperCase()
    return FICO_MM_LEGACY_TRANSACTION_KEY_ALIASES[upper] ?? upper
}

/** Legacy DB codes that resolve to the same catalogue key. */
export function ficoLegacyTransactionKeyCodes(canonicalKey: string): string[] {
    const canonical = ficoCanonicalMmTransactionKey(canonicalKey)
    const legacy = Object.entries(FICO_MM_LEGACY_TRANSACTION_KEY_ALIASES)
        .filter(([, value]) => value === canonical)
        .map(([code]) => code)
    return [...new Set([canonical, ...legacy])]
}

export function ficoResolveMmTransactionKey(
    payload: MmAccountingDispatchPayload,
): string {
    if (payload.eventType === 'GoodsReceiptPosted') {
        return ficoCanonicalMmTransactionKey('GR_IR')
    }
    if (payload.eventType === 'GoodsIssuePosted') {
        return ficoCanonicalMmTransactionKey(
            payload.issuePurpose === 'SALES' ? 'GI_COGS' : 'CONSUMPTION_EXPENSE',
        )
    }
    const effects = new Set(payload.accountingEffects)
    if (effects.has('INVENTORY_LOSS')) return ficoCanonicalMmTransactionKey('INVENTORY_LOSS')
    if (effects.has('LANDED_COST')) return ficoCanonicalMmTransactionKey('LANDED_COST')
    if (effects.has('PRICE_VARIANCE')) return ficoCanonicalMmTransactionKey('PURCHASE_VARIANCE')
    if (effects.has('INVENTORY_ADJUSTMENT')) {
        const increase = payload.lines.some((line) =>
            line.movementType.toUpperCase().includes('IN'),
        )
        return ficoCanonicalMmTransactionKey(
            increase ? 'INVENTORY_GAIN' : 'INVENTORY_LOSS',
        )
    }
    throw new Error(`No MM transaction key for ${payload.eventType}`)
}

export function ficoMmTransactionTypeForKey(transactionKey: string): string {
    const canonical = ficoCanonicalMmTransactionKey(transactionKey)
    const mapped = FICO_MM_KEY_TO_TRANSACTION_TYPE[canonical]
    if (!mapped) {
        throw new Error(`No MM transaction type mapping for key ${transactionKey}`)
    }
    return mapped
}