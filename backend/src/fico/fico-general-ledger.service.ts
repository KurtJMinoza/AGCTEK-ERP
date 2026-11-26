import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { FicoCompanyAccessService } from './fico-company-access.service'
import { ledgerCommittedJournalWhere } from './fico-ledger-policy'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { FICO_FINANCIAL_ERROR_CODES } from './fico.constants'
import { FicoFinancialException } from './fico-financial-exception'

export type TrialBalanceQuery = {
    companyId: string
    dateFrom?: string
    dateTo?: string
    chartOfAccountsId?: string
    accountType?: string
    includeZeroBalances?: boolean
    page?: number
    pageSize?: number
}

function splitDebitCredit(
    debit: Prisma.Decimal,
    credit: Prisma.Decimal,
): { debit: string; credit: string } {
    const net = debit.minus(credit)
    if (net.gte(0)) {
        return { debit: net.toString(), credit: '0' }
    }
    return { debit: '0', credit: net.abs().toString() }
}

function sumSplit(
    rows: Array<{ debit: string; credit: string }>,
    field: 'debit' | 'credit',
): Prisma.Decimal {
    return rows.reduce(
        (acc, row) => acc.plus(new Prisma.Decimal(row[field] || 0)),
        new Prisma.Decimal(0),
    )
}

@Injectable()
export class FicoGeneralLedgerService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: FicoCompanyAccessService,
    ) {}

    async trialBalance(user: AuthRequestUser, query: TrialBalanceQuery) {
        await this.access.assertAccess(user, query.companyId)
        const page = Math.max(1, query.page ?? 1)
        const pageSize = Math.min(500, Math.max(1, query.pageSize ?? 100))
        const includeZero = query.includeZeroBalances === true

        const settings =
            await this.prisma.ficoCompanyAccountingSettings.findUnique({
                where: { companyId: query.companyId },
                select: { chartOfAccountsId: true },
            })
        const chartId = query.chartOfAccountsId ?? settings?.chartOfAccountsId
        if (!chartId) {
            return {
                companyId: query.companyId,
                chartOfAccountsId: null,
                items: [],
                totals: this.emptyTotals(),
                page,
                pageSize,
                totalAccounts: 0,
                dateFrom: query.dateFrom ?? null,
                dateTo: query.dateTo ?? null,
            }
        }

        const accountWhere: Prisma.FicoGlAccountWhereInput = {
            chartOfAccountsId: chartId,
            status: { not: 'DELETED' },
            ...(query.accountType ? { accountType: query.accountType } : {}),
        }

        const accounts = await this.prisma.ficoGlAccount.findMany({
            where: accountWhere,
            select: {
                id: true,
                accountCode: true,
                accountName: true,
                accountType: true,
                normalBalance: true,
                isPostingAccount: true,
            },
            orderBy: { accountCode: 'asc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
        })
        const totalAccounts = await this.prisma.ficoGlAccount.count({
            where: accountWhere,
        })

        await this.assertSingleCurrencyLedger(query.companyId, query.dateFrom, query.dateTo)

        const accountIds = accounts.map((a) => a.id)
        const periodStart = query.dateFrom
            ? new Date(query.dateFrom)
            : undefined
        const periodEnd = query.dateTo ? new Date(query.dateTo) : undefined

        const lineBase = {
            glAccountId: { in: accountIds },
            companyId: query.companyId,
        }

        const openingAggregates =
            periodStart && accountIds.length
                ? await this.prisma.ficoJournalEntryLine.groupBy({
                      by: ['glAccountId'],
                      where: {
                          ...lineBase,
                          journalEntry: ledgerCommittedJournalWhere({
                              postingDate: { lt: periodStart },
                          }),
                      },
                      _sum: { debitAmount: true, creditAmount: true },
                      _count: { _all: true },
                  })
                : []

        const periodPostingFilter: Prisma.DateTimeFilter | undefined =
            periodStart || periodEnd
                ? {
                      ...(periodStart ? { gte: periodStart } : {}),
                      ...(periodEnd ? { lte: periodEnd } : {}),
                  }
                : undefined

        const periodAggregates = accountIds.length
            ? await this.prisma.ficoJournalEntryLine.groupBy({
                  by: ['glAccountId'],
                  where: {
                      ...lineBase,
                      journalEntry: ledgerCommittedJournalWhere(
                          periodPostingFilter
                              ? { postingDate: periodPostingFilter }
                              : undefined,
                      ),
                  },
                  _sum: { debitAmount: true, creditAmount: true },
                  _count: { _all: true },
              })
            : []

        const openingByAccount = new Map(
            openingAggregates.map((row) => [row.glAccountId, row]),
        )
        const periodByAccount = new Map(
            periodAggregates.map((row) => [row.glAccountId, row]),
        )

        const openingSplits: Array<{ debit: string; credit: string }> = []
        const periodSplits: Array<{ debit: string; credit: string }> = []
        const closingSplits: Array<{ debit: string; credit: string }> = []

        let lineCount = 0
        const items = accounts
            .map((account) => {
                const openingAgg = openingByAccount.get(account.id)
                const periodAgg = periodByAccount.get(account.id)
                const openDebit =
                    openingAgg?._sum.debitAmount ?? new Prisma.Decimal(0)
                const openCredit =
                    openingAgg?._sum.creditAmount ?? new Prisma.Decimal(0)
                const periodDebit =
                    periodAgg?._sum.debitAmount ?? new Prisma.Decimal(0)
                const periodCredit =
                    periodAgg?._sum.creditAmount ?? new Prisma.Decimal(0)
                lineCount += periodAgg?._count._all ?? 0

                const opening = splitDebitCredit(openDebit, openCredit)
                const closingRaw = splitDebitCredit(
                    openDebit.plus(periodDebit),
                    openCredit.plus(periodCredit),
                )

                openingSplits.push(opening)
                periodSplits.push({
                    debit: periodDebit.toString(),
                    credit: periodCredit.toString(),
                })
                closingSplits.push(closingRaw)

                const net =
                    account.normalBalance === 'CREDIT'
                        ? openCredit
                              .plus(periodCredit)
                              .minus(openDebit.plus(periodDebit))
                        : openDebit
                              .plus(periodDebit)
                              .minus(openCredit.plus(periodCredit))

                return {
                    glAccountId: account.id,
                    accountCode: account.accountCode,
                    accountName: account.accountName,
                    accountType: account.accountType,
                    normalBalance: account.normalBalance,
                    debit: periodDebit.toString(),
                    credit: periodCredit.toString(),
                    netBalance: net.toString(),
                    openingDebit: opening.debit,
                    openingCredit: opening.credit,
                    periodDebit: periodDebit.toString(),
                    periodCredit: periodCredit.toString(),
                    closingDebit: closingRaw.debit,
                    closingCredit: closingRaw.credit,
                    lineCount: periodAgg?._count._all ?? 0,
                }
            })
            .filter((row) => {
                if (includeZero) return true
                const zero =
                    new Prisma.Decimal(row.openingDebit).eq(0) &&
                    new Prisma.Decimal(row.openingCredit).eq(0) &&
                    new Prisma.Decimal(row.periodDebit).eq(0) &&
                    new Prisma.Decimal(row.periodCredit).eq(0) &&
                    new Prisma.Decimal(row.closingDebit).eq(0) &&
                    new Prisma.Decimal(row.closingCredit).eq(0)
                return !zero
            })

        const totals = {
            debit: sumSplit(periodSplits, 'debit').toString(),
            credit: sumSplit(periodSplits, 'credit').toString(),
            lineCount,
            openingDebit: sumSplit(openingSplits, 'debit').toString(),
            openingCredit: sumSplit(openingSplits, 'credit').toString(),
            periodDebit: sumSplit(periodSplits, 'debit').toString(),
            periodCredit: sumSplit(periodSplits, 'credit').toString(),
            closingDebit: sumSplit(closingSplits, 'debit').toString(),
            closingCredit: sumSplit(closingSplits, 'credit').toString(),
        }

        const openingDiff = new Prisma.Decimal(totals.openingDebit).minus(
            new Prisma.Decimal(totals.openingCredit),
        )
        const movementDiff = new Prisma.Decimal(totals.periodDebit).minus(
            new Prisma.Decimal(totals.periodCredit),
        )
        const closingDiff = new Prisma.Decimal(totals.closingDebit).minus(
            new Prisma.Decimal(totals.closingCredit),
        )

        return {
            companyId: query.companyId,
            chartOfAccountsId: chartId,
            dateFrom: query.dateFrom ?? null,
            dateTo: query.dateTo ?? null,
            items,
            totals: {
                ...totals,
                openingDifference: openingDiff.toString(),
                movementDifference: movementDiff.toString(),
                closingDifference: closingDiff.toString(),
            },
            page,
            pageSize,
            totalAccounts,
            filteredView: Boolean(query.accountType),
        }
    }

    private async assertSingleCurrencyLedger(
        companyId: string,
        dateFrom?: string,
        dateTo?: string,
    ) {
        const postingFilter: { gte?: Date; lte?: Date } = {}
        if (dateFrom) postingFilter.gte = new Date(dateFrom)
        if (dateTo) postingFilter.lte = new Date(dateTo)
        const currencies = await this.prisma.ficoJournalEntry.groupBy({
            by: ['currencyCode'],
            where: ledgerCommittedJournalWhere({
                companyId,
                ...(Object.keys(postingFilter).length
                    ? { postingDate: postingFilter }
                    : {}),
            }),
        })
        if (currencies.length > 1) {
            throw new FicoFinancialException(
                FICO_FINANCIAL_ERROR_CODES.FICO_MIXED_CURRENCY_LEDGER,
                'Trial balance cannot aggregate journals in multiple currencies. Multi-currency reporting is not enabled.',
                {
                    currencies: currencies.map((row) => row.currencyCode),
                },
            )
        }
    }

    private emptyTotals() {
        return {
            debit: '0',
            credit: '0',
            lineCount: 0,
            openingDebit: '0',
            openingCredit: '0',
            periodDebit: '0',
            periodCredit: '0',
            closingDebit: '0',
            closingCredit: '0',
            openingDifference: '0',
            movementDifference: '0',
            closingDifference: '0',
        }
    }
}