/**
 * Phase 02 — enterprise logical transaction keys (GRIR, AP_RECON, INPUT_VAT, …).
 * Maps public / legacy codes to the canonical catalogue code used in rules and posting.
 */

import { FICO_MM_LEGACY_TRANSACTION_KEY_ALIASES } from './fico-mm-inventory-determination.policy'
import {
    FICO_TRANSACTION_KEY_CATALOG,
    type FicoTransactionKeyCatalogEntry,
} from './fico-transaction-key.catalog'

/** Phase 02 logical keys → canonical catalogue `code`. */
export const FICO_PHASE02_ENTERPRISE_KEY_ALIASES: Record<string, string> = {
    ...FICO_MM_LEGACY_TRANSACTION_KEY_ALIASES,
    GRIR: 'GR_IR',
    AP_RECON: 'SUPPLIER_RECON',
    AR_RECON: 'CUSTOMER_RECON',
    ACCOUNTS_RECEIVABLE: 'CUSTOMER_RECON',
    INPUT_VAT: 'INPUT_TAX',
    OUTPUT_VAT: 'OUTPUT_TAX',
    MATERIAL_CONSUMPTION: 'CONSUMPTION_EXPENSE',
    CASH: 'CASH_ON_HAND',
    BANK: 'BANK_ACCOUNT',
}

/** Every Phase 02 acceptance key must resolve to a catalogue entry (canonical or alias). */
export const FICO_PHASE02_REQUIRED_LOGICAL_KEYS = [
    'INVENTORY',
    'GRIR',
    'PURCHASE_VARIANCE',
    'INVENTORY_GAIN',
    'INVENTORY_LOSS',
    'INVENTORY_WRITEOFF',
    'INVENTORY_REVALUATION',
    'MATERIAL_CONSUMPTION',
    'COGS',
    'AP_RECON',
    'SUPPLIER_ADVANCE',
    'PURCHASE_DISCOUNT',
    'SUPPLIER_REFUND',
    'AP_ADJUSTMENT',
    'AR_RECON',
    'CUSTOMER_ADVANCE',
    'SALES_DISCOUNT',
    'CUSTOMER_REFUND',
    'BAD_DEBT_EXPENSE',
    'DOUBTFUL_ACCOUNT_ALLOWANCE',
    'SALES_REVENUE',
    'SALES_RETURN',
    'CASH_SALES',
    'CARD_SETTLEMENT',
    'EWALLET_SETTLEMENT',
    'INPUT_VAT',
    'OUTPUT_VAT',
    'WITHHOLDING_PAYABLE',
    'WITHHOLDING_RECEIVABLE',
    'CASH',
    'BANK',
    'PAYMENT_CLEARING',
    'ROUNDING_DIFFERENCE',
    'FX_GAIN_LOSS',
] as const

export function ficoCanonicalTransactionKeyCode(code: string): string {
    const upper = code.trim().toUpperCase()
    const mapped = FICO_PHASE02_ENTERPRISE_KEY_ALIASES[upper]
    if (mapped) return mapped
    const byCatalogAlias = FICO_TRANSACTION_KEY_CATALOG.find(
        (entry) =>
            entry.code === upper ||
            (entry.legacyAliases?.some(
                (alias) => alias.trim().toUpperCase() === upper,
            ) ??
                false),
    )
    if (byCatalogAlias) return byCatalogAlias.code
  return upper
}

/** DB / rule lookup codes equivalent to the requested logical key. */
export function ficoTransactionKeyLookupCodes(code: string): string[] {
    const canonical = ficoCanonicalTransactionKeyCode(code)
    const aliasCodes = Object.entries(FICO_PHASE02_ENTERPRISE_KEY_ALIASES)
        .filter(([, target]) => target === canonical)
        .map(([alias]) => alias)
    const catalogEntry = FICO_TRANSACTION_KEY_CATALOG.find(
        (entry) => entry.code === canonical,
    )
    const legacyFromCatalog = catalogEntry?.legacyAliases ?? []
    const reverseAliases = FICO_TRANSACTION_KEY_CATALOG.filter(
        (entry) => entry.code !== canonical,
    )
        .filter(
            (entry) =>
                entry.legacyAliases?.some(
                    (alias) =>
                        ficoCanonicalTransactionKeyCode(alias) === canonical,
                ) || ficoCanonicalTransactionKeyCode(entry.code) === canonical,
        )
        .map((entry) => entry.code)
    return [
        ...new Set([
            canonical,
            code.trim().toUpperCase(),
            ...aliasCodes,
            ...legacyFromCatalog,
            ...reverseAliases,
        ]),
    ]
}

export function ficoTransactionKeysEqual(a: string, b: string): boolean {
    return (
        ficoCanonicalTransactionKeyCode(a) === ficoCanonicalTransactionKeyCode(b)
    )
}

export function ficoCatalogEntryForLogicalKey(
    transactionKey: string,
): FicoTransactionKeyCatalogEntry | undefined {
    const canonical = ficoCanonicalTransactionKeyCode(transactionKey)
    return FICO_TRANSACTION_KEY_CATALOG.find((entry) => entry.code === canonical)
}