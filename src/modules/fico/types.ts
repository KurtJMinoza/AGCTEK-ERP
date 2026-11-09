export type FicoCompany = {
    id: string
    code: string
    name: string
    tin?: string | null
}

export type FicoChartRef = {
    id: string
    code: string
    name: string
    status?: string
}

export type FicoCompanySettings = {
    id: string
    companyId: string
    legalName: string
    baseCurrency: string
    groupCurrency: string | null
    countryCode: string
    timezone: string
    accountingMethod: string
    chartOfAccountsId: string | null
    chartOfAccounts?: FicoChartRef | null
    fiscalYearVariantId: string | null
    fiscalYearVariant?: FicoChartRef | null
    postingPeriodVariantId: string | null
    postingPeriodVariant?: FicoChartRef | null
    accountDeterminationProfileId: string | null
    status: 'DRAFT' | 'ACTIVE' | 'INACTIVE'
    taxCountryCode: string | null
    taxRegistrationNumber: string | null
    taxJurisdiction: string | null
    defaultTaxCode: string | null
    defaultRetainedEarningsAccountId: string | null
    defaultRetainedEarningsAccount?: FicoGlAccountRef | null
    defaultCashAccountId: string | null
    defaultCashAccount?: FicoGlAccountRef | null
    defaultReceivableAccountId: string | null
    defaultReceivableAccount?: FicoGlAccountRef | null
    defaultPayableAccountId: string | null
    defaultPayableAccount?: FicoGlAccountRef | null
    defaultInventoryAccountId: string | null
    defaultInventoryAccount?: FicoGlAccountRef | null
    defaultSalesRevenueAccountId: string | null
    defaultSalesRevenueAccount?: FicoGlAccountRef | null
    defaultCostOfGoodsSoldAccountId: string | null
    defaultCostOfGoodsSoldAccount?: FicoGlAccountRef | null
    defaultTaxInputAccountId: string | null
    defaultTaxInputAccount?: FicoGlAccountRef | null
    defaultTaxOutputAccountId: string | null
    defaultTaxOutputAccount?: FicoGlAccountRef | null
    documentNumberPrefix: string
    documentNumberPadding: number
    allowNegativePostings: boolean
    backdatedPostingAllowed: boolean
    maxBackdatedPostingDays: number | null
    activatedAt?: string | null
    deactivatedAt?: string | null
    updatedAt?: string
}

export type FicoGlAccountRef = {
    id: string
    accountCode: string
    accountName: string
    accountType: string
    status: string
    chartOfAccountsId: string
    isPostingAccount: boolean
}

export type FicoCompanySettingsRow = {
    company: FicoCompany
    settings: FicoCompanySettings | null
    status: string
}

export type FicoChart = {
    id: string
    code: string
    name: string
    description: string
    countryCode: string
    accountCodeLength: number | null
    status: string
    createdAt?: string
    updatedAt?: string
    _count?: { groups: number; accounts: number; settings: number }
    groups?: FicoAccountGroup[]
}

export type FicoAccountGroup = {
    id: string
    chartOfAccountsId: string
    parentGroupId: string | null
    code: string
    name: string
    category: string
    rangeFrom: string | null
    rangeTo: string | null
    sortOrder: number
    status: string
    _count?: { accounts: number; children: number }
}

export type FicoGlAccount = {
    id: string
    chartOfAccountsId: string
    chartOfAccounts?: FicoChartRef
    accountGroupId: string
    accountGroup?: FicoAccountGroup
    accountCode: string
    accountName: string
    description: string
    accountType: string
    normalBalance: string
    isPostingAccount: boolean
    allowManualPosting: boolean
    allowAutomaticPosting: boolean
    isReconciliationAccount: boolean
    reconciliationType: string | null
    openItemManagement: boolean
    currencyRestriction: string | null
    status: string
    companyAssignments?: FicoCompanyGlAccount[]
    usage?: {
        journalLines: number
        debitMappings: number
        creditMappings: number
        companyAssignments?: number
        total: number
    }
}

export type FicoCompanyGlAccount = {
    id: string
    companyId: string
    glAccountId: string
    postingEnabled: boolean
    manualPostingBlocked: boolean
    effectiveFrom: string | null
    effectiveTo: string | null
    company?: FicoCompany
    glAccount?: FicoGlAccount
}

export type FicoFiscalVariant = {
    id: string
    code: string
    name: string
    description: string
    startMonth: number
    startDay: number
    normalPeriodCount: number
    specialPeriodCount: number
    calendarYearBased: boolean
    yearAssignment: 'YEAR_START' | 'YEAR_END'
    /** Derived server-side from the start date and period count. */
    endMonth?: number
    endDay?: number
    periodType?: string
    status: string
    _count?: { periods: number; settings: number }
}

export type FicoFiscalYearPreview = {
    fiscalYear: number
    fiscalYearVariantId: string | null
    yearAssignment: 'YEAR_START' | 'YEAR_END'
    periodType: string
    normalPeriodCount: number
    specialPeriodCount: number
    startDate: string
    endDate: string
    periods: Array<{
        fiscalYear: number
        periodNumber: number
        name: string
        periodType: 'NORMAL' | 'SPECIAL'
        startDate: string
        endDate: string
        isYearEndAdjustment: boolean
    }>
}

export type FicoAccountingEventStatus = 'PENDING' | 'CONSUMED' | 'FAILED'

/** Business module that owns an auto-posting; `OTHER` covers unclaimed streams. */
export type FicoPostingModule = 'MM' | 'SD' | 'PP' | 'OTHER'

export type FicoAccountingEvent = {
    id: string
    eventType: string
    sourceModule: string
    module: FicoPostingModule
    documentType: string
    documentId: string
    postingDate: string | null
    currencyCode: string | null
    totalValue: string | null
    accountingEffects: string[] | null
    status: FicoAccountingEventStatus
    errorSummary: string | null
    createdAt: string
    consumedAt: string | null
    journal: {
        id: string
        documentNumber: string | null
        status: string
        postingDate: string
    } | null
}

export type FicoAccountingEventDetail = FicoAccountingEvent & {
    companyId: string | null
    idempotencyKey: string | null
    sourceEventId: string | null
    sourceTransactionId: string | null
    lastError: string | null
    lines: Array<{
        materialId?: string
        warehouseId?: string | null
        movementType?: string
        quantity?: number
        unitCost?: number
        totalCost?: number
        valuationClassCode?: string | null
    }>
}

export type FicoAccountingEventList = {
    items: FicoAccountingEvent[]
    total: number
    page: number
    pageSize: number
    summary: {
        byStatus: Partial<Record<FicoAccountingEventStatus, number>>
        bySource: Array<{
            sourceModule: string
            module: FicoPostingModule
            count: number
        }>
        byModule: Array<{ module: FicoPostingModule; count: number }>
        oldestPendingAt: string | null
    }
}

export type FicoMappingAccount = {
    id: string
    accountCode: string
    accountName: string
    accountType: string
    status: string
}

export type FicoTransactionKey = {
    code: string
    name: string
    description: string
    requiresValuationClass: boolean
    inventorySide: string
    status: string
    /** True when an MM event resolves to this key today. */
    postsAutomatically: boolean
    activeMappings: number
    hasDefaultMapping: boolean
}

export type FicoAccountMapping = {
    id: string
    companyId: string
    profileId: string
    transactionKeyCode: string
    valuationClassId: string | null
    valuationScopeKey: string
    debitAccountId: string
    creditAccountId: string
    effectiveFrom: string | null
    effectiveTo: string | null
    status: string
    debitAccount: FicoMappingAccount
    creditAccount: FicoMappingAccount
    valuationClass: { id: string; code: string; name: string } | null
}

export type FicoAccountDetermination = {
    companyId: string
    settings: {
        status: string
        chartOfAccounts: { id: string; code: string; name: string } | null
        profile: { id: string; code: string; name: string; status: string } | null
    } | null
    valuationClasses: Array<{ id: string; code: string; name: string }>
    transactionKeys: FicoTransactionKey[]
    mappings: FicoAccountMapping[]
}

export type FicoGlAccountUsage = {
    account: {
        id: string
        accountCode: string
        accountName: string
        normalBalance: string
        chartOfAccounts?: { code: string }
    }
    journalLines: {
        items: Array<{
            id: string
            lineNumber: number
            debitAmount: string | number
            creditAmount: string | number
            currency: string
            description: string | null
            company?: { code: string; name: string } | null
            journalEntry: {
                id: string
                documentNumber: string | null
                documentType: string
                postingDate: string
                status: string
                description: string | null
                sourceModule: string | null
                sourceDocumentType: string | null
                reversalOfId: string | null
            }
        }>
        shown: number
        total: number
        hiddenByCompanyScope: number
        debitTotal: string
        creditTotal: string
    }
    mappings: Array<{
        id: string
        transactionKeyCode: string
        valuationScopeKey: string
        status: string
        side: 'DEBIT' | 'CREDIT' | 'BOTH'
        transactionKey?: { name: string } | null
        profile?: { code: string } | null
        company?: { code: string; name: string } | null
    }>
}

export type FicoGlImportRow = {
    accountCode: string
    accountName: string
    accountGroupCode: string
    accountType?: string
    normalBalance?: string
    description?: string
    isPostingAccount?: boolean
    allowManualPosting?: boolean
    isReconciliationAccount?: boolean
    reconciliationType?: string | null
}

export type FicoGlImportStatus =
    | 'CREATE'
    | 'DUPLICATE_EXISTING'
    | 'DUPLICATE_IN_FILE'
    | 'ERROR'

export type FicoGlImportReport = {
    chartOfAccountsId: string
    dryRun: boolean
    committed: boolean
    summary: Record<FicoGlImportStatus, number> & { total: number }
    rows: Array<{
        rowNumber: number
        accountCode: string
        status: FicoGlImportStatus
        message?: string
    }>
}

export type FicoPostingVariant = {
    id: string
    code: string
    name: string
    description: string
    allowSpecialPeriods: boolean
    closeChecklist: Record<string, unknown> | null
    status: string
    _count?: { settings: number }
}

export type FicoPeriod = {
    id: string
    companyId: string
    fiscalYear: number
    periodNumber: number
    name: string
    periodType: 'NORMAL' | 'SPECIAL'
    startDate: string
    endDate: string
    status: 'FUTURE' | 'OPEN' | 'RESTRICTED' | 'CLOSED' | 'LOCKED'
    statusReason: string | null
    remarks: string | null
    closingDate: string | null
    lockDate: string | null
    reopenedAt: string | null
    reopenedBy: string | null
    isYearEndAdjustment: boolean
    openedAt: string | null
    openedBy?: string | null
    closedAt: string | null
    closedBy: string | null
    lockedAt: string | null
    lockedBy?: string | null
    fiscalYearVariant?: FicoFiscalVariant | null
    _count?: { journalEntries: number }
}

export type FicoPeriodDetail = FicoPeriod & {
    company?: FicoCompany
}

export type FicoPeriodHistoryEntry = {
    id: string
    action: string
    fromStatus: string | null
    toStatus: string | null
    reason: string | null
    actorId: string | null
    createdAt: string
}

export type FicoPeriodSummary = {
    companyId: string
    fiscalYear: number | null
    generatedPeriods: number
    normalPeriods: number
    specialPeriods: number
    periodsWithPostings: number
    journalEntries: number
    byStatus: Record<string, number>
    totals: {
        open: number
        restricted: number
        closed: number
        locked: number
        future: number
    }
    currentPeriod: Pick<
        FicoPeriod,
        | 'id'
        | 'fiscalYear'
        | 'periodNumber'
        | 'name'
        | 'startDate'
        | 'endDate'
        | 'status'
    > | null
    firstPeriod: Pick<FicoPeriod, 'id' | 'fiscalYear' | 'periodNumber'> | null
    lastPeriod: Pick<FicoPeriod, 'id' | 'fiscalYear' | 'periodNumber'> | null
    nextClosingPeriod:
        | Pick<FicoPeriod, 'id' | 'fiscalYear' | 'periodNumber' | 'status'>
        | null
}

export type FicoFiscalYearSummary = {
    fiscalYear: number
    periodCount: number
    normalCount: number
    specialCount: number
    statuses: Record<string, number>
    firstStartDate: string
    lastEndDate: string
    periods: FicoPeriod[]
}

export type FicoAuditEntry = {
    id: string
    companyId: string | null
    actorId: string | null
    action: string
    entityType: string
    entityId: string | null
    previousValues: Record<string, unknown> | null
    newValues: Record<string, unknown> | null
    reason: string | null
    metadata: Record<string, unknown> | null
    createdAt: string
}

export type FicoOverview = {
    companyId: string
    settings: FicoCompanySettings | null
    metrics: {
        charts: number
        accounts: number
        postingAccounts: number
        journals: number
        periods: number
        periodsByStatus: Record<string, number>
    }
    openPeriods: FicoPeriod[]
    warnings: Array<{
        code: string
        severity: 'warning' | 'error'
        message: string
    }>
    recentActivity: FicoAuditEntry[]
}

export type FicoListResponse<T> = {
    items: T[]
    total: number
    page: number
    pageSize: number
}

export type FicoJournalEntryLineRef = {
    id: string
    lineNumber: number
    glAccountId: string
    companyId: string
    debitAmount: string | number
    creditAmount: string | number
    currency: string
    description: string | null
    glAccount?: {
        id: string
        accountCode: string
        accountName: string
        accountType: string
    } | null
}

export type FicoJournalEntry = {
    id: string
    documentNumber: string | null
    postingDate: string
    documentDate: string | null
    fiscalYear: number | null
    fiscalPeriodId: string | null
    totalAmount: string | number
    currencyCode: string
    status: 'DRAFT' | 'POSTED' | 'REVERSED' | 'LEGACY'
    description: string | null
    documentType: string
    postedAt: string | null
    postedBy: string | null
    createdAt: string
    fiscalPeriod?: {
        id: string
        fiscalYear: number
        periodNumber: number
        name: string
        status: string
    } | null
    lines?: FicoJournalEntryLineRef[]
    _count?: { lines: number }
}

export type FicoJournalEntryDetail = FicoJournalEntry & {
    fiscalPeriod: {
        id: string
        fiscalYear: number
        periodNumber: number
        name: string
        status: string
    } | null
    lines: FicoJournalEntryLineRef[]
}

export type FicoJournalEntryList = {
    items: FicoJournalEntry[]
    total: number
    page: number
    pageSize: number
    totalPages: number
}

export type FicoJournalReversalResult = {
    originalId: string
    originalStatus: string
    reversalId: string
    reversalDocumentNumber: string | null
    reversalPostedAt: string | null
}

// ============================================================================
// FICO Phase 2 — Number Ranges Types
// ============================================================================

export type FicoNumberRangeStatus = 'ACTIVE' | 'INACTIVE' | 'EXHAUSTED'
export type FicoNumberRangeNumberingMethod = 'INTERNAL' | 'EXTERNAL'
export type FicoNumberRangeAssignmentType = 'INTERNAL' | 'EXTERNAL'
export type FicoNumberRangeResetFrequency = 'NEVER' | 'ANNUALLY' | 'PER_FISCAL_YEAR'

export type FicoNumberRange = {
    id: string
    companyId: string
    company?: {
        id: string
        code: string
        name: string
    }
    rangeCode: string
    rangeName: string
    description: string | null
    documentCategory: string
    assignmentType: FicoNumberRangeAssignmentType
    numberingMethod: FicoNumberRangeNumberingMethod
    prefix: string
    suffix: string
    startNumber: number
    endNumber: number
    currentNumber: number
    paddingLength: number
    validFrom: string | null
    validTo: string | null
    fiscalYearId: string | null
    fiscalYear?: {
        id: string
        code: string
        name: string
        status: string
    } | null
    resetFrequency: FicoNumberRangeResetFrequency
    allowManualAssignment: boolean
    allowExternalAssignment: boolean
    allowGaps: boolean
    status: FicoNumberRangeStatus
    remarks: string | null
    createdBy: string | null
    updatedBy: string | null
    createdAt: string
    updatedAt: string
}

export type FicoNumberRangeLog = {
    id: string
    numberRangeId: string
    companyId: string
    fiscalYearId: string | null
    generatedNumber: string
    numericSequence: number
    assignmentMethod: FicoNumberRangeAssignmentType
    documentReference: string | null
    assignedBy: string | null
    assignedAt: string
}

export type FicoNumberRangeListResponse = {
    items: FicoNumberRange[]
    total: number
    page: number
    pageSize: number
}

export type FicoNumberRangeHistoryResponse = {
    items: FicoNumberRangeLog[]
    total: number
    page: number
    pageSize: number
}

export type FicoNumberRangeUtilization = {
    rangeId: string
    rangeCode: string
    totalAllocated: number
    currentSequence: number
    remaining: number
    utilizationPercent: number
    isExhausted: boolean
    startNumber: number
    endNumber: number
}

export type FicoNumberRangeNextNumberResult = {
    generatedNumber: string
    numericSequence: number
    assignmentMethod: FicoNumberRangeAssignmentType
    documentReference: string | null
    assignedAt: string
}

// ============================================================================
// FICO Phase 2 — Tax Codes Types
// ============================================================================

export type FicoTaxCodeCategory =
    | 'SALES_TAX'
    | 'PURCHASE_TAX'
    | 'INPUT_TAX'
    | 'OUTPUT_TAX'
    | 'WITHHOLDING_TAX'
    | 'OTHER_TAX'

export type FicoTaxCodeType =
    | 'VAT'
    | 'PERCENTAGE_TAX'
    | 'WITHHOLDING_TAX'
    | 'ZERO_RATED_TAX'
    | 'EXEMPT_TAX'
    | 'NON_TAXABLE'
    | 'OTHER_TAX'

export type FicoTaxCodeStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE'

export type FicoTaxCodeEffectiveStatus =
    | FicoTaxCodeStatus
    | 'SCHEDULED'
    | 'EXPIRED'

export type FicoTaxRateUnit = 'PERCENTAGE' | 'FIXED_AMOUNT'

export type FicoTaxCalculationMethod = 'TAX_EXCLUSIVE' | 'TAX_INCLUSIVE' | 'NOT_APPLICABLE'

export type FicoTaxRoundingMethod = 'HALF_UP' | 'HALF_DOWN' | 'HALF_EVEN' | 'UP' | 'DOWN'

export type FicoTaxRoundingLevel = 'PER_LINE_ITEM' | 'PER_DOCUMENT'

export type FicoTaxRateStatus = 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'SCHEDULED'

export type FicoTaxRate = {
    id: string
    taxCodeId: string
    companyId: string
    rate: number
    rateUnit: FicoTaxRateUnit
    effectiveFrom: string
    effectiveTo: string | null
    description: string | null
    status: FicoTaxRateStatus
    effectiveStatus?: FicoTaxRateStatus
    createdBy: string | null
    createdAt: string
    updatedAt: string
}

export type FicoTaxCode = {
    id: string
    companyId: string | null
    company?: {
        id: string
        code: string
        name: string
    } | null
    code: string
    name: string
    description: string | null
    taxCategory: FicoTaxCodeCategory
    taxType: FicoTaxCodeType
    taxJurisdiction: string | null
    countryCode: string | null
    calculationMethod: FicoTaxCalculationMethod
    rateUnit: FicoTaxRateUnit
    roundingMethod: FicoTaxRoundingMethod
    decimalPrecision: number
    roundingLevel: FicoTaxRoundingLevel
    calculationPriority: number
    isSalesApplicable: boolean
    isPurchaseApplicable: boolean
    isServiceApplicable: boolean
    isInventoryApplicable: boolean
    isRecoverable: boolean
    inputTaxGlAccountId: string | null
    inputTaxGlAccount?: {
        id: string
        accountCode: string
        accountName: string
        accountType: string
        status: string
    } | null
    outputTaxGlAccountId: string | null
    outputTaxGlAccount?: {
        id: string
        accountCode: string
        accountName: string
        accountType: string
        status: string
    } | null
    withholdingPayableGlAccountId: string | null
    withholdingPayableGlAccount?: {
        id: string
        accountCode: string
        accountName: string
        accountType: string
        status: string
    } | null
    withholdingReceivableGlAccountId: string | null
    withholdingReceivableGlAccount?: {
        id: string
        accountCode: string
        accountName: string
        accountType: string
        status: string
    } | null
    nonRecoverableTaxGlAccountId: string | null
    nonRecoverableTaxGlAccount?: {
        id: string
        accountCode: string
        accountName: string
        accountType: string
        status: string
    } | null
    status: FicoTaxCodeStatus
    remarks: string | null
    createdBy: string | null
    updatedBy: string | null
    createdAt: string
    updatedAt: string
    taxRates?: FicoTaxRate[]
    rateCount?: number
    effectiveStatus?: FicoTaxCodeEffectiveStatus
    currentRate?: FicoTaxRate | null
    nextRate?: FicoTaxRate | null
    latestRate?: FicoTaxRate | null
    effectiveFrom?: string | null
    effectiveTo?: string | null
    effectiveRate?: number | null
    effectiveRateUnit?: FicoTaxRateUnit
}

export type FicoTaxCodeSummary = {
    total: number
    active: number
    inactive: number
    draft: number
    expired: number
    scheduled: number
    upcomingRateChanges: number
    generatedAt: string
}

export type FicoTaxCodeHistoryActor = {
    id: string
    name: string | null
    email: string | null
    userName: string | null
}

export type FicoTaxCodeHistoryItem = FicoTaxCodeAuditEntry & {
    taxCodeId: string
    performer?: FicoTaxCodeHistoryActor | null
}

export type FicoTaxCodeHistoryResponse = {
    items: FicoTaxCodeHistoryItem[]
    total: number
    page: number
    pageSize: number
    taxCode: {
        id: string
        code: string
        name: string
        companyId: string | null
    }
    actions: string[]
    actors?: FicoTaxCodeHistoryActor[]
}

export type FicoTaxRateListResponse = {
    items: FicoTaxRate[]
    total: number
    page: number
    pageSize: number
}

export type FicoTaxCodeListResponse = {
    items: FicoTaxCode[]
    total: number
    page: number
    pageSize: number
}

export type FicoTaxCodeListQuery = {
    companyId?: string
    search?: string
    status?: string
    taxCategory?: string
    taxType?: string
    taxJurisdiction?: string
    countryCode?: string
    calculationMethod?: string
    effectiveDate?: string
    transactionType?: string
    page?: number
    pageSize?: number
}

export type FicoTaxCalculationBreakdown = {
    componentName: string
    lineRate: number
    taxAmount: number
    recoverableAmount: number
    nonRecoverableAmount: number
}

export type FicoTaxCalculationResult = {
    taxCodeId: string
    taxCode: string
    companyId: string
    transactionDate: string
    transactionType: string
    netAmount: number
    taxableBase: number
    taxRate: number
    rateUnit: string
    taxAmount: number
    grossAmount: number
    recoverableTax: number
    nonRecoverableTax: number
    calculationMethod: string
    classification:
        | 'STANDARD'
        | 'ZERO_RATED'
        | 'EXEMPT'
        | 'NON_TAXABLE'
        | 'WITHHOLDING'
    taxType: string
    appliedRateId: string | null
    appliedRateEffectiveFrom: string | null
    appliedRateEffectiveTo: string | null
    breakdown: FicoTaxCalculationBreakdown[]
}

export type FicoTaxCodeAuditEntry = {
    id: string
    companyId: string
    actorId: string | null
    action: string
    entityType: string
    entityId: string | null
    previousValues: Record<string, unknown> | null
    newValues: Record<string, unknown> | null
    reason: string | null
    metadata: Record<string, unknown> | null
    createdAt: string
}

// ============================================================================
// FICO Phase 2 - Document Types
// ============================================================================

export type FicoDocumentCategory =
    | 'GENERAL_JOURNAL'
    | 'ADJUSTMENT'
    | 'VENDOR_INVOICE'
    | 'VENDOR_CREDIT'
    | 'VENDOR_PAYMENT'
    | 'CUSTOMER_INVOICE'
    | 'CUSTOMER_CREDIT'
    | 'CUSTOMER_RECEIPT'
    | 'ASSET_ACCOUNTING'
    | 'REVERSAL'
    | 'INVENTORY_ACCOUNTING'
    | 'SALES_ACCOUNTING'
    | 'OTHER'

export type FicoDocumentAccountType =
    | 'GL_ACCOUNT'
    | 'VENDOR'
    | 'CUSTOMER'
    | 'ASSET'
    | 'BANK'
    | 'INVENTORY'

export type FicoDocumentTypeStatus = 'ACTIVE' | 'INACTIVE'
export type FicoDocumentNumberAssignment = 'INTERNAL' | 'EXTERNAL'

export type FicoDocumentNumberRange = {
    id: string
    rangeCode: string
    rangeName: string
    documentCategory: string
    numberingMethod: string
    allowExternalAssignment: boolean
    validFrom: string | null
    validTo: string | null
    status: string
}

export type FicoDocumentTypeUsage = {
    journalEntries: number
    documentSequences: number
    reversalReferences: number
    canDelete: boolean
}

export type FicoDocumentType = {
    id: string
    companyId: string
    company?: {
        id: string
        code: string
        name: string
    }
    code: string
    name: string
    description: string | null
    documentCategory: FicoDocumentCategory | string
    numberRangeId: string | null
    numberRange?: FicoDocumentNumberRange | null
    numberAssignment: FicoDocumentNumberAssignment
    externalNumberAllowed: boolean
    numberRangeRequired: boolean
    allowedAccountTypes: FicoDocumentAccountType[] | string[]
    debitPostingAllowed: boolean
    creditPostingAllowed: boolean
    negativePostingAllowed: boolean
    reversalAllowed: boolean
    reversalDocumentTypeId: string | null
    reversalDocumentType?: {
        id: string
        code: string
        name: string
        status: string
    } | null
    originalDocumentReferenceRequired: boolean
    reversalReasonRequired: boolean
    referenceRequired: boolean
    headerTextRequired: boolean
    lineTextRequired: boolean
    status: FicoDocumentTypeStatus
    remarks: string | null
    createdBy: string | null
    updatedBy: string | null
    createdAt: string
    updatedAt: string
    usage?: FicoDocumentTypeUsage
}

export type FicoDocumentTypeSummary = {
    total: number
    active: number
    inactive: number
    categories: number
    reversalAllowed: number
    generatedAt: string
}

export type FicoDocumentTypeReferenceOption = {
    value: string
    label: string
}

export type FicoDocumentTypeReferenceData = {
    categories: FicoDocumentTypeReferenceOption[]
    accountTypes: FicoDocumentTypeReferenceOption[]
    numberAssignments: FicoDocumentTypeReferenceOption[]
    statuses: FicoDocumentTypeReferenceOption[]
}

export type FicoDocumentTypeListQuery = {
    companyId: string
    search?: string
    status?: string
    documentCategory?: string
    reversalAllowed?: string
    numberRangeId?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
    page?: number
    pageSize?: number
}

export type FicoDocumentTypeListResponse = {
    items: FicoDocumentType[]
    total: number
    page: number
    pageSize: number
}

export type FicoDocumentTypeHistoryItem = {
    id: string
    companyId: string | null
    actorId: string | null
    action: string
    entityType: string
    entityId: string | null
    previousValues: Record<string, unknown> | null
    newValues: Record<string, unknown> | null
    reason: string | null
    metadata: Record<string, unknown> | null
    createdAt: string
    performer?: {
        id: string
        email: string
        userName: string
        firstName: string
        lastName: string
    } | null
}

export type FicoDocumentTypeHistoryResponse = {
    items: FicoDocumentTypeHistoryItem[]
    total: number
    page: number
    pageSize: number
}
