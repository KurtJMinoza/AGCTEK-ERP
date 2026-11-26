/** Types for centralized G/L account determination (FICO — MM, SD and PP). */

export type FicoDeterminationModule =
    | 'MM'
    | 'SD'
    | 'PP'
    | 'TREASURY'
    | 'AP'
    | 'AR'
    | 'AA'
    | 'CO'

export type FicoDeterminationStatus =
    | 'DRAFT'
    | 'PENDING_APPROVAL'
    | 'APPROVED'
    | 'ACTIVE'
    | 'INACTIVE'
    | 'REJECTED'

export type FicoDeterminationSide = 'DEBIT' | 'CREDIT'

export type FicoDeterminationAccount = {
    id: string
    accountCode: string
    accountName: string
    accountType: string
    status?: string
}

export type FicoDeterminationLine = {
    id?: string
    lineNumber: number
    side: FicoDeterminationSide
    glAccountId: string
    description?: string | null
    glAccount?: FicoDeterminationAccount
}

export type FicoDeterminationRule = {
    id: string
    determinationCode: string
    name: string
    description: string
    companyId: string
    sourceModule: FicoDeterminationModule
    transactionType: string
    transactionKeyCode: string | null
    priority: number
    effectiveFrom: string | null
    effectiveTo: string | null
    status: FicoDeterminationStatus
    valuationClassId: string | null
    materialTypeCode: string | null
    movementType: string | null
    customerAccountGroup: string | null
    salesOrganization: string | null
    distributionChannel: string | null
    changeReason?: string | null
    submittedBy?: string | null
    submittedAt?: string | null
    approvedBy?: string | null
    approvedAt?: string | null
    rejectedBy?: string | null
    rejectedAt?: string | null
    rejectionReason?: string | null
    activatedBy?: string | null
    activatedAt?: string | null
    deactivatedBy?: string | null
    deactivatedAt?: string | null
    createdAt?: string
    updatedAt?: string
    valuationClass?: { id: string; code: string; name: string } | null
    materialType?: { code: string; name: string } | null
    lines: FicoDeterminationLine[]
}

export type FicoDeterminationList = {
    items: FicoDeterminationRule[]
    total: number
    page: number
    pageSize: number
}

export type FicoDeterminationSummary = {
    companyId: string
    total: number
    byStatus: Record<string, number>
    byModule: Record<string, number>
    active: number
    pendingApproval: number
    drafts: number
    rejected: number
    approved?: number
    inactive?: number
}

export type FicoDeterminationWorkbenchOverview = FicoDeterminationSummary & {
    scheduledRules: number
    missingAccountDeterminationProfile: boolean
    companyAccountingInactive: boolean
    failedAccountResolutionEvents: number
    pendingAccountingEvents: number
    invalidGlReferencesInRules: number
    liveTransactionKeys: number
    activeRulesWithTransactionKey: number
    missingLiveTransactionKeyRules: number
    moduleCoverage: Array<{
        transactionKeyCode: string
        integrationStatus: string
        hasActiveRule: boolean
    }>
}

export type TransactionKeyCatalogRow = {
    code: string
    name: string
    owningModule: string
    integrationStatus: string
    accountingCategory: string
}

export type FicoDeterminationExceptionCategory =
    | 'MISSING_TRANSACTION_KEY'
    | 'MISSING_DETERMINATION_RULE'
    | 'AMBIGUOUS_RULE'
    | 'EXPIRED_RULE'
    | 'INVALID_GL_ACCOUNT'
    | 'BLOCKED_GL_ACCOUNT'
    | 'INVALID_COMPANY_ASSIGNMENT'
    | 'MISSING_REQUIRED_DIMENSION'
    | 'UNSUPPORTED_SCENARIO'
    | 'LEGACY_MIGRATION_DISCREPANCY'
    | 'FAILED_AUTOMATIC_POSTING'

export type FicoDeterminationException = {
    id: string
    category: FicoDeterminationExceptionCategory
    expectedHandling: string
    companyId: string | null
    sourceModule: string | null
    sourceDocumentType: string | null
    sourceDocumentId: string | null
    accountingEventId: string | null
    transactionKey: string | null
    resolutionContext: Record<string, unknown>
    errorCode: string | null
    errorDescription: string | null
    firstFailureAt: string | null
    lastFailureAt: string | null
    retryCount: number
    resolutionStatus: 'OPEN' | 'RETRYABLE' | 'BLOCKED' | 'RESOLVED'
    configurationLink: string | null
}

export type FicoDeterminationExceptionList = {
    items: FicoDeterminationException[]
    total: number
    page: number
    pageSize: number
    byCategory: Record<string, number>
}

export type FicoDeterminationModuleCoverage = {
    companyId: string
    liveTransactionKeys: number
    keys: Array<{
        transactionKeyCode: string
        name: string
        owningModule: string
        accountingCategory: string
        integrationStatus: string
        hasActiveRule: boolean
    }>
    byModule: Record<
        string,
        { total: number; live: number; covered: number; liveCovered: number }
    >
}

export type FicoDeterminationEligibleGlAccount = {
    id: string
    accountCode: string
    accountName: string
    accountType: string
    accountGroupCode: string
    normalBalance: string
    companyAssignment: boolean
    postingEligible: boolean
    reconciliationType: string | null
    isReconciliationAccount: boolean
    status: string
    categoryEligible: boolean
}

export type DeterminationSimulationResult = {
    safeDryRun: boolean
    mode: string
    companyId: string
    chartOfAccountsId: string | null
    chartOfAccountsCode: string | null
    sourceModule: string
    postingDate: string
    transactionKey?: string
    configurationErrors: string[]
    validationWarnings: string[]
    candidates: Array<{
        ruleId: string
        determinationCode: string
        eligible: boolean
        priority: number
        specificity: number
        rejectReason?: string
        matchedDimensions: string[]
        unmatchedConditions: Array<{
            dimension: string
            ruleValue: string | null
            inputValue: string | null
        }>
    }>
    selectedRule: { determinationCode: string; ruleId: string } | null
    batchItems?: Array<{
        transactionKey: string
        ok: boolean
        message?: string
    }>
}

export type FicoDeterminationReference = {
    modules: Array<{
        code: FicoDeterminationModule
        label: string
        transactionTypes: ReadonlyArray<{ code: string; label: string }>
    }>
    valuationClasses: Array<{ id: string; code: string; name: string }>
    materialTypes: Array<{ code: string; name: string }>
    customerAccountGroups: string[]
    salesOrganizations: string[]
    distributionChannels: string[]
    authoringDimensionsByModule?: Record<
        string,
        Array<{
            key: string
            label: string
            required: boolean
            wildcardAllowed: boolean
        }>
    >
}

export type FicoDeterminationHistoryEntry = {
    id: string
    companyId: string | null
    actorId: string | null
    action: string
    entityType: string
    entityId: string | null
    previousValues: Record<string, unknown> | null
    newValues: Record<string, unknown> | null
    reason: string | null
    createdAt: string
}

export type FicoAccountResolutionResult = {
    companyId: string
    sourceModule: FicoDeterminationModule
    transactionType: string
    postingDate: string
    currency: string
    rule: {
        id: string
        determinationCode: string
        name: string
        priority: number
        effectiveFrom: string | null
        effectiveTo: string | null
        matchedDimensions: string[]
        specificity: number
    }
    lines: Array<{
        lineNumber: number
        side: FicoDeterminationSide
        glAccountId: string
        accountCode: string
        accountName: string
        accountType: string
        description: string | null
    }>
    debitLines: FicoAccountResolutionResult['lines']
    creditLines: FicoAccountResolutionResult['lines']
}

export type FicoDeterminationLineInput = {
    side: FicoDeterminationSide
    glAccountId: string
    description?: string
}
