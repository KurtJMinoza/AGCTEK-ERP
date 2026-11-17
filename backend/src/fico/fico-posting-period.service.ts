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

export type PeriodSummaryQuery = {
    companyId: string
    fiscalYear?: number
}

export type PeriodDetailsInput = {
    remarks?: string | null
    closingDate?: string | null
    lockDate?: string | null
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

function startOfUtcDay(date: Date): Date {
    return new Date(
        Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
        ),
    )
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

    async get(periodId: string, user: AuthRequestUser) {
        const period = await this.prisma.ficoFinancialPeriod.findUnique({
            where: { id: periodId },
            include: {
                company: { select: { id: true, code: true, name: true } },
                fiscalYearVariant: {
                    select: {
                        id: true,
                        code: true,
                        name: true,
                        startMonth: true,
                        startDay: true,
                    },
                },
                _count: { select: { journalEntries: true } },
            },
        })
        if (!period) throw new NotFoundException('Fiscal period not found')
        await this.access.assertAccess(user, period.companyId)
        return period
    }

    /**
     * Period status dashboard for one company (optionally one fiscal year).
     * Counts come from the database; the frontend never derives period state.
     */
    async summary(query: PeriodSummaryQuery, user: AuthRequestUser) {
        await this.access.assertAccess(user, query.companyId)
        const where: Prisma.FicoFinancialPeriodWhereInput = {
            companyId: query.companyId,
            ...(query.fiscalYear ? { fiscalYear: query.fiscalYear } : {}),
        }
        const now = new Date()
        const today = startOfUtcDay(now)
        const [grouped, periods, journalEntries, currentPeriod] =
            await Promise.all([
                this.prisma.ficoFinancialPeriod.groupBy({
                    by: ['status'],
                    where,
                    _count: { _all: true },
                }),
                this.prisma.ficoFinancialPeriod.findMany({
                    where,
                    select: {
                        id: true,
                        fiscalYear: true,
                        periodNumber: true,
                        name: true,
                        periodType: true,
                        startDate: true,
                        endDate: true,
                        status: true,
                        closingDate: true,
                        lockDate: true,
                    },
                    orderBy: [
                        { fiscalYear: 'desc' },
                        { periodNumber: 'asc' },
                    ],
                }),
                this.prisma.ficoJournalEntry.count({
                    where: {
                        companyId: query.companyId,
                        ...(query.fiscalYear
                            ? { fiscalYear: query.fiscalYear }
                            : {}),
                    },
                }),
                this.prisma.ficoFinancialPeriod.findFirst({
                    where: {
                        companyId: query.companyId,
                        startDate: { lte: today },
                        endDate: { gte: today },
                    },
                    orderBy: [{ fiscalYear: 'desc' }, { periodNumber: 'desc' }],
                }),
            ])

        const byStatus: Record<string, number> = {
            FUTURE: 0,
            OPEN: 0,
            RESTRICTED: 0,
            CLOSED: 0,
            LOCKED: 0,
        }
        for (const row of grouped) {
            byStatus[row.status] = row._count._all
        }
        const normal = periods.filter((item) => item.periodType !== 'SPECIAL')
        const special = periods.filter((item) => item.periodType === 'SPECIAL')
        const withJournals = await this.prisma.ficoFinancialPeriod.findMany({
            where: { ...where, journalEntries: { some: {} } },
            select: { id: true },
        })
        const openPeriods = periods.filter(
            (item) => item.status === 'OPEN' || item.status === 'RESTRICTED',
        )
        return {
            companyId: query.companyId,
            fiscalYear: query.fiscalYear ?? null,
            generatedPeriods: periods.length,
            normalPeriods: normal.length,
            specialPeriods: special.length,
            periodsWithPostings: withJournals.length,
            journalEntries,
            byStatus,
            totals: {
                open: byStatus.OPEN,
                restricted: byStatus.RESTRICTED,
                closed: byStatus.CLOSED,
                locked: byStatus.LOCKED,
                future: byStatus.FUTURE,
            },
            currentPeriod: currentPeriod ?? null,
            firstPeriod: periods.length ? periods[periods.length - 1] : null,
            lastPeriod: periods.length ? periods[0] : null,
            nextClosingPeriod: openPeriods.length
                ? openPeriods[openPeriods.length - 1]
                : null,
        }
    }

    async updateDetails(
        periodId: string,
        input: PeriodDetailsInput,
        user: AuthRequestUser,
    ) {
        const period = await this.requirePeriod(periodId)
        await this.access.assertAccess(user, period.companyId)

        const data: Prisma.FicoFinancialPeriodUpdateInput = {}
        if (input.remarks !== undefined) {
            data.remarks = input.remarks?.trim() || null
        }
        if (input.closingDate !== undefined) {
            const closingDate = this.parseDate(input.closingDate)
            if (closingDate && closingDate < period.startDate) {
                throw new BadRequestException(
                    'The closing date cannot be before the period start date.',
                )
            }
            data.closingDate = closingDate
        }
        if (input.lockDate !== undefined) {
            const lockDate = this.parseDate(input.lockDate)
            if (lockDate && lockDate < period.startDate) {
                throw new BadRequestException(
                    'The lock date cannot be before the period start date.',
                )
            }
            data.lockDate = lockDate
        }
        if (Object.keys(data).length === 0) {
            throw new BadRequestException('No period details were supplied.')
        }
        data.updatedBy = user.id

        const updated = await this.prisma.$transaction(async (tx) => {
            const saved = await tx.ficoFinancialPeriod.update({
                where: { id: periodId },
                data,
            })
            await tx.ficoPostingPeriodAuditLog.create({
                data: {
                    companyId: period.companyId,
                    fiscalPeriodId: periodId,
                    action: FICO_AUDIT_ACTIONS.PERIOD_UPDATE,
                    fromStatus: period.status,
                    toStatus: saved.status,
                    reason: input.remarks?.trim() || null,
                    actorId: user.id,
                },
            })
            await this.audit.log(
                {
                    companyId: period.companyId,
                    actorId: user.id,
                    action: FICO_AUDIT_ACTIONS.PERIOD_UPDATE,
                    entityType: 'FicoFinancialPeriod',
                    entityId: periodId,
                    previousValues: {
                        remarks: period.remarks,
                        closingDate: period.closingDate,
                        lockDate: period.lockDate,
                    },
                    newValues: {
                        remarks: saved.remarks,
                        closingDate: saved.closingDate,
                        lockDate: saved.lockDate,
                    },
                    metadata: {
                        fiscalYear: period.fiscalYear,
                        periodNumber: period.periodNumber,
                    },
                },
                tx,
            )
            return saved
        })
        return updated
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
        const today = startOfUtcDay(now)
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
                                  ? {
                                        closedAt: null,
                                        closedBy: null,
                                        closingDate: null,
                                        reopenedAt: now,
                                        reopenedBy: user.id,
                                    }
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
                              closingDate: period.closingDate ?? today,
                              ...(action === 'unlock'
                                  ? {
                                        lockedAt: null,
                                        lockedBy: null,
                                        lockDate: null,
                                    }
                                  : {}),
                          }
                        : {}),
                    ...(target === 'LOCKED'
                        ? {
                              lockedAt: now,
                              lockedBy: user.id,
                              lockDate: period.lockDate ?? today,
                          }
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

    private parseDate(value: string | null | undefined): Date | null {
        if (value === undefined || value === null || value === '') return null
        const text = String(value).slice(0, 10)
        const parsed = new Date(`${text}T00:00:00.000Z`)
        if (Number.isNaN(parsed.getTime())) {
            throw new BadRequestException(`Invalid date: ${value}`)
        }
        return parsed
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
