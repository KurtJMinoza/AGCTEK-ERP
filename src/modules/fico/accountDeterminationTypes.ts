/** Types for centralized G/L account determination (FICO Phase 1 — MM + SD). */

export type FicoDeterminationModule = 'MM' | 'SD'

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
