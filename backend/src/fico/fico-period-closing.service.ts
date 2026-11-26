import { Injectable, NotFoundException } from '@nestjs/common'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { FicoAccountingReconciliationService } from './fico-accounting-reconciliation.service'
import { FicoCompanyAccessService } from './fico-company-access.service'

export type ClosingCheckResult = {
    code: string
    label: string
    level: 'blocking' | 'warning' | 'completed' | 'not_applicable'
    count?: number
    detail?: string
    href?: string
}

@Injectable()
export class FicoPeriodClosingService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: FicoCompanyAccessService,
        private readonly reconciliation: FicoAccountingReconciliationService,
    ) {}

    async readiness(
        user: AuthRequestUser,
        input: { companyId: string; fiscalPeriodId: string },
    ) {
        await this.access.assertAccess(user, input.companyId)
        const period = await this.prisma.ficoFinancialPeriod.findFirst({
            where: { id: input.fiscalPeriodId, companyId: input.companyId },
        })
        if (!period) throw new NotFoundException('Fiscal period not found.')

        const periodFilter = {
            companyId: input.companyId,
            fiscalPeriodId: period.id,
        }

        const [
            draftJournals,
            pendingApproval,
            approvedToPost,
            failedEvents,
            pendingEvents,
            recon,
        ] = await Promise.all([
            this.prisma.ficoJournalEntry.count({
                where: { ...periodFilter, status: 'DRAFT' },
            }),
            this.prisma.ficoJournalEntry.count({
                where: { ...periodFilter, approvalStatus: 'PENDING_APPROVAL' },
            }),
            this.prisma.ficoJournalEntry.count({
                where: {
                    ...periodFilter,
                    status: 'DRAFT',
                    approvalStatus: 'APPROVED',
                },
            }),
            this.prisma.mmAccountingEvent.count({
                where: { companyId: input.companyId, status: 'FAILED' },
            }),
            this.prisma.mmAccountingEvent.count({
                where: {
                    companyId: input.companyId,
                    status: { in: ['PENDING', 'PROCESSING'] },
                },
            }),
            this.reconciliation.scan(user, {
                companyId: input.companyId,
                dateFrom: period.startDate.toISOString().slice(0, 10),
                dateTo: period.endDate.toISOString().slice(0, 10),
                syncCases: false,
            }),
        ])

        const checks: ClosingCheckResult[] = [
            check(
                'UNPOSTED_DRAFTS',
                'Unposted draft journals',
                draftJournals,
                0,
                '/modules/fico/journal-entries',
            ),
            check(
                'PENDING_APPROVAL',
                'Journals pending approval',
                pendingApproval,
                0,
                '/modules/fico/journal-entries',
            ),
            check(
                'APPROVED_AWAITING_POST',
                'Approved journals awaiting posting',
                approvedToPost,
                0,
                '/modules/fico/journal-entries',
            ),
            check(
                'FAILED_ACCOUNTING_EVENTS',
                'Failed accounting events',
                failedEvents,
                0,
                '/modules/fico/accounting-events',
            ),
            check(
                'PENDING_ACCOUNTING_EVENTS',
                'Pending/processing accounting events',
                pendingEvents,
                0,
                '/modules/fico/accounting-events',
            ),
            {
                code: 'JOURNAL_INTEGRITY',
                label: 'Journal integrity exceptions',
                level:
                    recon.summary.errorCount > 0
                        ? 'blocking'
                        : recon.summary.warningCount > 0
                          ? 'warning'
                          : 'completed',
                count: recon.summary.errorCount + recon.summary.warningCount,
                detail: recon.hasCriticalIntegrityExceptions
                    ? 'Unresolved critical integrity exceptions'
                    : 'No critical integrity exceptions',
                href: '/modules/fico/accounting-reconciliation',
            },
            {
                code: 'MM_INVENTORY_RECON',
                label: 'MM inventory ↔ FICO reconciliation',
                level: mmInventoryBlocking(recon.summary.byCategory)
                    ? 'blocking'
                    : 'completed',
                count: mmInventoryCount(recon.summary.byCategory),
                href: '/modules/fico/accounting-reconciliation',
            },
            {
                code: 'POS_REVENUE_RECON',
                label: 'POS revenue reconciliation',
                level:
                    (recon.summary.byCategory.POS_REVENUE_MISMATCH ?? 0) > 0
                        ? 'warning'
                        : 'completed',
                count: recon.summary.byCategory.POS_REVENUE_MISMATCH ?? 0,
                href: '/modules/fico/accounting-reconciliation',
            },
            {
                code: 'TRIAL_BALANCE',
                label: 'Trial balance validation',
                level:
                    (recon.summary.byCategory.TRIAL_BALANCE_OUT_OF_BALANCE ?? 0) >
                    0
                        ? 'blocking'
                        : 'completed',
                count:
                    recon.summary.byCategory.TRIAL_BALANCE_OUT_OF_BALANCE ?? 0,
                href: '/modules/fico/trial-balance',
            },
            {
                code: 'GR_IR_RECON',
                label: 'GR/IR reconciliation',
                level: 'not_applicable',
                detail: 'GR/IR exception report not implemented in this phase.',
            },
            {
                code: 'AP_AR_OPEN_ITEMS',
                label: 'AP/AR open-item migration',
                level: 'not_applicable',
                detail:
                    'Subledger open-item migration is not implemented; opening balance batches block unsupported AP/AR scenarios.',
            },
        ]

        const blocking = checks.filter((c) => c.level === 'blocking').length
        const readyToClose = blocking === 0 && period.status === 'OPEN'

        return {
            companyId: input.companyId,
            fiscalPeriod: {
                id: period.id,
                fiscalYear: period.fiscalYear,
                periodNumber: period.periodNumber,
                name: period.name,
                status: period.status,
                startDate: period.startDate,
                endDate: period.endDate,
            },
            checks,
            summary: {
                blocking,
                warning: checks.filter((c) => c.level === 'warning').length,
                completed: checks.filter((c) => c.level === 'completed').length,
                notApplicable: checks.filter((c) => c.level === 'not_applicable')
                    .length,
                readyToClose,
            },
        }
    }
}

function mmInventoryCount(byCategory: Record<string, number>) {
    return (
        (byCategory.MISSING_FINANCIAL_POSTING ?? 0) +
        (byCategory.SOURCE_AMOUNT_MISMATCH ?? 0) +
        (byCategory.INVENTORY_VALUATION_MISMATCH ?? 0) +
        (byCategory.FAILED_ACCOUNTING_EVENT ?? 0)
    )
}

function mmInventoryBlocking(byCategory: Record<string, number>) {
    return mmInventoryCount(byCategory) > 0
}

function check(
    code: string,
    label: string,
    count: number,
    okWhen: number,
    href: string,
): ClosingCheckResult {
    return {
        code,
        label,
        count,
        href,
        level: count > okWhen ? 'blocking' : 'completed',
        detail: count > okWhen ? `${count} item(s) require action` : 'Clear',
    }
}