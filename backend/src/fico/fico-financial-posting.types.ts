import type { Decimal } from '@prisma/client/runtime/library'

export type FinancialPostingSource = 'MANUAL' | 'AUTOMATIC' | 'SYSTEM'

export type FinancialPostingLineInput = {
    glAccountId: string
    debit: Decimal
    credit: Decimal
    description?: string | null
    materialId?: string | null
    warehouseId?: string | null
    accountDeterminationRuleId?: string | null
    sourceDocumentLineId?: string | null
}

export type FinancialPostingRequest = {
    companyId: string
    documentType: string
    documentDate: Date
    postingDate: Date
    currencyCode: string
    sourceModule: string
    sourceDocumentType?: string | null
    sourceDocumentId?: string | null
    sourceEventId?: string | null
    sourceTransactionId?: string | null
    mmAccountingEventId?: string | null
    idempotencyKey: string
    description: string
    reference?: string | null
    lines: FinancialPostingLineInput[]
    metadata?: Record<string, unknown>
    sourcePostingKey?: string | null
    /** When set, journal is posted immediately with consistent approval fields. */
    postImmediately: boolean
    postingSource: FinancialPostingSource
    actorUserId?: string | null
}

export type FinancialPostingResult = {
    journalEntryId: string
    documentNumber: string
    postedAt: Date | null
    duplicate: boolean
    created: boolean
}