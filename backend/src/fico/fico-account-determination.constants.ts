/**
 * Centralized G/L account determination for every module that generates
 * financially relevant documents (MM, SD, PP).
 *
 * Codes are stored as strings with database CHECK constraints; these lists are
 * the single application-side catalogue used by DTO validation, the resolver
 * and the UI.
 */

export const FICO_DETERMINATION_SOURCE_MODULES = ['MM', 'SD', 'PP'] as const
export type FicoDeterminationSourceModule =
    (typeof FICO_DETERMINATION_SOURCE_MODULES)[number]

export const FICO_DETERMINATION_MODULE_LABELS: Record<
    FicoDeterminationSourceModule,
    string
> = {
    MM: 'Materials Management',
    SD: 'Sales & Distribution',
    PP: 'Production Planning',
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
] as const

export type FicoDeterminationTransactionType =
    | (typeof FICO_MM_DETERMINATION_TYPES)[number]['code']
    | (typeof FICO_SD_DETERMINATION_TYPES)[number]['code']
    | (typeof FICO_PP_DETERMINATION_TYPES)[number]['code']

export const FICO_MM_DETERMINATION_TYPE_CODES = FICO_MM_DETERMINATION_TYPES.map(
    (entry) => entry.code,
)
export const FICO_SD_DETERMINATION_TYPE_CODES = FICO_SD_DETERMINATION_TYPES.map(
    (entry) => entry.code,
)
export const FICO_PP_DETERMINATION_TYPE_CODES = FICO_PP_DETERMINATION_TYPES.map(
    (entry) => entry.code,
)
export const FICO_DETERMINATION_TRANSACTION_TYPE_CODES = [
    ...FICO_MM_DETERMINATION_TYPE_CODES,
    ...FICO_SD_DETERMINATION_TYPE_CODES,
    ...FICO_PP_DETERMINATION_TYPE_CODES,
]

const DETERMINATION_TYPES_BY_MODULE: Record<
    string,
    ReadonlyArray<{ code: string; label: string }>
> = {
    MM: FICO_MM_DETERMINATION_TYPES,
    SD: FICO_SD_DETERMINATION_TYPES,
    PP: FICO_PP_DETERMINATION_TYPES,
}

export function ficoDeterminationTypesForModule(
    sourceModule: string,
): ReadonlyArray<{ code: string; label: string }> {
    return DETERMINATION_TYPES_BY_MODULE[sourceModule] ?? FICO_MM_DETERMINATION_TYPES
}

/** Modules whose rules are constrained by material / production dimensions. */
export const FICO_MATERIAL_DIMENSION_MODULES = ['MM', 'PP'] as const

/** Modules whose rules are constrained by customer / sales dimensions. */
export const FICO_SALES_DIMENSION_MODULES = ['SD'] as const

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
} as const

export const FICO_DETERMINATION_ENTITY_TYPE = 'FICO_ACCOUNT_DETERMINATION_RULE'

/**
 * Dimension fields a rule can constrain. A null dimension is a wildcard; the
 * resolver scores a rule by how many constrained dimensions it matched.
 */
export const FICO_DETERMINATION_DIMENSIONS = [
    'valuationClassId',
    'materialTypeCode',
    'movementType',
    'customerAccountGroup',
    'salesOrganization',
    'distributionChannel',
] as const
export type FicoDeterminationDimension =
    (typeof FICO_DETERMINATION_DIMENSIONS)[number]
