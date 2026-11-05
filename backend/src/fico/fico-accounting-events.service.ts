import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { FicoCompanyAccessService } from './fico-company-access.service'

export type AccountingEventQuery = {
    companyId: string
    status?: string
    sourceModule?: string
    search?: string
    page?: number
    pageSize?: number
}

export const FICO_ACCOUNTING_EVENT_STATUSES = ['PENDING', 'CONSUMED', 'FAILED'] as const

const LIST_SELECT = {
    id: true,
    eventType: true,
    sourceModule: true,
    documentType: true,
    documentId: true,
    postingDate: true,
    currencyCode: true,
    totalValue: true,
    accountingEffects: true,
    status: true,
    lastError: true,
    createdAt: true,
    consumedAt: true,
    ficoJournalEntry: {
        select: { id: true, documentNumber: true, status: true, postingDate: true },
    },
} satisfies Prisma.MmAccountingEventSelect

/**
 * One readable line from a stored consumer error. Prisma errors carry a
 * multi-line invocation header; the useful part is the constraint or the
 * database message.
 */
export function summarizeAccountingError(error: string | null | undefined) {
    if (!error?.trim()) return null
    const dbMessage = /message: "([^"]+)"/.exec(error)?.[1]
    if (dbMessage) return dbMessage
    const constraint = /Foreign key constraint violated on the constraint: `([^`]+)`/.exec(error)
    if (constraint) return `Foreign key constraint violated (${constraint[1]})`
    const lines = error
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('Invalid `') && !/^\d+\s/.test(line) && !line.startsWith('→'))
    return (lines[lines.length - 1] ?? error.trim()).slice(0, 300)
}

/**
 * Read-only view of the MM → FICO accounting bridge (`mm_accounting_events`).
 * MM owns the events; this service never changes them.
 */
@Injectable()
export class FicoAccountingEventsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: FicoCompanyAccessService,
    ) {}

    async list(query: AccountingEventQuery, user: AuthRequestUser) {
        await this.access.assertAccess(user, query.companyId)
        const page = Math.max(1, query.page ?? 1)
        const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25))
        const search = query.search?.trim()
        const scope: Prisma.MmAccountingEventWhereInput = { companyId: query.companyId }
        const where: Prisma.MmAccountingEventWhereInput = {
            ...scope,
            ...(query.status ? { status: query.status } : {}),
            ...(query.sourceModule ? { sourceModule: query.sourceModule } : {}),
            ...(search
                ? {
                      OR: [
                          { documentId: { contains: search, mode: 'insensitive' } },
                          { eventType: { contains: search, mode: 'insensitive' } },
                          { documentType: { contains: search, mode: 'insensitive' } },
                      ],
                  }
                : {}),
        }

        const [items, total, byStatus, bySource, oldestPending] = await Promise.all([
            this.prisma.mmAccountingEvent.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
                select: LIST_SELECT,
            }),
            this.prisma.mmAccountingEvent.count({ where }),
            this.prisma.mmAccountingEvent.groupBy({
                by: ['status'],
                where: scope,
                _count: { _all: true },
            }),
            this.prisma.mmAccountingEvent.groupBy({
                by: ['sourceModule'],
                where: scope,
                _count: { _all: true },
            }),
            this.prisma.mmAccountingEvent.findFirst({
                where: { ...scope, status: 'PENDING' },
                orderBy: { createdAt: 'asc' },
                select: { createdAt: true },
            }),
        ])

        return {
            items: items.map(({ ficoJournalEntry, totalValue, lastError, ...event }) => ({
                ...event,
                totalValue: totalValue?.toString() ?? null,
                errorSummary: summarizeAccountingError(lastError),
                journal: ficoJournalEntry,
            })),
            total,
            page,
            pageSize,
            summary: {
                byStatus: Object.fromEntries(
                    byStatus.map((row) => [row.status, row._count._all]),
                ) as Record<string, number>,
                bySource: bySource
                    .map((row) => ({ sourceModule: row.sourceModule, count: row._count._all }))
                    .sort((a, b) => b.count - a.count),
                oldestPendingAt: oldestPending?.createdAt ?? null,
            },
        }
    }

    async get(id: string, user: AuthRequestUser) {
        const event = await this.prisma.mmAccountingEvent.findUnique({
            where: { id },
            select: {
                ...LIST_SELECT,
                companyId: true,
                idempotencyKey: true,
                sourceEventId: true,
                sourceTransactionId: true,
                payload: true,
            },
        })
        if (!event) throw new NotFoundException('Accounting event not found')
        if (event.companyId) {
            await this.access.assertAccess(user, event.companyId)
        } else if ((await this.access.accessibleCompanyIds(user)) !== null) {
            throw new ForbiddenException('This event has no company and is visible to super admins only.')
        }
        const { ficoJournalEntry, totalValue, payload, ...rest } = event
        const lines = (payload as { lines?: unknown[] } | null)?.lines
        return {
            ...rest,
            totalValue: totalValue?.toString() ?? null,
            errorSummary: summarizeAccountingError(event.lastError),
            journal: ficoJournalEntry,
            lines: Array.isArray(lines) ? lines.slice(0, 200) : [],
        }
    }
}
