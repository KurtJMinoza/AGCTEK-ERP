import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { FicoAccountingReconciliationService } from './fico-accounting-reconciliation.service'
import { FicoCompanyAccessService } from './fico-company-access.service'
import {
    FICO_AUDIT_ACTIONS,
    FICO_FINANCIAL_ERROR_CODES,
    yearEndCloseIdempotencyKey,
} from './fico.constants'
import { FicoFinancialException } from './fico-financial-exception'
import { FicoGeneralLedgerService } from './fico-general-ledger.service'
import { FicoJournalService } from './fico-journal.service'
import { ledgerCommittedJournalWhere } from './fico-ledger-policy'

const EPSILON = new Prisma.Decimal('0.01')

export type YearEndCheck = {
    code: string
    label: string
    level: 'blocking' | 'warning' | 'completed'
    detail?: string
}

@Injectable()
export class FicoYearEndClosingService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: FicoCompanyAccessService,
        private readonly generalLedger: FicoGeneralLedgerService,
        private readonly reconciliation: FicoAccountingReconciliationService,
        private readonly journal: FicoJournalService,
    ) {}

    async getOverview(
        user: AuthRequestUser,
        companyId: string,
        fiscalYear: number,
    ) {
        await this.access.assertAccess(user, companyId)
        const run = await this.prisma.ficoPeriodClosingRun.findUnique({
            where: {
                companyId_runType_fiscalYear: {
                    companyId,
                    runType: 'YEAR_END',
                    fiscalYear,
                },
            },
        })
        const journalKey = yearEndCloseIdempotencyKey(companyId, fiscalYear)
        const journal = await this.prisma.ficoJournalEntry.findUnique({
            where: { idempotencyKey: journalKey },
            select: {
                id: true,
                documentNumber: true,
                status: true,
                postedAt: true,
            },
        })
        return {
            companyId,
            fiscalYear,
            run,
            closingJournal: journal,
            carryforwardStrategy:
                'Close income and expense to retained earnings via one idempotent journal. Balance sheet balances remain in the posted ledger (no duplicate carryforward batch).',
        }
    }

    async validate(
        user: AuthRequestUser,
        input: { companyId: string; fiscalYear: number },
    ) {
        await this.access.assertAccess(user, input.companyId)
        const checks = await this.buildChecks(user, input)
        const blocking = checks.filter((c) => c.level === 'blocking')
        const snapshot = {
            checks,
            trialBalance: await this.generalLedger.trialBalance(user, {
                companyId: input.companyId,
                ...(await this.fiscalYearRange(input.companyId, input.fiscalYear)),
            }),
            validatedAt: new Date().toISOString(),
        }

        const journalKey = yearEndCloseIdempotencyKey(
            input.companyId,
            input.fiscalYear,
        )
        const existingJournal = await this.prisma.ficoJournalEntry.findUnique({
            where: { idempotencyKey: journalKey },
            select: { id: true, status: true },
        })
        if (existingJournal?.status === 'POSTED') {
            throw new FicoFinancialException(
                FICO_FINANCIAL_ERROR_CODES.FICO_YEAR_END_ALREADY_EXECUTED,
                `Year-end closing for fiscal year ${input.fiscalYear} was already posted. Reverse that journal through the authorized reversal procedure before re-running.`,
                { journalEntryId: existingJournal.id },
            )
        }

        const run = await this.prisma.ficoPeriodClosingRun.upsert({
            where: {
                companyId_runType_fiscalYear: {
                    companyId: input.companyId,
                    runType: 'YEAR_END',
                    fiscalYear: input.fiscalYear,
                },
            },
            create: {
                companyId: input.companyId,
                runType: 'YEAR_END',
                fiscalYear: input.fiscalYear,
                status: blocking.length > 0 ? 'FAILED' : 'VALIDATED',
                validationSnapshot: snapshot as Prisma.InputJsonValue,
                idempotencyKey: journalKey,
                createdBy: user.id ?? null,
            },
            update: {
                status:
                    blocking.length > 0
                        ? 'FAILED'
                        : 'VALIDATED',
                validationSnapshot: snapshot as Prisma.InputJsonValue,
                approvedBy: null,
                approvedAt: null,
            },
        })

        await this.prisma.ficoAccountingAuditLog.create({
            data: {
                companyId: input.companyId,
                actorId: user.id ?? null,
                action: FICO_AUDIT_ACTIONS.YEAR_END_VALIDATE,
                entityType: 'FicoPeriodClosingRun',
                entityId: run.id,
                newValues: {
                    fiscalYear: input.fiscalYear,
                    blocking: blocking.length,
                } as Prisma.InputJsonValue,
            },
        })

        if (blocking.length > 0) {
            throw new FicoFinancialException(
                FICO_FINANCIAL_ERROR_CODES.FICO_YEAR_END_VALIDATION_FAILED,
                `Year-end validation failed with ${blocking.length} blocking control(s).`,
                { checks: blocking },
            )
        }

        return { run, checks, blockingCount: 0, readyForApproval: true }
    }

    async approve(
        user: AuthRequestUser,
        input: { companyId: string; fiscalYear: number },
    ) {
        await this.access.assertAccess(user, input.companyId)
        const run = await this.requireRun(input.companyId, input.fiscalYear)
        if (run.status !== 'VALIDATED') {
            throw new FicoFinancialException(
                FICO_FINANCIAL_ERROR_CODES.FICO_YEAR_END_NOT_APPROVED,
                'Only a validated year-end run can be approved.',
            )
        }
        const updated = await this.prisma.ficoPeriodClosingRun.update({
            where: { id: run.id },
            data: {
                status: 'APPROVED',
                approvedBy: user.id ?? null,
                approvedAt: new Date(),
            },
        })
        await this.prisma.ficoAccountingAuditLog.create({
            data: {
                companyId: input.companyId,
                actorId: user.id ?? null,
                action: FICO_AUDIT_ACTIONS.YEAR_END_APPROVE,
                entityType: 'FicoPeriodClosingRun',
                entityId: run.id,
                newValues: { fiscalYear: input.fiscalYear },
            },
        })
        return updated
    }

    async execute(
        user: AuthRequestUser,
        input: { companyId: string; fiscalYear: number },
    ) {
        await this.access.assertAccess(user, input.companyId)
        const run = await this.requireRun(input.companyId, input.fiscalYear)
        if (run.status !== 'APPROVED') {
            throw new FicoFinancialException(
                FICO_FINANCIAL_ERROR_CODES.FICO_YEAR_END_NOT_APPROVED,
                'Year-end closing must be validated and approved before execution.',
            )
        }

        const settings =
            await this.prisma.ficoCompanyAccountingSettings.findUnique({
                where: { companyId: input.companyId },
                select: {
                    status: true,
                    chartOfAccountsId: true,
                    baseCurrency: true,
                    defaultRetainedEarningsAccountId: true,
                },
            })
        if (!settings || settings.status !== 'ACTIVE') {
            throw new FicoFinancialException(
                FICO_FINANCIAL_ERROR_CODES.FICO_COMPANY_ACCOUNTING_INACTIVE,
                'Company accounting is not active.',
            )
        }
        if (!settings.chartOfAccountsId) {
            throw new FicoFinancialException(
                FICO_FINANCIAL_ERROR_CODES.FICO_COA_NOT_ASSIGNED,
                'Assign a chart of accounts before year-end closing.',
            )
        }
        const reAccountId = settings.defaultRetainedEarningsAccountId
        if (!reAccountId) {
            throw new FicoFinancialException(
                FICO_FINANCIAL_ERROR_CODES.FICO_RETAINED_EARNINGS_NOT_CONFIGURED,
                'Configure the default retained earnings account in company accounting settings.',
            )
        }

        const { dateFrom, dateTo, postingPeriod } =
            await this.fiscalYearRange(input.companyId, input.fiscalYear, true)

        const plAccounts = await this.prisma.ficoGlAccount.findMany({
            where: {
                chartOfAccountsId: settings.chartOfAccountsId,
                accountType: { in: ['REVENUE', 'EXPENSE'] },
                status: 'ACTIVE',
                isPostingAccount: true,
            },
            select: {
                id: true,
                accountCode: true,
                accountType: true,
                normalBalance: true,
            },
        })

        const aggregates = plAccounts.length
            ? await this.prisma.ficoJournalEntryLine.groupBy({
                  by: ['glAccountId'],
                  where: {
                      companyId: input.companyId,
                      glAccountId: { in: plAccounts.map((a) => a.id) },
                      journalEntry: ledgerCommittedJournalWhere({
                          postingDate: {
                              gte: new Date(dateFrom),
                              lte: new Date(dateTo),
                          },
                      }),
                  },
                  _sum: { debitAmount: true, creditAmount: true },
              })
            : []

        const aggByAccount = new Map(
            aggregates.map((row) => [row.glAccountId, row]),
        )

        const lines: Array<{
            glAccountId: string
            debit: Prisma.Decimal
            credit: Prisma.Decimal
            description: string
        }> = []
        let reDebit = new Prisma.Decimal(0)
        let reCredit = new Prisma.Decimal(0)

        for (const account of plAccounts) {
            const agg = aggByAccount.get(account.id)
            const debit = agg?._sum.debitAmount ?? new Prisma.Decimal(0)
            const credit = agg?._sum.creditAmount ?? new Prisma.Decimal(0)
            const net =
                account.normalBalance === 'CREDIT'
                    ? credit.minus(debit)
                    : debit.minus(credit)
            if (net.abs().lt(EPSILON)) continue

            if (account.accountType === 'REVENUE' && net.gt(0)) {
                lines.push({
                    glAccountId: account.id,
                    debit: net,
                    credit: new Prisma.Decimal(0),
                    description: `YE close revenue ${account.accountCode}`,
                })
                reCredit = reCredit.plus(net)
            } else if (account.accountType === 'EXPENSE' && net.gt(0)) {
                lines.push({
                    glAccountId: account.id,
                    debit: new Prisma.Decimal(0),
                    credit: net,
                    description: `YE close expense ${account.accountCode}`,
                })
                reDebit = reDebit.plus(net)
            }
        }

        const reNet = reCredit.minus(reDebit)
        if (reNet.gt(EPSILON)) {
            lines.push({
                glAccountId: reAccountId,
                debit: new Prisma.Decimal(0),
                credit: reNet,
                description: 'Year-end transfer to retained earnings',
            })
        } else if (reNet.lt(EPSILON.neg())) {
            lines.push({
                glAccountId: reAccountId,
                debit: reNet.abs(),
                credit: new Prisma.Decimal(0),
                description: 'Year-end transfer to retained earnings',
            })
        }

        if (lines.length < 2) {
            throw new FicoFinancialException(
                FICO_FINANCIAL_ERROR_CODES.FICO_YEAR_END_VALIDATION_FAILED,
                'No income or expense activity found to close for this fiscal year.',
            )
        }

        const totalDebit = lines.reduce(
            (s, l) => s.plus(l.debit),
            new Prisma.Decimal(0),
        )
        const totalCredit = lines.reduce(
            (s, l) => s.plus(l.credit),
            new Prisma.Decimal(0),
        )
        if (!totalDebit.eq(totalCredit)) {
            throw new FicoFinancialException(
                FICO_FINANCIAL_ERROR_CODES.FICO_JOURNAL_UNBALANCED,
                'Computed year-end closing journal is unbalanced.',
                { totalDebit: totalDebit.toString(), totalCredit: totalCredit.toString() },
            )
        }

        const journalKey = yearEndCloseIdempotencyKey(
            input.companyId,
            input.fiscalYear,
        )
        const postedAlready = await this.prisma.ficoJournalEntry.findUnique({
            where: { idempotencyKey: journalKey },
            select: { id: true, documentNumber: true, status: true },
        })
        if (postedAlready?.status === 'POSTED') {
            throw new FicoFinancialException(
                FICO_FINANCIAL_ERROR_CODES.FICO_DUPLICATE_POSTING,
                'Year-end closing journal was already posted for this fiscal year.',
                { journalEntryId: postedAlready.id },
            )
        }

        const postingDate = postingPeriod
            ? postingPeriod.endDate
            : new Date(dateTo)

        const result = await this.journal.postAutomaticJournal({
            companyId: input.companyId,
            documentType: 'YEAR_END_CLOSE',
            documentDate: postingDate,
            postingDate,
            currencyCode: settings.baseCurrency,
            sourceModule: 'FICO',
            sourceDocumentType: 'YEAR_END_CLOSING_RUN',
            sourceDocumentId: run.id,
            idempotencyKey: journalKey,
            description: `Year-end close FY ${input.fiscalYear}`,
            reference: `YEAR_END:${input.fiscalYear}`,
            lines,
            postImmediately: true,
            postingSource: 'SYSTEM',
            actorUserId: user.id ?? null,
        })

        const updated = await this.prisma.$transaction(async (tx) => {
            const row = await tx.ficoPeriodClosingRun.update({
                where: { id: run.id },
                data: {
                    status: 'EXECUTED',
                    closingJournalEntryId: result.journalEntryId,
                    executedBy: user.id ?? null,
                    executedAt: new Date(),
                },
            })
            await tx.ficoAccountingAuditLog.create({
                data: {
                    companyId: input.companyId,
                    actorId: user.id ?? null,
                    action: FICO_AUDIT_ACTIONS.YEAR_END_EXECUTE,
                    entityType: 'FicoPeriodClosingRun',
                    entityId: run.id,
                    newValues: {
                        fiscalYear: input.fiscalYear,
                        journalEntryId: result.journalEntryId,
                        documentNumber: result.documentNumber,
                    } as Prisma.InputJsonValue,
                },
            })
            return row
        })

        return {
            run: updated,
            journalEntryId: result.journalEntryId,
            documentNumber: result.documentNumber,
            duplicate: result.duplicate,
        }
    }

    private async requireRun(companyId: string, fiscalYear: number) {
        const run = await this.prisma.ficoPeriodClosingRun.findUnique({
            where: {
                companyId_runType_fiscalYear: {
                    companyId,
                    runType: 'YEAR_END',
                    fiscalYear,
                },
            },
        })
        if (!run) {
            throw new FicoFinancialException(
                FICO_FINANCIAL_ERROR_CODES.FICO_YEAR_END_VALIDATION_FAILED,
                'Run year-end validation before approval or execution.',
            )
        }
        return run
    }

    private async fiscalYearRange(
        companyId: string,
        fiscalYear: number,
        resolvePostingPeriod = false,
    ) {
        const periods = await this.prisma.ficoFinancialPeriod.findMany({
            where: {
                companyId,
                fiscalYear,
                periodType: 'NORMAL',
            },
            orderBy: { periodNumber: 'asc' },
        })
        if (!periods.length) {
            throw new FicoFinancialException(
                FICO_FINANCIAL_ERROR_CODES.FICO_YEAR_END_VALIDATION_FAILED,
                `No fiscal periods exist for fiscal year ${fiscalYear}.`,
            )
        }
        const dateFrom = periods[0].startDate.toISOString().slice(0, 10)
        const dateTo = periods[periods.length - 1].endDate
            .toISOString()
            .slice(0, 10)

        let postingPeriod = null as (typeof periods)[number] | null
        if (resolvePostingPeriod) {
            const special = await this.prisma.ficoFinancialPeriod.findFirst({
                where: {
                    companyId,
                    fiscalYear,
                    isYearEndAdjustment: true,
                    status: { in: ['OPEN', 'RESTRICTED'] },
                },
                orderBy: { periodNumber: 'desc' },
            })
            postingPeriod =
                special ??
                periods.find((p) => p.status === 'OPEN' || p.status === 'RESTRICTED') ??
                periods[periods.length - 1]
            if (
                postingPeriod &&
                !['OPEN', 'RESTRICTED'].includes(postingPeriod.status)
            ) {
                throw new FicoFinancialException(
                    FICO_FINANCIAL_ERROR_CODES.FICO_PERIOD_CLOSED,
                    'Open a year-end adjustment posting period before executing year-end close.',
                    { fiscalPeriodId: postingPeriod.id, status: postingPeriod.status },
                )
            }
        }
        return {
            dateFrom,
            dateTo,
            postingPeriod,
        }
    }

    private async buildChecks(
        user: AuthRequestUser,
        input: { companyId: string; fiscalYear: number },
    ): Promise<YearEndCheck[]> {
        const { dateFrom, dateTo } = await this.fiscalYearRange(
            input.companyId,
            input.fiscalYear,
        )
        const periods = await this.prisma.ficoFinancialPeriod.findMany({
            where: {
                companyId: input.companyId,
                fiscalYear: input.fiscalYear,
                periodType: 'NORMAL',
            },
        })
        const openNormal = periods.filter((p) =>
            ['OPEN', 'RESTRICTED', 'FUTURE'].includes(p.status),
        )
        const settings =
            await this.prisma.ficoCompanyAccountingSettings.findUnique({
                where: { companyId: input.companyId },
                select: {
                    defaultRetainedEarningsAccountId: true,
                    status: true,
                },
            })

        const recon = await this.reconciliation.scan(user, {
            companyId: input.companyId,
            dateFrom,
            dateTo,
            syncCases: false,
        })
        const tb = await this.generalLedger.trialBalance(user, {
            companyId: input.companyId,
            dateFrom,
            dateTo,
        })
        const closingDiff = new Prisma.Decimal(
            tb.totals.closingDifference ?? '0',
        ).abs()

        const checks: YearEndCheck[] = [
            {
                code: 'COMPANY_ACCOUNTING_ACTIVE',
                label: 'Company accounting active',
                level: settings?.status === 'ACTIVE' ? 'completed' : 'blocking',
                detail:
                    settings?.status === 'ACTIVE'
                        ? 'Clear'
                        : 'Activate company accounting settings.',
            },
            {
                code: 'RETAINED_EARNINGS_ACCOUNT',
                label: 'Retained earnings account configured',
                level: settings?.defaultRetainedEarningsAccountId
                    ? 'completed'
                    : 'blocking',
            },
            {
                code: 'PERIODS_CLOSED',
                label: 'All normal periods closed or locked',
                level: openNormal.length === 0 ? 'completed' : 'blocking',
                detail:
                    openNormal.length === 0
                        ? 'Clear'
                        : `${openNormal.length} period(s) still open or restricted.`,
            },
            {
                code: 'TRIAL_BALANCE',
                label: 'Trial balance balanced',
                level: closingDiff.lte(EPSILON) ? 'completed' : 'blocking',
                detail:
                    closingDiff.lte(EPSILON)
                        ? 'Clear'
                        : `Closing difference ${tb.totals.closingDifference}.`,
            },
            {
                code: 'RECONCILIATION',
                label: 'Reconciliation review',
                level: recon.hasCriticalIntegrityExceptions
                    ? 'blocking'
                    : recon.summary.warningCount > 0
                      ? 'warning'
                      : 'completed',
                detail: recon.hasCriticalIntegrityExceptions
                    ? 'Unresolved ERROR-level reconciliation exceptions.'
                    : 'Review completed.',
            },
        ]
        return checks
    }
}