/**
 * Centralized G/L account determination for every module that generates
 * financially relevant documents (MM, SD, PP).
 *
 * Codes are stored as strings with database CHECK constraints; these lists are
 * the single application-side catalogue used by DTO validation, the resolver
 * and the UI.
 */

export const FICO_DETERMINATION_SOURCE_MODULES = [
    'MM',
    'SD',
    'PP',
    'TREASURY',
    'AP',
    'AR',
    'AA',
    'CO',
] as const
export type FicoDeterminationSourceModule =
    (typeof FICO_DETERMINATION_SOURCE_MODULES)[number]

export const FICO_DETERMINATION_MODULE_LABELS: Record<
    FicoDeterminationSourceModule,
    string
> = {
    MM: 'Materials Management',
    SD: 'Sales & Distribution',
    PP: 'Production Planning',
    TREASURY: 'Bank & Treasury',
    AP: 'Accounts Payable',
    AR: 'Accounts Receivable',
    AA: 'Asset Accounting',
    CO: 'Controlling / Production Costing',
}

export const FICO_DETERMINATION_RULE_STATUSES = [
    'DRAFT',
    'PENDING_APPROVAL',
    'APPROVED',
    'ACTIVE',
    'INACTIVE',
    'REJECTED',
] as const
export type FicoDeterminationRuleStatus =
    (typeof FICO_DETERMINATION_RULE_STATUSES)[number]

export const FICO_DETERMINATION_SIDES = ['DEBIT', 'CREDIT'] as const
export type FicoDeterminationSide = (typeof FICO_DETERMINATION_SIDES)[number]

/** MM transaction types mapped by Phase 1. */
export const FICO_MM_DETERMINATION_TYPES = [
    { code: 'GOODS_RECEIPT', label: 'Goods Receipt' },
    { code: 'GR_IR_CLEARING', label: 'GR/IR Clearing' },
    { code: 'SUPPLIER_INVOICE', label: 'Supplier Invoice' },
    { code: 'INVENTORY_CONSUMPTION', label: 'Inventory Consumption' },
    { code: 'INVENTORY_INCREASE', label: 'Inventory Increase' },
    { code: 'INVENTORY_DECREASE', label: 'Inventory Decrease' },
    { code: 'INVENTORY_WRITE_OFF', label: 'Inventory Write-off' },
    { code: 'SUPPLIER_RETURN', label: 'Supplier Return' },
    { code: 'INVENTORY_REVALUATION', label: 'Inventory Revaluation' },
] as const

/** SD transaction types mapped by Phase 1. */
export const FICO_SD_DETERMINATION_TYPES = [
    { code: 'CUSTOMER_BILLING', label: 'Customer Billing' },
    { code: 'ACCOUNTS_RECEIVABLE', label: 'Accounts Receivable' },
    { code: 'SALES_REVENUE', label: 'Sales Revenue' },
    { code: 'COGS', label: 'Cost of Goods Sold' },
    { code: 'INVENTORY_REDUCTION', label: 'Inventory Reduction' },
    { code: 'CUSTOMER_PAYMENT', label: 'Customer Payment' },
    { code: 'SALES_RETURN', label: 'Sales Return' },
    { code: 'SALES_DISCOUNT', label: 'Sales Discount' },
    { code: 'OUTPUT_TAX', label: 'Output Tax' },
    { code: 'PAYMENT_CLEARING', label: 'Payment Clearing' },
] as const

/** PP transaction types: component issue, output receipt, scrap and variance. */
export const FICO_PP_DETERMINATION_TYPES = [
    { code: 'PRODUCTION_ISSUE', label: 'Component Issue to Production' },
    { code: 'PRODUCTION_RECEIPT', label: 'Production Output Receipt' },
    { code: 'PRODUCTION_SCRAP', label: 'Production Scrap' },
    { code: 'PRODUCTION_VARIANCE', label: 'Production Variance' },
    { code: 'PRODUCTION_SETTLEMENT', label: 'Production Settlement' },
] as const

export const FICO_TREASURY_DETERMINATION_TYPES = [
    { code: 'CUSTOMER_PAYMENT', label: 'Customer Payment' },
    { code: 'SUPPLIER_PAYMENT', label: 'Supplier Payment' },
    { code: 'PAYMENT_CLEARING', label: 'Payment Clearing' },
    { code: 'BANK_SETTLEMENT', label: 'Bank Settlement' },
    { code: 'CASH_MANAGEMENT', label: 'Cash Management' },
    { code: 'FX_REVALUATION', label: 'FX Revaluation' },
    { code: 'INTEREST', label: 'Interest Income / Expense' },
] as const

export const FICO_AP_DETERMINATION_TYPES = [
    { code: 'SUPPLIER_INVOICE', label: 'Supplier Invoice' },
    { code: 'SUPPLIER_PAYMENT', label: 'Supplier Payment' },
    { code: 'PAYMENT_CLEARING', label: 'Payment Clearing' },
    { code: 'SUPPLIER_ADVANCE', label: 'Supplier Advance / Down Payment' },
    { code: 'SUPPLIER_OPENING_BALANCE', label: 'Supplier Opening Balance' },
] as const

export const FICO_AR_DETERMINATION_TYPES = [
    { code: 'CUSTOMER_BILLING', label: 'Customer Billing' },
    { code: 'ACCOUNTS_RECEIVABLE', label: 'Accounts Receivable' },
    { code: 'CUSTOMER_PAYMENT', label: 'Customer Payment' },
    { code: 'PAYMENT_CLEARING', label: 'Payment Clearing' },
] as const

export const FICO_AA_DETERMINATION_TYPES = [
    { code: 'ASSET_ACQUISITION', label: 'Asset Acquisition' },
    { code: 'ASSET_CAPITALIZATION', label: 'Asset Capitalization' },
    { code: 'DEPRECIATION_RUN', label: 'Depreciation Run' },
    { code: 'ASSET_DISPOSAL', label: 'Asset Disposal' },
    { code: 'ASSET_IMPAIRMENT', label: 'Asset Impairment' },
] as const

export const FICO_CO_DETERMINATION_TYPES = [
    { code: 'PRODUCTION_SETTLEMENT', label: 'Production Settlement' },
    { code: 'OVERHEAD_ALLOCATION', label: 'Overhead Allocation' },
    { code: 'PRODUCTION_VARIANCE', label: 'Production Variance' },
] as const

export type FicoDeterminationTransactionType =
    | (typeof FICO_MM_DETERMINATION_TYPES)[number]['code']
    | (typeof FICO_SD_DETERMINATION_TYPES)[number]['code']
    | (typeof FICO_PP_DETERMINATION_TYPES)[number]['code']
    | (typeof FICO_TREASURY_DETERMINATION_TYPES)[number]['code']
    | (typeof FICO_AP_DETERMINATION_TYPES)[number]['code']
    | (typeof FICO_AR_DETERMINATION_TYPES)[number]['code']
    | (typeof FICO_AA_DETERMINATION_TYPES)[number]['code']
    | (typeof FICO_CO_DETERMINATION_TYPES)[number]['code']

export const FICO_MM_DETERMINATION_TYPE_CODES = FICO_MM_DETERMINATION_TYPES.map(
    (entry) => entry.code,
)
export const FICO_SD_DETERMINATION_TYPE_CODES = FICO_SD_DETERMINATION_TYPES.map(
    (entry) => entry.code,
)
export const FICO_PP_DETERMINATION_TYPE_CODES = FICO_PP_DETERMINATION_TYPES.map(
    (entry) => entry.code,
)
export const FICO_TREASURY_DETERMINATION_TYPE_CODES =
    FICO_TREASURY_DETERMINATION_TYPES.map((entry) => entry.code)
export const FICO_AP_DETERMINATION_TYPE_CODES = FICO_AP_DETERMINATION_TYPES.map(
    (entry) => entry.code,
)
export const FICO_AR_DETERMINATION_TYPE_CODES = FICO_AR_DETERMINATION_TYPES.map(
    (entry) => entry.code,
)
export const FICO_AA_DETERMINATION_TYPE_CODES = FICO_AA_DETERMINATION_TYPES.map(
    (entry) => entry.code,
)
export const FICO_CO_DETERMINATION_TYPE_CODES = FICO_CO_DETERMINATION_TYPES.map(
    (entry) => entry.code,
)
export const FICO_DETERMINATION_TRANSACTION_TYPE_CODES = [
    ...new Set([
        ...FICO_MM_DETERMINATION_TYPE_CODES,
        ...FICO_SD_DETERMINATION_TYPE_CODES,
        ...FICO_PP_DETERMINATION_TYPE_CODES,
        ...FICO_TREASURY_DETERMINATION_TYPE_CODES,
        ...FICO_AP_DETERMINATION_TYPE_CODES,
        ...FICO_AR_DETERMINATION_TYPE_CODES,
        ...FICO_AA_DETERMINATION_TYPE_CODES,
        ...FICO_CO_DETERMINATION_TYPE_CODES,
    ]),
]

const DETERMINATION_TYPES_BY_MODULE: Record<
    string,
    ReadonlyArray<{ code: string; label: string }>
> = {
    MM: FICO_MM_DETERMINATION_TYPES,
    SD: FICO_SD_DETERMINATION_TYPES,
    PP: FICO_PP_DETERMINATION_TYPES,
    TREASURY: FICO_TREASURY_DETERMINATION_TYPES,
    AP: FICO_AP_DETERMINATION_TYPES,
    AR: FICO_AR_DETERMINATION_TYPES,
    AA: FICO_AA_DETERMINATION_TYPES,
    CO: FICO_CO_DETERMINATION_TYPES,
}

export function ficoDeterminationTypesForModule(
    sourceModule: string,
): ReadonlyArray<{ code: string; label: string }> {
    return DETERMINATION_TYPES_BY_MODULE[sourceModule] ?? FICO_MM_DETERMINATION_TYPES
}

/** Modules whose rules are constrained by material / production dimensions. */
export const FICO_MATERIAL_DIMENSION_MODULES = ['MM', 'PP', 'CO'] as const

/** Modules whose rules are constrained by customer / sales dimensions. */
export const FICO_SALES_DIMENSION_MODULES = ['SD', 'AR'] as const

/** Treasury / payment dimensions (keys resolve only; no settlement engine here). */
export const FICO_TREASURY_DIMENSION_MODULES = ['TREASURY', 'AP', 'AR', 'SD'] as const

/** Asset accounting dimensions (CONFIG_ONLY until AA posts). */
export const FICO_AA_DIMENSION_MODULES = ['AA'] as const

/** Rules may only be edited while they are drafts. */
export const FICO_DETERMINATION_EDITABLE_STATUS = 'DRAFT'

/** Lifecycle transitions. Anything else is rejected by the service. */
export const FICO_DETERMINATION_TRANSITIONS: Record<string, string[]> = {
    DRAFT: ['PENDING_APPROVAL'],
    PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
    REJECTED: ['PENDING_APPROVAL'],
    APPROVED: ['ACTIVE'],
    ACTIVE: ['INACTIVE'],
    INACTIVE: ['ACTIVE'],
}

export const FICO_DETERMINATION_AUDIT_ACTIONS = {
    CREATE: 'DETERMINATION_RULE_CREATE',
    UPDATE: 'DETERMINATION_RULE_UPDATE',
    DELETE: 'DETERMINATION_RULE_DELETE',
    SUBMIT: 'DETERMINATION_RULE_SUBMIT',
    APPROVE: 'DETERMINATION_RULE_APPROVE',
    REJECT: 'DETERMINATION_RULE_REJECT',
    RESUBMIT: 'DETERMINATION_RULE_RESUBMIT',
    ACTIVATE: 'DETERMINATION_RULE_ACTIVATE',
    DEACTIVATE: 'DETERMINATION_RULE_DEACTIVATE',
    DUPLICATE: 'DETERMINATION_RULE_DUPLICATE',
    NEW_VERSION: 'DETERMINATION_RULE_NEW_VERSION',
    VALIDATE: 'DETERMINATION_RULE_VALIDATE',
    TRANSACTION_KEY_CREATE: 'DETERMINATION_TRANSACTION_KEY_CREATE',
    TRANSACTION_KEY_UPDATE: 'DETERMINATION_TRANSACTION_KEY_UPDATE',
    TRANSACTION_KEY_SYNC: 'DETERMINATION_TRANSACTION_KEY_SYNC',
    MIGRATION_DRY_RUN: 'DETERMINATION_MIGRATION_DRY_RUN',
    MIGRATION_APPLY_DRAFTS: 'DETERMINATION_MIGRATION_APPLY_DRAFTS',
} as const

export const FICO_DETERMINATION_ENTITY_TYPE = 'FICO_ACCOUNT_DETERMINATION_RULE'
export const FICO_TRANSACTION_KEY_ENTITY_TYPE = 'FICO_TRANSACTION_KEY'

/**
 * Dimension fields a rule can constrain. A null dimension is a wildcard; the
 * resolver scores a rule by how many constrained dimensions it matched.
 */
export const FICO_DETERMINATION_DIMENSIONS = [
    'valuationClassId',
    'materialTypeCode',
    'materialGroupCode',
    'movementType',
    'customerAccountGroup',
    'supplierAccountGroup',
    'salesOrganization',
    'distributionChannel',
    'salesChannelCode',
    'taxCodeId',
    'paymentMethodCode',
    'bankAccountId',
    'paymentProviderCode',
    'currencyCode',
    'branchId',
    'assetClassCode',
    'depreciationAreaCode',
    'documentTypeCode',
    'productionOrderTypeCode',
    'costElementCategoryCode',
    'controllingAreaCode',
] as const
export type FicoDeterminationDimension =
    (typeof FICO_DETERMINATION_DIMENSIONS)[number]
