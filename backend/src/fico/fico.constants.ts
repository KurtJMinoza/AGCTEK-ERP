/** FICO Phase 1 master data and calendar constants. */

export const FICO_ACCOUNT_TYPES = [
    'ASSET',
    'LIABILITY',
    'EQUITY',
    'REVENUE',
    'EXPENSE',
] as const
export type FicoAccountType = (typeof FICO_ACCOUNT_TYPES)[number]

export const FICO_NORMAL_BALANCES = ['DEBIT', 'CREDIT'] as const
export type FicoNormalBalance = (typeof FICO_NORMAL_BALANCES)[number]

export const FICO_CHART_STATUSES = ['ACTIVE', 'INACTIVE'] as const
export type FicoChartStatus = (typeof FICO_CHART_STATUSES)[number]

export const FICO_COMPANY_SETTINGS_STATUSES = [
    'DRAFT',
    'ACTIVE',
    'INACTIVE',
] as const
export type FicoCompanySettingsStatus =
    (typeof FICO_COMPANY_SETTINGS_STATUSES)[number]

export const FICO_ACCOUNTING_METHODS = ['ACCRUAL', 'CASH'] as const
export type FicoAccountingMethod = (typeof FICO_ACCOUNTING_METHODS)[number]

export const FICO_PERIOD_STATUSES = [
    'FUTURE',
    'OPEN',
    'RESTRICTED',
    'CLOSED',
    'LOCKED',
] as const
export type FicoPeriodStatus = (typeof FICO_PERIOD_STATUSES)[number]

export const FICO_PERIOD_TYPES = ['NORMAL', 'SPECIAL'] as const
export type FicoPeriodType = (typeof FICO_PERIOD_TYPES)[number]

/**
 * YEAR_START labels a fiscal year by the calendar year it begins in
 * (Apr 2027 – Mar 2028 is FY 2027); YEAR_END by the year it ends in (FY 2028).
 * Both are identical for a January 1 start.
 */
export const FICO_YEAR_ASSIGNMENTS = ['YEAR_START', 'YEAR_END'] as const
export type FicoYearAssignment = (typeof FICO_YEAR_ASSIGNMENTS)[number]

/** Regular period counts that split twelve months into equal whole-month periods. */
export const FICO_NORMAL_PERIOD_COUNTS = [1, 2, 3, 4, 6, 12] as const

export const FICO_MAX_SPECIAL_PERIODS = 4

export function ficoFiscalPeriodType(normalPeriodCount: number): string {
    switch (normalPeriodCount) {
        case 12:
            return 'MONTHLY'
        case 6:
            return 'BIMONTHLY'
        case 4:
            return 'QUARTERLY'
        case 3:
            return 'FOUR_MONTHLY'
        case 2:
            return 'SEMIANNUAL'
        case 1:
            return 'ANNUAL'
        default:
            return 'CUSTOM'
    }
}

/**
 * Allowed period state transitions. Closing and locking are never reversible
 * without the dedicated reopen/unlock action, which carries its own permission.
 */
export const FICO_PERIOD_TRANSITIONS: Record<
    FicoPeriodStatus,
    FicoPeriodStatus[]
> = {
    FUTURE: ['OPEN'],
    OPEN: ['RESTRICTED', 'CLOSED'],
    RESTRICTED: ['OPEN', 'CLOSED'],
    CLOSED: ['LOCKED', 'OPEN'],
    LOCKED: ['CLOSED'],
}

export const FICO_RECONCILIATION_TYPES = [
    'AP',
    'AR',
    'GRIR',
    'BANK',
    'ASSET',
    'TAX',
] as const
export type FicoReconciliationType =
    (typeof FICO_RECONCILIATION_TYPES)[number]

export const FICO_ACCOUNT_TYPE_SCOPES = ['ALL', ...FICO_ACCOUNT_TYPES] as const

export const FICO_DEFAULT_CLOSE_CHECKLIST = [
    'All unposted source documents reviewed',
    'GR/IR clearing reviewed (balances alone do not block closing)',
    'Trial balance reviewed and balanced',
] as const

export const FICO_PHILIPPINES_DEFAULTS = {
    baseCurrency: 'PHP',
    countryCode: 'PH',
    timezone: 'Asia/Manila',
    accountingMethod: 'ACCRUAL' as const,
    taxCountryCode: 'PH',
    taxJurisdiction: 'Philippines',
    documentNumberPrefix: 'JE',
    documentNumberPadding: 6,
    fiscalStartMonth: 1,
    fiscalStartDay: 1,
    normalPeriodCount: 12,
    specialPeriodCount: 4,
} as const

/** Fields that define the accounting structure and freeze once activated or used. */
export const FICO_SETTINGS_STRUCTURAL_FIELDS = [
    'baseCurrency',
    'countryCode',
    'timezone',
    'accountingMethod',
    'chartOfAccountsId',
    'fiscalYearVariantId',
    'postingPeriodVariantId',
] as const

/**
 * Default G/L account slots configured on the company accounting settings.
 * `expectedType` drives a validation warning (never a hard block) so a chart
 * that classifies an account differently can still be configured.
 */
export const FICO_DEFAULT_ACCOUNT_SLOTS = [
    {
        key: 'defaultRetainedEarningsAccountId',
        relation: 'defaultRetainedEarningsAccount',
        label: 'Default retained earnings',
        expectedType: 'EQUITY',
    },
    {
        key: 'defaultCashAccountId',
        relation: 'defaultCashAccount',
        label: 'Default cash',
        expectedType: 'ASSET',
    },
    {
        key: 'defaultReceivableAccountId',
        relation: 'defaultReceivableAccount',
        label: 'Default accounts receivable',
        expectedType: 'ASSET',
    },
    {
        key: 'defaultPayableAccountId',
        relation: 'defaultPayableAccount',
        label: 'Default accounts payable',
        expectedType: 'LIABILITY',
    },
    {
        key: 'defaultInventoryAccountId',
        relation: 'defaultInventoryAccount',
        label: 'Default inventory',
        expectedType: 'ASSET',
    },
    {
        key: 'defaultSalesRevenueAccountId',
        relation: 'defaultSalesRevenueAccount',
        label: 'Default sales revenue',
        expectedType: 'REVENUE',
    },
    {
        key: 'defaultCostOfGoodsSoldAccountId',
        relation: 'defaultCostOfGoodsSoldAccount',
        label: 'Default cost of goods sold',
        expectedType: 'EXPENSE',
    },
    {
        key: 'defaultTaxInputAccountId',
        relation: 'defaultTaxInputAccount',
        label: 'Default tax input',
        expectedType: 'ASSET',
    },
    {
        key: 'defaultTaxOutputAccountId',
        relation: 'defaultTaxOutputAccount',
        label: 'Default tax output',
        expectedType: 'LIABILITY',
    },
] as const

export type FicoDefaultAccountSlot =
    (typeof FICO_DEFAULT_ACCOUNT_SLOTS)[number]['key']

export const FICO_AUDIT_ACTIONS = {
    COMPANY_SETTINGS_CREATE: 'COMPANY_SETTINGS_CREATE',
    COMPANY_SETTINGS_UPDATE: 'COMPANY_SETTINGS_UPDATE',
    COMPANY_SETTINGS_ACTIVATE: 'COMPANY_SETTINGS_ACTIVATE',
    COMPANY_SETTINGS_DEACTIVATE: 'COMPANY_SETTINGS_DEACTIVATE',
    COMPANY_SETTINGS_DELETE: 'COMPANY_SETTINGS_DELETE',
    CHART_CREATE: 'CHART_CREATE',
    CHART_UPDATE: 'CHART_UPDATE',
    CHART_DUPLICATE: 'CHART_DUPLICATE',
    CHART_STATUS_CHANGE: 'CHART_STATUS_CHANGE',
    GROUP_CREATE: 'GROUP_CREATE',
    GROUP_UPDATE: 'GROUP_UPDATE',
    GROUP_DELETE: 'GROUP_DELETE',
    GL_ACCOUNT_CREATE: 'GL_ACCOUNT_CREATE',
    GL_ACCOUNT_UPDATE: 'GL_ACCOUNT_UPDATE',
    GL_ACCOUNT_STATUS_CHANGE: 'GL_ACCOUNT_STATUS_CHANGE',
    GL_ACCOUNT_DELETE: 'GL_ACCOUNT_DELETE',
    GL_ACCOUNT_IMPORT: 'GL_ACCOUNT_IMPORT',
    COMPANY_GL_ASSIGNMENT_UPSERT: 'COMPANY_GL_ASSIGNMENT_UPSERT',
    COMPANY_GL_ASSIGNMENT_DELETE: 'COMPANY_GL_ASSIGNMENT_DELETE',
    FISCAL_VARIANT_CREATE: 'FISCAL_VARIANT_CREATE',
    FISCAL_VARIANT_UPDATE: 'FISCAL_VARIANT_UPDATE',
    FISCAL_VARIANT_DUPLICATE: 'FISCAL_VARIANT_DUPLICATE',
    POSTING_VARIANT_CREATE: 'POSTING_VARIANT_CREATE',
    POSTING_VARIANT_UPDATE: 'POSTING_VARIANT_UPDATE',
    FISCAL_YEAR_GENERATE: 'FISCAL_YEAR_GENERATE',
    ACCOUNT_MAPPING_CREATE: 'ACCOUNT_MAPPING_CREATE',
    ACCOUNT_MAPPING_UPDATE: 'ACCOUNT_MAPPING_UPDATE',
    ACCOUNT_MAPPING_DELETE: 'ACCOUNT_MAPPING_DELETE',
    PERIOD_OPEN: 'PERIOD_OPEN',
    PERIOD_RESTRICT: 'PERIOD_RESTRICT',
    PERIOD_CLOSE: 'PERIOD_CLOSE',
    PERIOD_LOCK: 'PERIOD_LOCK',
    PERIOD_REOPEN: 'PERIOD_REOPEN',
    PERIOD_UNLOCK: 'PERIOD_UNLOCK',
    PERIOD_UPDATE: 'PERIOD_UPDATE',
} as const

export function formatFicoPeriodKey(
    fiscalYear: number,
    periodNumber: number,
): string {
    return `${fiscalYear}-${String(periodNumber).padStart(2, '0')}`
}

/**
 * Business modules that can own an auto-posting. The raw `sourceModule` stored
 * on `mm_accounting_events` is the granular producer stream (STOCK_OPS,
 * INBOUND, VALUATION, …); the posting monitor groups those streams into the
 * module an operator recognises and can filter on.
 */
export const FICO_POSTING_MODULES = ['MM', 'SD', 'PP', 'OTHER'] as const
export type FicoPostingModule = (typeof FICO_POSTING_MODULES)[number]

export const FICO_POSTING_MODULE_LABELS: Record<FicoPostingModule, string> = {
    MM: 'Materials Management',
    SD: 'Sales & Distribution',
    PP: 'Production Planning',
    OTHER: 'Other sources',
}

export const FICO_POSTING_MODULE_SOURCES: Record<
    Exclude<FicoPostingModule, 'OTHER'>,
    readonly string[]
> = {
    MM: [
        'MM',
        'STOCK_OPS',
        'INVENTORY',
        'INVENTORY_CONTROL',
        'INBOUND',
        'QUALITY',
        'VALUATION',
        'WAREHOUSE',
        'RETURNS_DISPOSAL',
        'THREE_WAY_MATCH',
        'MATERIAL_MASTER',
    ],
    SD: ['SD'],
    PP: ['PP', 'PRODUCTION'],
}

/** Owning module for a stored source stream; anything unlisted is `OTHER`. */
export function ficoPostingModuleOf(
    sourceModule: string | null | undefined,
): FicoPostingModule {
    const code = sourceModule?.trim().toUpperCase()
    if (!code) return 'OTHER'
    for (const [module, sources] of Object.entries(FICO_POSTING_MODULE_SOURCES)) {
        if (sources.includes(code)) return module as FicoPostingModule
    }
    return 'OTHER'
}

/** Source streams behind a module filter; `null` means "everything else". */
export function ficoPostingModuleSources(
    module: string,
): readonly string[] | null {
    const key = module.trim().toUpperCase()
    if (key === 'OTHER') return null
    return (
        FICO_POSTING_MODULE_SOURCES[key as Exclude<FicoPostingModule, 'OTHER'>] ?? null
    )
}

/** Every source stream claimed by a known module. */
export const FICO_POSTING_MODULE_KNOWN_SOURCES = Object.values(
    FICO_POSTING_MODULE_SOURCES,
).flat()

export function isFicoAccountType(value: string): value is FicoAccountType {
    return (FICO_ACCOUNT_TYPES as readonly string[]).includes(value)
}

export function isFicoPeriodStatus(value: string): value is FicoPeriodStatus {
    return (FICO_PERIOD_STATUSES as readonly string[]).includes(value)
}

/** Number Ranges (FICO Phase 2) constants. */

export const FICO_NUMBER_RANGE_STATUSES = ['ACTIVE', 'INACTIVE', 'EXHAUSTED'] as const
export type FicoNumberRangeStatus = (typeof FICO_NUMBER_RANGE_STATUSES)[number]

export const FICO_NUMBER_RANGE_NUMBERING_METHODS = ['INTERNAL', 'EXTERNAL'] as const
export type FicoNumberRangeNumberingMethod = (typeof FICO_NUMBER_RANGE_NUMBERING_METHODS)[number]

export const FICO_NUMBER_RANGE_ASSIGNMENT_TYPES = ['INTERNAL', 'EXTERNAL'] as const
export type FicoNumberRangeAssignmentType = (typeof FICO_NUMBER_RANGE_ASSIGNMENT_TYPES)[number]

export const FICO_NUMBER_RANGE_RESET_FREQUENCIES = ['NEVER', 'ANNUALLY', 'PER_FISCAL_YEAR'] as const
export type FicoNumberRangeResetFrequency = (typeof FICO_NUMBER_RANGE_RESET_FREQUENCIES)[number]

export const FICO_NUMBER_RANGE_AUDIT_ACTIONS = {
    NUMBER_RANGE_CREATE: 'NUMBER_RANGE_CREATE',
    NUMBER_RANGE_UPDATE: 'NUMBER_RANGE_UPDATE',
    NUMBER_RANGE_ACTIVATE: 'NUMBER_RANGE_ACTIVATE',
    NUMBER_RANGE_DEACTIVATE: 'NUMBER_RANGE_DEACTIVATE',
    NUMBER_RANGE_DELETE: 'NUMBER_RANGE_DELETE',
    NUMBER_RANGE_ALLOCATE: 'NUMBER_RANGE_ALLOCATE',
} as const

export function isFicoNumberRangeStatus(value: string): value is FicoNumberRangeStatus {
    return (FICO_NUMBER_RANGE_STATUSES as readonly string[]).includes(value)
}

export function isFicoNumberRangeNumberingMethod(value: string): value is FicoNumberRangeNumberingMethod {
    return (FICO_NUMBER_RANGE_NUMBERING_METHODS as readonly string[]).includes(value)
}

export function isFicoNumberRangeResetFrequency(value: string): value is FicoNumberRangeResetFrequency {
    return (FICO_NUMBER_RANGE_RESET_FREQUENCIES as readonly string[]).includes(value)
}

/** Format a number with zero padding, e.g. prefix='JE-', seq=26, padding=6 → 'JE-000026'. */
export function formatFicoNumber(
    prefix: string,
    sequence: number,
    padding: number,
    suffix: string = '',
): string {
    const padded = String(sequence).padStart(padding, '0')
    return `${prefix}${padded}${suffix}`
}

/** -------------------------------------------------------------------------- */
/*  FICO Phase 2 — Tax Code constants                                         */
/* -------------------------------------------------------------------------- */

export const FICO_TAX_CODE_CATEGORIES = [
    'SALES_TAX',
    'PURCHASE_TAX',
    'INPUT_TAX',
    'OUTPUT_TAX',
    'WITHHOLDING_TAX',
    'OTHER_TAX',
] as const
export type FicoTaxCodeCategory = (typeof FICO_TAX_CODE_CATEGORIES)[number]

export const FICO_TAX_CODE_TYPES = [
    'VAT',
    'PERCENTAGE_TAX',
    'WITHHOLDING_TAX',
    'ZERO_RATED_TAX',
    'EXEMPT_TAX',
    'NON_TAXABLE',
    'OTHER_TAX',
] as const
export type FicoTaxCodeType = (typeof FICO_TAX_CODE_TYPES)[number]

export const FICO_TAX_CODE_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE'] as const
export type FicoTaxCodeStatus = (typeof FICO_TAX_CODE_STATUSES)[number]

export const FICO_TAX_RATE_UNITS = ['PERCENTAGE', 'FIXED_AMOUNT'] as const
export type FicoTaxRateUnit = (typeof FICO_TAX_RATE_UNITS)[number]

export const FICO_TAX_CALCULATION_METHODS = ['TAX_EXCLUSIVE', 'TAX_INCLUSIVE', 'NOT_APPLICABLE'] as const
export type FicoTaxCalculationMethod = (typeof FICO_TAX_CALCULATION_METHODS)[number]

export const FICO_TAX_ROUNDING_METHODS = ['HALF_UP', 'HALF_DOWN', 'HALF_EVEN', 'UP', 'DOWN'] as const
export type FicoTaxRoundingMethod = (typeof FICO_TAX_ROUNDING_METHODS)[number]

export const FICO_TAX_ROUNDING_LEVELS = ['PER_LINE_ITEM', 'PER_DOCUMENT'] as const
export type FicoTaxRoundingLevel = (typeof FICO_TAX_ROUNDING_LEVELS)[number]

export const FICO_TAX_RATE_STATUSES = ['ACTIVE', 'INACTIVE', 'EXPIRED', 'SCHEDULED'] as const
export type FicoTaxRateStatus = (typeof FICO_TAX_RATE_STATUSES)[number]

/** Transaction types a tax code can be filtered/validated against. */
export const FICO_TAX_APPLICATION_TYPES = [
    'SALES',
    'PURCHASE',
    'SERVICE',
    'INVENTORY',
    'CUSTOMER_INVOICE',
    'SUPPLIER_INVOICE',
    'INVENTORY_PURCHASE',
    'OTHER',
] as const
export type FicoTaxApplicationType = (typeof FICO_TAX_APPLICATION_TYPES)[number]

export const FICO_TAX_AUDIT_ACTIONS = {
    TAX_CODE_CREATE: 'TAX_CODE_CREATE',
    TAX_CODE_UPDATE: 'TAX_CODE_UPDATE',
    TAX_CODE_ACTIVATE: 'TAX_CODE_ACTIVATE',
    TAX_CODE_DEACTIVATE: 'TAX_CODE_DEACTIVATE',
    TAX_CODE_DELETE: 'TAX_CODE_DELETE',
    TAX_CODE_RATE_CREATE: 'TAX_CODE_RATE_CREATE',
    TAX_CODE_RATE_UPDATE: 'TAX_CODE_RATE_UPDATE',
    TAX_CODE_RATE_DEACTIVATE: 'TAX_CODE_RATE_DEACTIVATE',
    TAX_CODE_DUPLICATE: 'TAX_CODE_DUPLICATE',
} as const

export function isFicoTaxCodeCategory(value: string): value is FicoTaxCodeCategory {
    return (FICO_TAX_CODE_CATEGORIES as readonly string[]).includes(value)
}

export function isFicoTaxCodeType(value: string): value is FicoTaxCodeType {
    return (FICO_TAX_CODE_TYPES as readonly string[]).includes(value)
}

export function isFicoTaxCodeStatus(value: string): value is FicoTaxCodeStatus {
    return (FICO_TAX_CODE_STATUSES as readonly string[]).includes(value)
}

export function isFicoTaxRateUnit(value: string): value is FicoTaxRateUnit {
    return (FICO_TAX_RATE_UNITS as readonly string[]).includes(value)
}

export function isFicoTaxCalculationMethod(value: string): value is FicoTaxCalculationMethod {
    return (FICO_TAX_CALCULATION_METHODS as readonly string[]).includes(value)
}

export function isFicoTaxRoundingMethod(value: string): value is FicoTaxRoundingMethod {
    return (FICO_TAX_ROUNDING_METHODS as readonly string[]).includes(value)
}

export function isFicoTaxRoundingLevel(value: string): value is FicoTaxRoundingLevel {
    return (FICO_TAX_ROUNDING_LEVELS as readonly string[]).includes(value)
}

export function isFicoTaxRateStatus(value: string): value is FicoTaxRateStatus {
    return (FICO_TAX_RATE_STATUSES as readonly string[]).includes(value)
}

// ============================================================================
// FICO Phase 2 - Document Types
// ============================================================================

/** Accounting document classification (document category). */
export const FICO_DOCUMENT_CATEGORIES = [
    'GENERAL_JOURNAL',
    'ADJUSTMENT',
    'VENDOR_INVOICE',
    'VENDOR_CREDIT',
    'VENDOR_PAYMENT',
    'CUSTOMER_INVOICE',
    'CUSTOMER_CREDIT',
    'CUSTOMER_RECEIPT',
    'ASSET_ACCOUNTING',
    'REVERSAL',
    'INVENTORY_ACCOUNTING',
    'SALES_ACCOUNTING',
    'OTHER',
] as const
export type FicoDocumentCategory = (typeof FICO_DOCUMENT_CATEGORIES)[number]

export const FICO_DOCUMENT_CATEGORY_LABELS: Record<FicoDocumentCategory, string> = {
    GENERAL_JOURNAL: 'General Journal',
    ADJUSTMENT: 'Adjustment',
    VENDOR_INVOICE: 'Vendor Invoice',
    VENDOR_CREDIT: 'Vendor Credit',
    VENDOR_PAYMENT: 'Vendor Payment',
    CUSTOMER_INVOICE: 'Customer Invoice',
    CUSTOMER_CREDIT: 'Customer Credit',
    CUSTOMER_RECEIPT: 'Customer Receipt',
    ASSET_ACCOUNTING: 'Asset Accounting',
    REVERSAL: 'Reversal',
    INVENTORY_ACCOUNTING: 'Inventory Accounting',
    SALES_ACCOUNTING: 'Sales Accounting',
    OTHER: 'Other',
}

/** Account classifications a document type may reference. Not G/L account types. */
export const FICO_DOCUMENT_ACCOUNT_TYPES = [
    'GL_ACCOUNT',
    'VENDOR',
    'CUSTOMER',
    'ASSET',
    'BANK',
    'INVENTORY',
] as const
export type FicoDocumentAccountType = (typeof FICO_DOCUMENT_ACCOUNT_TYPES)[number]

export const FICO_DOCUMENT_ACCOUNT_TYPE_LABELS: Record<FicoDocumentAccountType, string> = {
    GL_ACCOUNT: 'G/L Account',
    VENDOR: 'Vendor',
    CUSTOMER: 'Customer',
    ASSET: 'Asset',
    BANK: 'Bank',
    INVENTORY: 'Inventory',
}

export const FICO_DOCUMENT_TYPE_STATUSES = ['ACTIVE', 'INACTIVE'] as const
export type FicoDocumentTypeStatus = (typeof FICO_DOCUMENT_TYPE_STATUSES)[number]

export const FICO_DOCUMENT_NUMBER_ASSIGNMENTS = ['INTERNAL', 'EXTERNAL'] as const
export type FicoDocumentNumberAssignment =
    (typeof FICO_DOCUMENT_NUMBER_ASSIGNMENTS)[number]

export const FICO_DOCUMENT_TYPE_AUDIT_ACTIONS = {
    DOCUMENT_TYPE_CREATE: 'DOCUMENT_TYPE_CREATE',
    DOCUMENT_TYPE_UPDATE: 'DOCUMENT_TYPE_UPDATE',
    DOCUMENT_TYPE_ACTIVATE: 'DOCUMENT_TYPE_ACTIVATE',
    DOCUMENT_TYPE_DEACTIVATE: 'DOCUMENT_TYPE_DEACTIVATE',
    DOCUMENT_TYPE_DELETE: 'DOCUMENT_TYPE_DELETE',
} as const

// ============================================================================
// FICO Phase 2 - Journal Entry Approval Workflow
// ============================================================================

export const FICO_JOURNAL_APPROVAL_STATUSES = [
    'DRAFT',
    'PENDING_APPROVAL',
    'APPROVED',
    'POSTED',
    'REJECTED',
    'REVERSED',
] as const
export type FicoJournalApprovalStatus =
    (typeof FICO_JOURNAL_APPROVAL_STATUSES)[number]

export const FICO_JOURNAL_APPROVAL_LABELS: Record<
    FicoJournalApprovalStatus,
    string
> = {
    DRAFT: 'Draft',
    PENDING_APPROVAL: 'Pending Approval',
    APPROVED: 'Approved',
    POSTED: 'Posted',
    REJECTED: 'Rejected',
    REVERSED: 'Reversed',
}

export const FICO_JOURNAL_APPROVAL_TRANSITIONS: Record<
    string,
    string[]
> = {
    DRAFT: ['PENDING_APPROVAL'],
    PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
    REJECTED: ['PENDING_APPROVAL'],
    APPROVED: ['POSTED'],
    POSTED: ['REVERSED'],
    REVERSED: [],
} as const

export const FICO_JOURNAL_APPROVAL_AUDIT_ACTIONS = {
    SUBMIT: 'JOURNAL_SUBMIT',
    APPROVE: 'JOURNAL_APPROVE',
    REJECT: 'JOURNAL_REJECT',
    RESUBMIT: 'JOURNAL_RESUBMIT',
    POST: 'JOURNAL_POST_APPROVED',
} as const

export function isFicoJournalApprovalStatus(
    value: string,
): value is FicoJournalApprovalStatus {
    return (FICO_JOURNAL_APPROVAL_STATUSES as readonly string[]).includes(
        value,
    )
}

export function isValidJournalApprovalTransition(
    from: string,
    to: string,
): boolean {
    return (
        FICO_JOURNAL_APPROVAL_TRANSITIONS[from]?.includes(to) ?? false
    )
}

/**
 * Accepted Number Range `documentCategory` values per document category.
 * Exact normalized matches always pass; these aliases cover the seeded and
 * commonly configured range categories without constraining custom ranges.
 */
export const FICO_DOCUMENT_NUMBER_RANGE_ALIASES: Record<
    FicoDocumentCategory,
    readonly string[]
> = {
    GENERAL_JOURNAL: ['GENERAL_JOURNAL', 'JOURNAL_ENTRY', 'JE'],
    ADJUSTMENT: ['ADJUSTMENT', 'JOURNAL_ENTRY', 'JE'],
    VENDOR_INVOICE: ['VENDOR_INVOICE', 'SUPPLIER_INVOICE', 'AP', 'ACCOUNTS_PAYABLE'],
    VENDOR_CREDIT: ['VENDOR_CREDIT', 'SUPPLIER_INVOICE', 'SUPPLIER_CREDIT', 'AP', 'ACCOUNTS_PAYABLE'],
    VENDOR_PAYMENT: ['VENDOR_PAYMENT', 'SUPPLIER_INVOICE', 'AP', 'ACCOUNTS_PAYABLE'],
    CUSTOMER_INVOICE: ['CUSTOMER_INVOICE', 'AR', 'ACCOUNTS_RECEIVABLE'],
    CUSTOMER_CREDIT: ['CUSTOMER_CREDIT', 'CUSTOMER_INVOICE', 'AR', 'ACCOUNTS_RECEIVABLE'],
    CUSTOMER_RECEIPT: ['CUSTOMER_RECEIPT', 'CUSTOMER_INVOICE', 'AR', 'ACCOUNTS_RECEIVABLE'],
    ASSET_ACCOUNTING: ['ASSET_ACCOUNTING', 'ASSET', 'AA'],
    REVERSAL: ['REVERSAL', 'JOURNAL_ENTRY', 'JE'],
    INVENTORY_ACCOUNTING: ['INVENTORY_ACCOUNTING', 'INVENTORY', 'MM', 'MATERIALS_MANAGEMENT'],
    SALES_ACCOUNTING: ['SALES_ACCOUNTING', 'SALES', 'SD'],
    OTHER: [],
}

/** Normalize free-text categories from Number Ranges for comparison. */
export function normalizeFicoDocumentCategory(value: string): string {
    return value
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, '_')
}

export function isFicoDocumentCategory(
    value: string,
): value is FicoDocumentCategory {
    return (FICO_DOCUMENT_CATEGORIES as readonly string[]).includes(value)
}

export function isFicoDocumentAccountType(
    value: string,
): value is FicoDocumentAccountType {
    return (FICO_DOCUMENT_ACCOUNT_TYPES as readonly string[]).includes(value)
}

export function isFicoDocumentTypeStatus(
    value: string,
): value is FicoDocumentTypeStatus {
    return (FICO_DOCUMENT_TYPE_STATUSES as readonly string[]).includes(value)
}

export function isFicoDocumentNumberAssignment(
    value: string,
): value is FicoDocumentNumberAssignment {
    return (FICO_DOCUMENT_NUMBER_ASSIGNMENTS as readonly string[]).includes(value)
}

/** Exact match, or the range category is an accepted alias for the document category. */
export function isFicoDocumentNumberRangeCompatible(
    documentCategory: string,
    numberRangeDocumentCategory: string,
): boolean {
    const normalizedRange = normalizeFicoDocumentCategory(
        numberRangeDocumentCategory,
    )
    if (!isFicoDocumentCategory(documentCategory)) {
        return false
    }
    if (normalizeFicoDocumentCategory(documentCategory) === normalizedRange) {
        return true
    }
    return FICO_DOCUMENT_NUMBER_RANGE_ALIASES[documentCategory].includes(
        normalizedRange,
    )
}
