import type { Decimal } from '@prisma/client/runtime/library'
import {
    manualJournalReversalPermitted,
    resolveJournalPostingOrigin,
    resolveJournalReversalStatus,
    type FicoJournalPostingOrigin,
    type FicoJournalReversalStatus,
} from './fico-journal-origin.policy'

function dec(value: Decimal | null | undefined): string {
    return value?.toString?.() ?? '0'
}

function isoDate(value: Date | null | undefined): string | null {
    if (!value) return null
    return value.toISOString().slice(0, 10)
}

function isoDateTime(value: Date | null | undefined): string | null {
    if (!value) return null
    return value.toISOString()
}

export type PresentedJournalListItem = {
    id: string
    documentNumber: string | null
    documentType: string
    documentDate: string | null
    postingDate: string
    fiscalYear: number | null
    status: string
    approvalStatus: string
    totalAmount: string
    totalDebit: string
    totalCredit: string
    currencyCode: string
    description: string | null
    sourceModule: string | null
    sourceDocumentType: string | null
    sourceDocumentId: string | null
    sourceDocumentNumber: string | null
    postingOrigin: FicoJournalPostingOrigin
    reversalStatus: FicoJournalReversalStatus
    supplierId: string | null
    customerId: string | null
    supplier: {
        id: string
        supplierCode: string
        supplierName: string
    } | null
    customer: {
        id: string
        customerNumber: string
        companyName: string
    } | null
    company: { id: string; code: string; name: string } | null
    branch: { id: string; code: string; name: string } | null
    createdBy: string | null
    postedBy: string | null
    postedAt: string | null
    postedByName?: string | null
    postedByEmployeeCode?: string | null
    createdAt: string
    lines: Array<{ id: string; lineNumber: number }>
    fiscalPeriod: {
        fiscalYear: number
        periodNumber: number
        name: string
        status: string
    } | null
}

export function presentJournalListItem(
    row: {
        id: string
        documentNumber: string | null
        documentType: string
        documentDate: Date | null
        postingDate: Date
        fiscalYear: number | null
        status: string
        approvalStatus: string
        totalAmount: Decimal
        currencyCode: string
        description: string | null
        sourceModule: string | null
        sourceDocumentType: string | null
        sourceDocumentId: string | null
        metadata: unknown
        supplierId: string | null
        customerId: string | null
        supplier: {
            id: string
            supplierCode: string
            supplierName: string
        } | null
        customer: {
            id: string
            customerNumber: string
            companyName: string
        } | null
        company: { id: string; code: string; name: string } | null
        reversalOfId: string | null
        createdBy: string | null
        postedBy: string | null
        postedAt: Date | null
        createdAt: Date
        lines: Array<{ id: string; lineNumber: number }>
        fiscalPeriod: {
            fiscalYear: number
            periodNumber: number
            name: string
            status: string
        } | null
        mmAccountingEvent?: {
            sourceDocumentNumber: string | null
            branchId: string | null
        } | null
        reversedBy?: { id: string } | null
    },
    totals: { debit: Decimal; credit: Decimal },
    labels?: { postedByName?: string | null; postedByEmployeeCode?: string | null },
): PresentedJournalListItem {
    const sourceDocumentNumber =
        row.mmAccountingEvent?.sourceDocumentNumber ??
        (typeof (row.metadata as Record<string, unknown> | null)?.sourceDocumentNumber ===
        'string'
            ? ((row.metadata as Record<string, unknown>).sourceDocumentNumber as string)
            : null)

    const branch = row.mmAccountingEvent?.branchId
        ? { id: row.mmAccountingEvent.branchId, code: '', name: '' }
        : null

    const postingOrigin = resolveJournalPostingOrigin(row)
    const reversalStatus = resolveJournalReversalStatus({
        status: row.status,
        reversalOfId: row.reversalOfId,
        hasReversalChild: Boolean(row.reversedBy),
    })

    return {
        id: row.id,
        documentNumber: row.documentNumber,
        documentType: row.documentType,
        documentDate: isoDate(row.documentDate),
        postingDate: isoDate(row.postingDate) ?? '',
        fiscalYear: row.fiscalYear,
        status: row.status,
        approvalStatus: row.approvalStatus,
        totalAmount: dec(row.totalAmount),
        totalDebit: dec(totals.debit),
        totalCredit: dec(totals.credit),
        currencyCode: row.currencyCode,
        description: row.description,
        sourceModule: row.sourceModule,
        sourceDocumentType: row.sourceDocumentType,
        sourceDocumentId: row.sourceDocumentId,
        sourceDocumentNumber,
        postingOrigin,
        reversalStatus,
        supplierId: row.supplierId,
        customerId: row.customerId,
        supplier: row.supplier,
        customer: row.customer,
        company: row.company,
        branch,
        createdBy: row.createdBy,
        postedBy: row.postedBy,
        postedAt: isoDateTime(row.postedAt),
        postedByName: labels?.postedByName,
        postedByEmployeeCode: labels?.postedByEmployeeCode,
        createdAt: isoDateTime(row.createdAt) ?? '',
        lines: row.lines,
        fiscalPeriod: row.fiscalPeriod,
    }
}

export function presentJournalCapabilities(entry: {
    status: string
    sourceModule: string | null
    reversalOfId: string | null
    reversedBy: { id: string } | null
    approvalStatus: string
}): {
    canEdit: boolean
    canCancel: boolean
    canPost: boolean
    canReverse: boolean
    readOnlyPosted: boolean
} {
    const isDraft = entry.status === 'DRAFT'
    const isPosted = entry.status === 'POSTED'
    const automatic = Boolean(entry.sourceModule?.trim())
    const readOnlyPosted = isPosted && automatic
    const canReverse =
        isPosted &&
        !entry.reversalOfId &&
        !entry.reversedBy &&
        manualJournalReversalPermitted(entry.sourceModule)

    return {
        canEdit: isDraft && !automatic,
        canCancel: isDraft,
        canPost: isDraft && entry.approvalStatus === 'APPROVED',
        canReverse,
        readOnlyPosted,
    }
}