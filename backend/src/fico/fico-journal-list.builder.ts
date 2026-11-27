import type { Prisma } from '@prisma/client'
import type { JournalEntryListQueryDto } from './dto/fico.dto'

function parseFilterDate(value: string | undefined, endOfDay: boolean): Date | null {
    if (!value?.trim()) return null
    const text = value.trim().slice(0, 10)
    const parsed = new Date(`${text}T00:00:00.000Z`)
    if (Number.isNaN(parsed.getTime())) return null
    if (endOfDay) {
        parsed.setUTCHours(23, 59, 59, 999)
    }
    return parsed
}

export function buildJournalListWhere(
    query: JournalEntryListQueryDto,
    options?: { currentUserId?: string | null },
): Prisma.FicoJournalEntryWhereInput {
    const where: Prisma.FicoJournalEntryWhereInput = {
        companyId: query.companyId,
    }

    if (query.status) where.status = query.status
    if (query.approvalStatus) where.approvalStatus = query.approvalStatus
    if (query.documentType) where.documentType = query.documentType
    if (query.documentNumber) {
        where.documentNumber = { contains: query.documentNumber, mode: 'insensitive' }
    }
    if (query.sourceModule) {
        const module = query.sourceModule.trim().toUpperCase()
        if (module === 'MANUAL') {
            where.AND = [
                ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
                { OR: [{ sourceModule: null }, { sourceModule: '' }] },
            ]
        } else {
            where.sourceModule = module
        }
    }
    if (query.sourceDocumentId) where.sourceDocumentId = query.sourceDocumentId
    if (query.supplierId) where.supplierId = query.supplierId
    if (query.currencyCode) where.currencyCode = query.currencyCode
    if (query.createdBy) where.createdBy = query.createdBy
    if (query.postedBy) where.postedBy = query.postedBy
    if (query.fiscalYear) where.fiscalYear = query.fiscalYear
    if (query.fiscalPeriodId) where.fiscalPeriodId = query.fiscalPeriodId

    const postingFrom = parseFilterDate(query.dateFrom, false)
    const postingTo = parseFilterDate(query.dateTo, true)
    if (postingFrom || postingTo) {
        where.postingDate = {}
        if (postingFrom) where.postingDate.gte = postingFrom
        if (postingTo) where.postingDate.lte = postingTo
    }
    const documentFrom = parseFilterDate(query.documentDateFrom, false)
    const documentTo = parseFilterDate(query.documentDateTo, true)
    if (documentFrom || documentTo) {
        where.documentDate = {}
        if (documentFrom) where.documentDate.gte = documentFrom
        if (documentTo) where.documentDate.lte = documentTo
    }

    if (query.glAccountId) {
        where.lines = { some: { glAccountId: query.glAccountId } }
    }

    if (query.search?.trim()) {
        const term = query.search.trim()
        where.OR = [
            { documentNumber: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
        ]
    }

    const tab = query.tab?.toLowerCase()

    const manualOnlyScope: Prisma.FicoJournalEntryWhereInput = {
        OR: [{ sourceModule: null }, { sourceModule: '' }],
    }
    // Approval-lifecycle tabs are manual-only. "all", "posted", and "reversed"
    // must include automatic (MM/SD) journals — do not force manualOnlyScope there.
    const approvalLifecycleTabs = new Set([
        'my-drafts',
        'pending-approval',
        'ready-to-post',
        'manual',
    ])
    if (tab && approvalLifecycleTabs.has(tab)) {
        where.AND = [
            ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
            manualOnlyScope,
        ]
    }

    // Manual = no sourceModule. Do not also require requiresApproval: true —
    // posted Finance journals may have approval already completed / not required.
    if (tab === 'automatic') {
        // Inverse of manualOnlyScope: MM/SD/system postings always set sourceModule.
        where.AND = [
            ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
            {
                AND: [
                    { sourceModule: { not: null } },
                    { NOT: { sourceModule: '' } },
                ],
            },
        ]
    } else if (tab === 'my-drafts' && options?.currentUserId) {
        where.status = 'DRAFT'
        where.createdBy = options.currentUserId
    } else if (tab === 'pending-approval') {
        where.approvalStatus = 'PENDING_APPROVAL'
    } else if (tab === 'ready-to-post') {
        where.status = 'DRAFT'
        where.approvalStatus = 'APPROVED'
    } else if (tab === 'posted') {
        where.status = 'POSTED'
    } else if (tab === 'reversed') {
        where.status = 'REVERSED'
    }

    return where
}

export function journalListOrderBy(
    query: JournalEntryListQueryDto,
): Prisma.FicoJournalEntryOrderByWithRelationInput[] {
    const dir = query.sortDir === 'asc' ? 'asc' : 'desc'
    switch (query.sortBy) {
        case 'documentNumber':
            return [{ documentNumber: dir }]
        case 'postingDate':
            return [{ postingDate: dir }]
        case 'status':
            return [{ status: dir }]
        case 'totalAmount':
            return [{ totalAmount: dir }]
        default:
            return [{ postingDate: dir }, { createdAt: dir }]
    }
}