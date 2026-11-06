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
