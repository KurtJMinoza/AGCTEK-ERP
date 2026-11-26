import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { FicoCompanyAccessService } from './fico-company-access.service'
import type { AuthRequestUser } from '../auth/auth.decorator'

export type IntegrityRunQuery = {
    companyId?: string
    dryRun?: boolean
}

export type IntegrityException = {
    code: string
    severity: 'error' | 'warning'
    journalEntryId?: string
    mmAccountingEventId?: string
    message: string
    details?: Record<string, unknown>
}

@Injectable()
export class FicoJournalIntegrityService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: FicoCompanyAccessService,
    ) {}

    async run(user: AuthRequestUser, query: IntegrityRunQuery) {
        if (query.companyId) {
            await this.access.assertAccess(user, query.companyId)
        }
        const companyIds = query.companyId
            ? [query.companyId]
            : ((await this.access.accessibleCompanyIds(user)) ?? undefined)

        const journalWhere: Prisma.FicoJournalEntryWhereInput = {
            ...(companyIds ? { companyId: { in: companyIds } } : {}),
        }

        const exceptions: IntegrityException[] = []

        const postedHeaders = await this.prisma.ficoJournalEntry.findMany({
            where: {
                ...journalWhere,
                status: { in: ['POSTED', 'REVERSED'] },
            },
            select: {
                id: true,
                companyId: true,
                documentNumber: true,
                status: true,
                approvalStatus: true,
                postedAt: true,
                totalAmount: true,
                mmAccountingEventId: true,
                _count: { select: { lines: true } },
            },
        })

        for (const journal of postedHeaders) {
            if (journal._count.lines < 2) {
                exceptions.push({
                    code: 'POSTED_WITHOUT_LINES',
                    severity: 'error',
                    journalEntryId: journal.id,
                    message:
                        'Posted or reversed journal has fewer than two line records.',
                    details: { lineCount: journal._count.lines },
                })
            }
            if (!journal.documentNumber) {
                exceptions.push({
                    code: 'MISSING_DOCUMENT_NUMBER',
                    severity: 'warning',
                    journalEntryId: journal.id,
                    message: 'Committed journal is missing documentNumber.',
                })
            }
            if (
                journal.status === 'POSTED' &&
                journal.postedAt &&
                journal.approvalStatus === 'DRAFT'
            ) {
                exceptions.push({
                    code: 'INCONSISTENT_APPROVAL_STATUS',
                    severity: 'warning',
                    journalEntryId: journal.id,
                    message:
                        'Posted journal still has approvalStatus DRAFT.',
                })
            }
        }

        for (const journal of postedHeaders) {
            const sums = await this.prisma.ficoJournalEntryLine.aggregate({
                where: { journalEntryId: journal.id },
                _sum: { debitAmount: true, creditAmount: true },
            })
            const debit = sums._sum.debitAmount ?? new Prisma.Decimal(0)
            const credit = sums._sum.creditAmount ?? new Prisma.Decimal(0)
            if (journal._count.lines >= 2 && !debit.eq(credit)) {
                exceptions.push({
                    code: 'UNBALANCED_POSTED_JOURNAL',
                    severity: 'error',
                    journalEntryId: journal.id,
                    message: 'Posted journal lines do not balance.',
                    details: {
                        debit: debit.toString(),
                        credit: credit.toString(),
                    },
                })
            }
        }

        const eventsConsumed = await this.prisma.mmAccountingEvent.findMany({
            where: {
                status: 'CONSUMED',
                ...(companyIds ? { companyId: { in: companyIds } } : {}),
                journalEntryId: null,
            },
            select: { id: true, companyId: true },
            take: 200,
        })
        for (const event of eventsConsumed) {
            exceptions.push({
                code: 'CONSUMED_EVENT_WITHOUT_JOURNAL',
                severity: 'error',
                mmAccountingEventId: event.id,
                message: 'Accounting event CONSUMED but journalEntryId is null.',
            })
        }

        const repairedApproval =
            query.dryRun === false
                ? await this.repairApprovalStatus(companyIds)
                : 0

        return {
            dryRun: query.dryRun !== false,
            scannedJournals: postedHeaders.length,
            exceptionCount: exceptions.length,
            exceptions,
            repairs: {
                approvalStatusAligned: repairedApproval,
            },
        }
    }

    private async repairApprovalStatus(companyIds?: string[]) {
        const result = await this.prisma.ficoJournalEntry.updateMany({
            where: {
                ...(companyIds ? { companyId: { in: companyIds } } : {}),
                status: 'POSTED',
                postedAt: { not: null },
                approvalStatus: 'DRAFT',
            },
            data: { approvalStatus: 'POSTED' },
        })
        return result.count
    }
}