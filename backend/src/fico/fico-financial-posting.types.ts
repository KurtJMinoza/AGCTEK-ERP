import type { Prisma } from '@prisma/client'
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

/**
 * Runs inside the same database transaction as the centrally persisted journal.
 * Subledgers use this to create their immutable documents and clearing records
 * only after the financial posting engine has created the journal header/lines.
 */
export type FinancialPostingAfterPersist = (
    tx: Prisma.TransactionClient,
    journal: { id: string; documentNumber: string | null; postedAt: Date | null },
) => Promise<void>

export type FinancialPostingRequest = {
    companyId: string
    documentType: string
    documentDate: Date
    postingDate: Date
    currencyCode: string
    sourceModule: string
    sourceDocumentType?: string | null
    sourceDocumentId?: string | null
    /** Optional MM supplier partner when the operational source has one. */
    supplierId?: string | null
    /** Optional SD customer partner for AR subledger postings. */
    customerId?: string | null
    sourceEventId?: string | null
    sourceTransactionId?: string | null
    mmAccountingEventId?: string | null
    idempotencyKey: string
    description: string
    reference?: string | null
    lines: FinancialPostingLineInput[]
    metadata?: Record<string, unknown>
    sourcePostingKey?: string | null
    /** AP/AR reconciliation accounts can only be posted from their subledger. */
    subledgerPosting?: 'AP' | 'AR'
    afterPersist?: FinancialPostingAfterPersist
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
