import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { FicoAuditService } from './fico-audit.service'
import { FicoCompanyAccessService } from './fico-company-access.service'
import {
    FICO_AUDIT_ACTIONS,
    FICO_PERIOD_TRANSITIONS,
    type FicoPeriodStatus,
    formatFicoPeriodKey,
} from './fico.constants'

export type PeriodListQuery = {
    companyId: string
    fiscalYear?: number
    status?: string
    periodType?: string
}

export type PeriodAction =
    | 'open'
    | 'restrict'
    | 'close'
    | 'lock'
    | 'reopen'
    | 'unlock'

const ACTION_TARGET: Record<PeriodAction, FicoPeriodStatus> = {
    open: 'OPEN',
    restrict: 'RESTRICTED',
    close: 'CLOSED',
    lock: 'LOCKED',
    reopen: 'OPEN',
    unlock: 'CLOSED',
}

const ACTION_AUDIT: Record<PeriodAction, string> = {
    open: FICO_AUDIT_ACTIONS.PERIOD_OPEN,
    restrict: FICO_AUDIT_ACTIONS.PERIOD_RESTRICT,
    close: FICO_AUDIT_ACTIONS.PERIOD_CLOSE,
    lock: FICO_AUDIT_ACTIONS.PERIOD_LOCK,
    reopen: FICO_AUDIT_ACTIONS.PERIOD_REOPEN,
    unlock: FICO_AUDIT_ACTIONS.PERIOD_UNLOCK,
}

@Injectable()
export class FicoPostingPeriodService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: FicoCompanyAccessService,
        private readonly audit: FicoAuditService,
    ) {}

    async list(query: PeriodListQuery) {
        const periods = await this.prisma.ficoFinancialPeriod.findMany({
            where: {
                companyId: query.companyId,
                ...(query.fiscalYear ? { fiscalYear: query.fiscalYear } : {}),
                ...(query.status ? { status: query.status } : {}),
                ...(query.periodType ? { periodType: query.periodType } : {}),
            },
            include: {
                fiscalYearVariant: {
                    select: { id: true, code: true, name: true },
                },
                _count: { select: { journalEntries: true } },
            },
            orderBy: [{ fiscalYear: 'desc' }, { periodNumber: 'asc' }],
        })
        return periods
    }

    async resolve(companyId: string, postingDate: Date) {
        return this.prisma.ficoFinancialPeriod.findFirst({
            where: {
                companyId,
                periodType: 'NORMAL',
                startDate: { lte: postingDate },
                endDate: { gte: postingDate },
            },
            orderBy: [{ fiscalYear: 'desc' }, { periodNumber: 'desc' }],
        })
    }

    async resolveQuery(companyId: string, postingDate: Date) {
        const period = await this.resolve(companyId, postingDate)
        return {
            companyId,
            postingDate: postingDate.toISOString().slice(0, 10),
            period,
            periodKey: period
                ? formatFicoPeriodKey(period.fiscalYear, period.periodNumber)
                : null,
            status: period?.status ?? null,
            canPost: period?.status === 'OPEN' || period?.status === 'RESTRICTED',
        }
    }

    async history(periodId: string, user: AuthRequestUser) {
        const period = await this.requirePeriod(periodId)
        await this.access.assertAccess(user, period.companyId)
        return this.prisma.ficoPostingPeriodAuditLog.findMany({
            where: { companyId: period.companyId, fiscalPeriodId: periodId },
            orderBy: { createdAt: 'desc' },
        })
    }

    async transition(
        periodId: string,
        action: PeriodAction,
        reason: string | undefined,
        user: AuthRequestUser,
    ) {
        const period = await this.requirePeriod(periodId)
        await this.access.assertAccess(user, period.companyId)
        const target = ACTION_TARGET[action]
        const current = period.status as FicoPeriodStatus
        const allowed = FICO_PERIOD_TRANSITIONS[current] ?? []

        if (action === 'reopen' && current !== 'CLOSED') {
            throw new BadRequestException(
                'Only a closed period can be reopened.',
            )
        }
        if (action === 'unlock' && current !== 'LOCKED') {
            throw new BadRequestException('Only a locked period can be unlocked.')
        }
        if (!allowed.includes(target)) {
            throw new BadRequestException(
                `A period cannot move from ${current} to ${target}.`,
            )
        }
        if ((action === 'reopen' || action === 'unlock') && !reason?.trim()) {
            throw new BadRequestException(
                'A reason is required to reopen or unlock a period.',
            )
        }

        const now = new Date()
        const updated = await this.prisma.$transaction(async (tx) => {
            if (action === 'close') {
                await tx.$queryRaw`
                    SELECT id FROM fico_financial_periods
                    WHERE id = ${periodId}
                    FOR UPDATE
                `
                await this.assertClosable(tx, periodId)
            }

            const saved = await tx.ficoFinancialPeriod.update({
                where: { id: periodId },
                data: {
                    status: target,
                    statusReason: reason?.trim() || period.statusReason,
                    ...(target === 'OPEN'
                        ? {
                              openedAt: now,
                              openedBy: user.id,
                              ...(action === 'reopen'
                                  ? { closedAt: null, closedBy: null }
                                  : {}),
                          }
                        : {}),
                    ...(target === 'RESTRICTED'
                        ? { restrictedAt: now, restrictedBy: user.id }
                        : {}),
                    ...(target === 'CLOSED'
                        ? {
                              closedAt: now,
                              closedBy: user.id,
                              ...(action === 'unlock'
                                  ? { lockedAt: null, lockedBy: null }
                                  : {}),
                          }
                        : {}),
                    ...(target === 'LOCKED'
                        ? { lockedAt: now, lockedBy: user.id }
                        : {}),
                    updatedBy: user.id,
                },
            })

            await tx.ficoPostingPeriodControl.upsert({
                where: {
                    companyId_fiscalPeriodId_accountTypeScope: {
                        companyId: period.companyId,
                        fiscalPeriodId: periodId,
                        accountTypeScope: 'ALL',
                    },
                },
                create: {
                    companyId: period.companyId,
                    fiscalPeriodId: periodId,
                    accountTypeScope: 'ALL',
                    status: target,
                    reason: reason?.trim() || null,
                    changedBy: user.id,
                },
                update: {
                    status: target,
                    reason: reason?.trim() || null,
                    changedBy: user.id,
                },
            })

            await tx.ficoPostingPeriodAuditLog.create({
                data: {
                    companyId: period.companyId,
                    fiscalPeriodId: periodId,
                    action: ACTION_AUDIT[action],
                    fromStatus: current,
                    toStatus: target,
                    reason: reason?.trim() || null,
                    actorId: user.id,
                },
            })
            return saved
        })

        await this.audit.log({
            companyId: period.companyId,
            actorId: user.id,
            action: ACTION_AUDIT[action],
            entityType: 'FicoFinancialPeriod',
            entityId: periodId,
            previousValues: { status: current },
            newValues: { status: target },
            reason: reason?.trim() || null,
            metadata: {
                fiscalYear: period.fiscalYear,
                periodNumber: period.periodNumber,
            },
        })
        return updated
    }

    /** Human-readable posting rejection used by the centralized validation service. */
    async assertPostingAllowed(
        companyId: string,
        postingDate: Date,
        source: 'MANUAL' | 'AUTOMATIC' = 'MANUAL',
    ) {
        const [company, period] = await Promise.all([
            this.prisma.company.findUnique({
                where: { id: companyId },
                select: { name: true },
            }),
            this.resolve(companyId, postingDate),
        ])
        if (!period) {
            throw new BadRequestException(
                'Accounting posting is not allowed. No fiscal period has been generated for the posting date. Generate the fiscal year and open the period first.',
            )
        }
        const periodKey = `${String(period.periodNumber).padStart(2, '0')}/${period.fiscalYear}`
        if (period.status === 'CLOSED' || period.status === 'LOCKED') {
            throw new BadRequestException(
                `Accounting posting is not allowed. Fiscal period ${periodKey} is ${period.status.toLowerCase()} for ${company?.name ?? companyId}. Please contact an authorized Finance Administrator.`,
            )
        }
        if (period.status === 'FUTURE') {
            throw new BadRequestException(
                `Accounting posting is not allowed. Fiscal period ${periodKey} is not open yet for ${company?.name ?? companyId}.`,
            )
        }
        if (period.status === 'RESTRICTED' && source === 'MANUAL') {
            throw new BadRequestException(
                `Accounting posting is not allowed. Fiscal period ${periodKey} is restricted to automatic postings for ${company?.name ?? companyId}.`,
            )
        }

        const controls = await this.prisma.ficoPostingPeriodControl.findMany({
            where: { companyId, fiscalPeriodId: period.id },
        })
        const all = controls.find((control) => control.accountTypeScope === 'ALL')
        if (all?.status === 'CLOSED' || all?.status === 'LOCKED') {
            throw new BadRequestException(
                `Accounting posting is not allowed. Fiscal period ${periodKey} is ${all.status.toLowerCase()} for ${company?.name ?? companyId}. Please contact an authorized Finance Administrator.`,
            )
        }
        if (
            all?.status === 'RESTRICTED' &&
            source === 'MANUAL'
        ) {
            throw new BadRequestException(
                `Accounting posting is not allowed. Fiscal period ${periodKey} is restricted to automatic postings for ${company?.name ?? companyId}.`,
            )
        }
        return period
    }

    private async requirePeriod(periodId: string) {
        const period = await this.prisma.ficoFinancialPeriod.findUnique({
            where: { id: periodId },
        })
        if (!period) throw new NotFoundException('Fiscal period not found')
        return period
    }

    private async assertClosable(
        tx: Prisma.TransactionClient,
        periodId: string,
    ) {
        const documents = await tx.ficoJournalEntry.findMany({
            where: {
                fiscalPeriodId: periodId,
                status: { notIn: ['POSTED', 'REVERSED', 'LEGACY'] },
            },
            select: { id: true, documentNumber: true, status: true },
            take: 25,
        })
        if (documents.length > 0) {
            throw new ConflictException(
                `The period cannot be closed because it contains incomplete documents: ${documents
                    .map(
                        (document) =>
                            `${document.documentNumber ?? document.id} (${document.status})`,
                    )
                    .join(', ')}. Post or reverse them first.`,
            )
        }

        const posted = await tx.ficoJournalEntry.findMany({
            where: { fiscalPeriodId: periodId, status: 'POSTED' },
            select: {
                id: true,
                documentNumber: true,
                status: true,
                lines: {
                    select: { debitAmount: true, creditAmount: true },
                },
            },
        })
        const unbalanced = posted.filter((document) => {
            const debit = document.lines.reduce(
                (total, line) => total + Number(line.debitAmount),
                0,
            )
            const credit = document.lines.reduce(
                (total, line) => total + Number(line.creditAmount),
                0,
            )
            return Math.abs(debit - credit) > 0.0001
        })
        if (unbalanced.length > 0) {
            throw new ConflictException(
                `The period cannot be closed because these posted documents are unbalanced: ${unbalanced
                    .map((document) => document.documentNumber ?? document.id)
                    .join(', ')}.`,
            )
        }
    }
}
