import { BadRequestException } from '@nestjs/common'
import {
    FICO_TRANSACTION_KEY_CATALOG,
    type FicoTransactionKeyCatalogEntry,
} from './fico-transaction-key.catalog'
import { FICO_DETERMINATION_TRANSACTION_TYPE_CODES } from './fico-account-determination.constants'
import { ficoCatalogEntryForLogicalKey } from './fico-phase02-enterprise-keys.policy'

/**
 * Deterministic precedence (highest wins first):
 * 1. Higher dimension specificity (exact business conditions, incl. transaction key on rule)
 * 2. Lower numeric priority value (100 beats 200)
 * 3. Later effective-from (scheduled replacement)
 * Equal rank with different G/L line sets → ambiguous (ConflictException)
 * Creation timestamps are never used as an accounting tie-breaker.
 */

const KEY_DEFAULT_TRANSACTION_TYPE: Record<string, string> = {
    GR_IR: 'GR_IR_CLEARING',
    INVENTORY_GAIN: 'INVENTORY_INCREASE',
    INVENTORY_INCREASE_ADJ: 'INVENTORY_INCREASE',
    INVENTORY_LOSS: 'INVENTORY_DECREASE',
    INVENTORY_DECREASE_ADJ: 'INVENTORY_DECREASE',
    INVENTORY_SCRAP: 'INVENTORY_WRITE_OFF',
    GI_COGS: 'INVENTORY_CONSUMPTION',
    PRICE_VARIANCE: 'SUPPLIER_INVOICE',
    PURCHASE_VARIANCE: 'SUPPLIER_INVOICE',
    SALES_REVENUE: 'SALES_REVENUE',
    OUTPUT_TAX: 'OUTPUT_TAX',
    INPUT_TAX: 'SUPPLIER_INVOICE',
    COGS: 'COGS',
    PAYMENT_CLEARING: 'PAYMENT_CLEARING',
    CUSTOMER_RECON: 'ACCOUNTS_RECEIVABLE',
    ACCOUNTS_RECEIVABLE: 'ACCOUNTS_RECEIVABLE',
    CASH_ON_HAND: 'CUSTOMER_PAYMENT',
    BANK_ACCOUNT: 'CUSTOMER_PAYMENT',
    PETTY_CASH: 'CASH_MANAGEMENT',
    BANK_CLEARING: 'BANK_SETTLEMENT',
    CASH_IN_TRANSIT: 'BANK_SETTLEMENT',
    BANK_CHARGES: 'BANK_SETTLEMENT',
    INTEREST_INCOME: 'INTEREST',
    INTEREST_EXPENSE: 'INTEREST',
    FX_GAIN: 'FX_REVALUATION',
    FX_LOSS: 'FX_REVALUATION',
    CASH_OVERAGE: 'CASH_MANAGEMENT',
    CASH_SHORTAGE: 'CASH_MANAGEMENT',
    SUPPLIER_RECON: 'SUPPLIER_INVOICE',
    SUPPLIER_INVOICE: 'SUPPLIER_INVOICE',
    SUPPLIER_ADVANCE: 'SUPPLIER_ADVANCE',
    AP_OPENING_BALANCE: 'SUPPLIER_OPENING_BALANCE',
    ASSET_ACQUISITION: 'ASSET_ACQUISITION',
    ASSET_CLEARING: 'ASSET_CAPITALIZATION',
    ASSET_UNDER_CONSTRUCTION: 'ASSET_CAPITALIZATION',
    DEPRECIATION_EXPENSE: 'DEPRECIATION_RUN',
    ACCUMULATED_DEPRECIATION: 'DEPRECIATION_RUN',
    ASSET_IMPAIRMENT: 'ASSET_IMPAIRMENT',
    ASSET_DISPOSAL_GAIN: 'ASSET_DISPOSAL',
    ASSET_DISPOSAL_LOSS: 'ASSET_DISPOSAL',
    RAW_MATERIAL_CONSUMPTION: 'PRODUCTION_ISSUE',
    WORK_IN_PROCESS: 'PRODUCTION_ISSUE',
    FINISHED_GOODS: 'PRODUCTION_RECEIPT',
    PRODUCTION_VARIANCE: 'PRODUCTION_VARIANCE',
    MATERIAL_USAGE_VARIANCE: 'PRODUCTION_VARIANCE',
    PRODUCTION_PRICE_VARIANCE: 'PRODUCTION_VARIANCE',
    OVERHEAD_ABSORPTION: 'OVERHEAD_ALLOCATION',
    PRODUCTION_ISSUE: 'PRODUCTION_ISSUE',
    PRODUCTION_RECEIPT: 'PRODUCTION_RECEIPT',
    PRODUCTION_SCRAP: 'PRODUCTION_SCRAP',
    INVENTORY_REVALUATION: 'INVENTORY_REVALUATION',
    INVENTORY: 'GOODS_RECEIPT',
    INVENTORY_WRITEOFF: 'INVENTORY_WRITE_OFF',
    CONSUMPTION_EXPENSE: 'INVENTORY_DECREASE',
    MATERIAL_CONSUMPTION: 'INVENTORY_DECREASE',
    PURCHASE_DISCOUNT: 'SUPPLIER_INVOICE',
    SUPPLIER_REFUND: 'SUPPLIER_RETURN',
    AP_ADJUSTMENT: 'SUPPLIER_INVOICE',
    CUSTOMER_ADVANCE: 'CUSTOMER_PAYMENT',
    SALES_DISCOUNT: 'SALES_DISCOUNT',
    CUSTOMER_REFUND: 'SALES_RETURN',
    BAD_DEBT_EXPENSE: 'CUSTOMER_BILLING',
    DOUBTFUL_ACCOUNT_ALLOWANCE: 'CUSTOMER_BILLING',
    SALES_RETURN: 'SALES_RETURN',
    CASH_SALES: 'CUSTOMER_PAYMENT',
    CARD_SETTLEMENT: 'PAYMENT_CLEARING',
    EWALLET_SETTLEMENT: 'PAYMENT_CLEARING',
    WITHHOLDING_PAYABLE: 'SUPPLIER_INVOICE',
    WITHHOLDING_RECEIVABLE: 'CUSTOMER_BILLING',
    ROUNDING_DIFFERENCE: 'CUSTOMER_BILLING',
    FX_GAIN_LOSS: 'FX_REVALUATION',
    INPUT_VAT: 'SUPPLIER_INVOICE',
    OUTPUT_VAT: 'OUTPUT_TAX',
    AP_RECON: 'SUPPLIER_INVOICE',
    AR_RECON: 'ACCOUNTS_RECEIVABLE',
    GRIR: 'GR_IR_CLEARING',
    CASH: 'CUSTOMER_PAYMENT',
    BANK: 'CUSTOMER_PAYMENT',
}

/** Expected G/L account types per catalogue accounting category (not code patterns). */
export const FICO_ACCOUNTING_CATEGORY_GL_TYPES: Record<string, readonly string[]> = {
    INVENTORY: ['ASSET'],
    CLEARING: ['ASSET', 'LIABILITY'],
    VARIANCE: ['EXPENSE', 'ASSET', 'LIABILITY'],
    REVENUE: ['REVENUE'],
    COGS: ['EXPENSE'],
    TAX: ['ASSET', 'LIABILITY'],
    CASH: ['ASSET'],
    RECEIVABLE: ['ASSET'],
    PAYABLE: ['LIABILITY'],
    LIABILITY: ['LIABILITY'],
    TREASURY: ['ASSET', 'LIABILITY'],
    EQUITY: ['EQUITY'],
    ASSET: ['ASSET'],
}

export function ficoCatalogEntryForKey(
    transactionKey: string,
): FicoTransactionKeyCatalogEntry | undefined {
    return ficoCatalogEntryForLogicalKey(transactionKey)
}

export function ficoResolveTransactionTypeForKey(
    transactionKey: string,
    sourceModule: string,
    explicitType?: string,
): string {
    if (explicitType?.trim()) {
        const type = explicitType.trim().toUpperCase()
        if (!(FICO_DETERMINATION_TRANSACTION_TYPE_CODES as readonly string[]).includes(type)) {
            throw new BadRequestException(
                `${explicitType} is not a supported account determination transaction type.`,
            )
        }
        return type
    }
    const code = transactionKey.trim().toUpperCase()
    const mapped = KEY_DEFAULT_TRANSACTION_TYPE[code]
    if (mapped) return mapped
    if ((FICO_DETERMINATION_TRANSACTION_TYPE_CODES as readonly string[]).includes(code)) {
        return code
    }
    throw new BadRequestException(
        `Transaction key ${transactionKey} does not map to a determination transaction type for ${sourceModule}.`,
    )
}

export function ficoAssertSourceModuleSupportsKey(
    entry: FicoTransactionKeyCatalogEntry,
    sourceModule: string,
) {
    const module = sourceModule.trim().toUpperCase()
    const allowed = entry.supportedSourceModules.map((m) => m.toUpperCase())
    if (!allowed.includes(module)) {
        throw new BadRequestException(
            `Transaction key ${entry.code} is not enabled for source module ${sourceModule}.`,
        )
    }
}

export function ficoAssertAccountTypeForCategory(
    accountingCategory: string,
    accountType: string,
    accountCode: string,
) {
    const allowed =
        FICO_ACCOUNTING_CATEGORY_GL_TYPES[accountingCategory.toUpperCase()] ??
        null
    if (!allowed) return
    const type = accountType.toUpperCase()
    if (!allowed.includes(type)) {
        throw new BadRequestException(
            `G/L account ${accountCode} has type ${accountType}, which is not compatible with accounting category ${accountingCategory}.`,
        )
    }
}

export function ficoPreferredSideForCategory(
    accountingCategory: string,
): 'DEBIT' | 'CREDIT' {
    const category = accountingCategory.toUpperCase()
    if (['REVENUE', 'PAYABLE', 'TAX', 'EQUITY'].includes(category)) {
        return 'CREDIT'
    }
    return 'DEBIT'
}

export function ficoRuleLineSignature(
    lines: Array<{ side: string; glAccountId: string; lineNumber: number }>,
) {
    return [...lines]
        .sort(
            (a, b) =>
                a.lineNumber - b.lineNumber ||
                a.side.localeCompare(b.side) ||
                a.glAccountId.localeCompare(b.glAccountId),
        )
        .map((line) => `${line.lineNumber}:${line.side}:${line.glAccountId}`)
        .join('|')
}
