import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { FicoCompanyAccessService } from './fico-company-access.service'
import type { AuthRequestUser } from '../auth/auth.decorator'

@Injectable()
export class FicoOverviewService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: FicoCompanyAccessService,
    ) {}

    async overview(companyId: string, user: AuthRequestUser) {
        await this.access.assertAccess(user, companyId)
        const [
            settings,
            chartCount,
            accountCount,
            postingAccountCount,
            periodCounts,
            openPeriods,
            journalCount,
            recentAudit,
        ] = await Promise.all([
            this.prisma.ficoCompanyAccountingSettings.findUnique({
                where: { companyId },
                include: {
                    chartOfAccounts: {
                        select: { id: true, code: true, name: true },
                    },
                    fiscalYearVariant: {
                        select: { id: true, code: true, name: true },
                    },
                    postingPeriodVariant: {
                        select: { id: true, code: true, name: true },
                    },
                },
            }),
            this.prisma.ficoChartOfAccounts.count(),
            this.prisma.ficoGlAccount.count(),
            this.prisma.ficoGlAccount.count({
                where: { status: 'ACTIVE', isPostingAccount: true },
            }),
            this.prisma.ficoFinancialPeriod.groupBy({
                by: ['status'],
                where: { companyId },
                _count: { _all: true },
            }),
            this.prisma.ficoFinancialPeriod.findMany({
                where: { companyId, status: { in: ['OPEN', 'RESTRICTED'] } },
                orderBy: [{ fiscalYear: 'asc' }, { periodNumber: 'asc' }],
                take: 6,
            }),
            this.prisma.ficoJournalEntry.count({ where: { companyId } }),
            this.prisma.ficoAccountingAuditLog.findMany({
                where: { companyId },
                orderBy: { createdAt: 'desc' },
                take: 8,
            }),
        ])

        const warnings: Array<{
            code: string
            severity: 'warning' | 'error'
            message: string
        }> = []
        if (!settings) {
            warnings.push({
                code: 'SETTINGS_MISSING',
                severity: 'error',
                message:
                    'Company accounting settings are not configured yet.',
            })
        } else {
            if (settings.status !== 'ACTIVE') {
                warnings.push({
                    code: 'SETTINGS_NOT_ACTIVE',
                    severity: 'warning',
                    message: `Accounting configuration is ${settings.status}. Postings are blocked until it is activated.`,
                })
            }
            if (!settings.chartOfAccountsId) {
                warnings.push({
                    code: 'COA_MISSING',
                    severity: 'error',
                    message: 'No chart of accounts is assigned.',
                })
            }
            if (!settings.fiscalYearVariantId) {
                warnings.push({
                    code: 'FISCAL_VARIANT_MISSING',
                    severity: 'error',
                    message: 'No fiscal year variant is assigned.',
                })
            }
            if (!settings.postingPeriodVariantId) {
                warnings.push({
                    code: 'POSTING_VARIANT_MISSING',
                    severity: 'error',
                    message: 'No posting period variant is assigned.',
                })
            }
        }
        if (!openPeriods.length) {
            warnings.push({
                code: 'NO_OPEN_PERIOD',
                severity: 'warning',
                message:
                    'No period is open for posting. Generate the fiscal year and open a period.',
            })
        }

        const periodsByStatus = Object.fromEntries(
            periodCounts.map((row) => [row.status, row._count._all]),
        )
        return {
            companyId,
            settings,
            metrics: {
                charts: chartCount,
                accounts: accountCount,
                postingAccounts: postingAccountCount,
                journals: journalCount,
                periods: Object.values(periodsByStatus).reduce(
                    (total, value) => total + value,
                    0,
                ),
                periodsByStatus,
            },
            openPeriods,
            warnings,
            recentActivity: recentAudit,
        }
    }
}
