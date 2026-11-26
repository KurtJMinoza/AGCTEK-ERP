import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { FicoCompanyAccessService } from './fico-company-access.service'
import { FicoJournalIntegrityService } from './fico-journal-integrity.service'
import { FicoReconciliationService } from './fico-reconciliation.service'
import { FicoGeneralLedgerService } from './fico-general-ledger.service'
import {
    FICO_RECONCILIATION_CATEGORIES,
    FICO_RECONCILIATION_RECOMMENDED,
    type FicoReconciliationCategory,
} from './fico-reconciliation.categories'

export type DetectedReconciliationException = {
    fingerprint: string
    category: FicoReconciliationCategory
    severity: 'ERROR' | 'WARNING' | 'INFO'
    message: string
    sourceModule?: string | null
    sourceDocumentType?: string | null
    sourceDocumentId?: string | null
    journalEntryId?: string | null
    mmAccountingEventId?: string | null
    recommendedAction?: string | null
}

@Injectable()
export class FicoAccountingReconciliationService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: FicoCompanyAccessService,
        private readonly integrity: FicoJournalIntegrityService,
        private readonly reconciliation: FicoReconciliationService,
        private readonly generalLedger: FicoGeneralLedgerService,
    ) {}

    async scan(
        user: AuthRequestUser,
        query: {
            companyId: string
            dateFrom?: string
            dateTo?: string
            syncCases?: boolean
        },
    ) {
        await this.access.assertAccess(user, query.companyId)
        const detected = await this.detectExceptions(query)
        const summary = this.summarize(detected)

        if (query.syncCases) {
            await this.syncCases(query.companyId, detected)
        }

        const cases = await this.prisma.ficoReconciliationCase.findMany({
            where: { companyId: query.companyId },
            orderBy: [{ severity: 'asc' }, { updatedAt: 'desc' }],
            take: 500,
        })

        return {
            companyId: query.companyId,
            hasCriticalIntegrityExceptions: detected.some(
                (row) => row.severity === 'ERROR',
            ),
            summary,
            detected,
            cases,
        }
    }

    async updateCase(
        user: AuthRequestUser,
        id: string,
        body: {
            status?: string
            investigationNotes?: string
            assignedTo?: string
            resolutionCode?: string
            resolutionNotes?: string
        },
    ) {
        const existing = await this.prisma.ficoReconciliationCase.findUnique({
            where: { id },
        })
        if (!existing) throw new NotFoundException('Reconciliation case not found.')
        await this.access.assertAccess(user, existing.companyId)

        const resolved =
            body.status === 'RESOLVED' || body.status === 'DISMISSED'
                ? {
                      resolvedBy: user.id ?? 'system',
                      resolvedAt: new Date(),
                  }
                : {}

        const updated = await this.prisma.ficoReconciliationCase.update({
            where: { id },
            data: {
                ...body,
                ...resolved,
            },
        })

        await this.prisma.ficoAccountingAuditLog.create({
            data: {
                companyId: existing.companyId,
                action: 'RECONCILIATION_CASE_UPDATE',
                entityType: 'FicoReconciliationCase',
                entityId: id,
                actorId: user.id ?? null,
                newValues: body as Prisma.InputJsonValue,
                metadata: { fingerprint: existing.fingerprint },
            },
        })

        return updated
    }

    private async detectExceptions(query: {
        companyId: string
        dateFrom?: string
        dateTo?: string
    }): Promise<DetectedReconciliationException[]> {
        const out: DetectedReconciliationException[] = []
        const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined
        const dateTo = query.dateTo ? new Date(query.dateTo) : undefined

        const integrity = await this.integrity.run(
            { id: 'recon-scan' } as AuthRequestUser,
            { companyId: query.companyId, dryRun: true },
        )
        for (const row of integrity.exceptions) {
            out.push(this.mapIntegrity(row))
        }

        const mmAudit = await this.reconciliation.auditInventoryAccounting({
            companyId: query.companyId,
            dateFrom,
            dateTo,
        })
        for (const row of mmAudit.missingFinancialJournal) {
            out.push({
                fingerprint: `mm:missing:${row.inventoryTransactionId}`,
                category: FICO_RECONCILIATION_CATEGORIES.MISSING_FINANCIAL_POSTING,
                severity: 'ERROR',
                message: `Inventory movement ${row.inventoryTransactionId} has no consumed accounting event.`,
                sourceModule: 'MM',
                sourceDocumentType: 'INVENTORY_TRANSACTION',
                sourceDocumentId: row.inventoryTransactionId,
                recommendedAction:
                    FICO_RECONCILIATION_RECOMMENDED.MISSING_FINANCIAL_POSTING,
            })
        }
        for (const row of mmAudit.failedEvents) {
            out.push({
                fingerprint: `evt:failed:${row.eventId}`,
                category: FICO_RECONCILIATION_CATEGORIES.FAILED_ACCOUNTING_EVENT,
                severity: 'ERROR',
                message: `Accounting event failed for document ${row.documentId}.`,
                sourceModule: 'MM',
                sourceDocumentId: row.documentId,
                mmAccountingEventId: row.eventId,
                recommendedAction:
                    FICO_RECONCILIATION_RECOMMENDED.FAILED_ACCOUNTING_EVENT,
            })
        }
        for (const row of mmAudit.valueMismatches) {
            if (!row) continue
            out.push({
                fingerprint: `evt:mismatch:${row.eventId}`,
                category: FICO_RECONCILIATION_CATEGORIES.SOURCE_AMOUNT_MISMATCH,
                severity: 'ERROR',
                message: `Event value ${row.eventValue} ≠ MM value ${row.mmValue}.`,
                mmAccountingEventId: row.eventId,
                recommendedAction:
                    'Investigate valuation vs posting; post correction via authorized journal.',
            })
        }
        for (const key of mmAudit.duplicateJournalKeys) {
            out.push({
                fingerprint: `je:dup:${key}`,
                category: FICO_RECONCILIATION_CATEGORIES.DUPLICATE_SOURCE_POSTING,
                severity: 'ERROR',
                message: `Duplicate journal idempotency key ${key}.`,
                recommendedAction:
                    FICO_RECONCILIATION_RECOMMENDED.DUPLICATE_SOURCE_POSTING,
            })
        }

        const pendingEvents = await this.prisma.mmAccountingEvent.count({
            where: {
                companyId: query.companyId,
                status: { in: ['PENDING', 'PROCESSING', 'FAILED'] },
            },
        })
        if (pendingEvents > 0) {
            out.push({
                fingerprint: `evt:pending:${query.companyId}`,
                category: FICO_RECONCILIATION_CATEGORIES.PENDING_ACCOUNTING_EVENTS,
                severity: 'WARNING',
                message: `${pendingEvents} accounting event(s) are not fully consumed.`,
                recommendedAction: 'Clear failed/pending events before period close.',
            })
        }

        const postedReversed = await this.prisma.ficoJournalEntry.findMany({
            where: {
                companyId: query.companyId,
                status: 'REVERSED',
                reversalOfId: null,
            },
            select: { id: true, documentNumber: true },
            take: 100,
        })
        for (const journal of postedReversed) {
            const reversal = await this.prisma.ficoJournalEntry.findFirst({
                where: { reversalOfId: journal.id },
                select: { id: true },
            })
            if (!reversal) {
                out.push({
                    fingerprint: `je:noreversal:${journal.id}`,
                    category:
                        FICO_RECONCILIATION_CATEGORIES.MISSING_REVERSAL_DOCUMENT,
                    severity: 'ERROR',
                    message: `Journal ${journal.documentNumber ?? journal.id} is REVERSED without reversal document link.`,
                    journalEntryId: journal.id,
                })
            }
        }

        const posOrders = await this.prisma.sdSalesOrder.findMany({
            where: {
                companyId: query.companyId,
                channel: 'POS',
                status: { in: ['COMPLETED', 'PAID', 'PARTIALLY_PAID'] },
                voidedAt: null,
            },
            select: { id: true, orderNumber: true, totalAmount: true },
            take: 500,
        })
        for (const order of posOrders) {
            const key = `pos-revenue:${order.id}`
            const journal = await this.prisma.ficoJournalEntry.findUnique({
                where: { idempotencyKey: key },
                select: { id: true, status: true },
            })
            if (!journal) {
                out.push({
                    fingerprint: `pos:missing:${order.id}`,
                    category: FICO_RECONCILIATION_CATEGORIES.POS_REVENUE_MISMATCH,
                    severity: 'WARNING',
                    message: `POS order ${order.orderNumber} has no revenue journal (${key}).`,
                    sourceModule: 'SD',
                    sourceDocumentType: 'SALES_ORDER',
                    sourceDocumentId: order.id,
                    recommendedAction:
                        FICO_RECONCILIATION_RECOMMENDED.POS_REVENUE_MISMATCH,
                })
            }
        }

        const tb = await this.generalLedger.trialBalance(
            { id: 'recon' } as AuthRequestUser,
            { companyId: query.companyId, dateFrom: query.dateFrom, dateTo: query.dateTo },
        )
        const closingDiff = new Prisma.Decimal(
            tb.totals.closingDifference ?? '0',
        ).abs()
        if (closingDiff.gt(0.01)) {
            out.push({
                fingerprint: `tb:closing:${query.companyId}:${query.dateFrom ?? 'all'}:${query.dateTo ?? 'all'}`,
                category: FICO_RECONCILIATION_CATEGORIES.TRIAL_BALANCE_OUT_OF_BALANCE,
                severity: 'ERROR',
                message: `Trial balance closing difference is ${tb.totals.closingDifference}.`,
                recommendedAction:
                    FICO_RECONCILIATION_RECOMMENDED.TRIAL_BALANCE_OUT_OF_BALANCE,
            })
        }

        out.push({
            fingerprint: `grir:na:${query.companyId}`,
            category: FICO_RECONCILIATION_CATEGORIES.NOT_APPLICABLE,
            severity: 'INFO',
            message:
                'GR/IR automatic reconciliation report is not implemented; use MM supplier invoice / three-way match screens.',
        })

        return out
    }

    private mapIntegrity(row: {
        code: string
        severity: 'error' | 'warning'
        journalEntryId?: string
        mmAccountingEventId?: string
        message: string
    }): DetectedReconciliationException {
        const severity = row.severity === 'error' ? 'ERROR' : 'WARNING'
        const categoryMap: Record<string, FicoReconciliationCategory> = {
            POSTED_WITHOUT_LINES:
                FICO_RECONCILIATION_CATEGORIES.INCOMPLETE_JOURNAL_LINES,
            UNBALANCED_POSTED_JOURNAL:
                FICO_RECONCILIATION_CATEGORIES.UNBALANCED_JOURNAL,
            MISSING_DOCUMENT_NUMBER:
                FICO_RECONCILIATION_CATEGORIES.MISSING_OFFICIAL_DOCUMENT_NUMBER,
            INCONSISTENT_APPROVAL_STATUS:
                FICO_RECONCILIATION_CATEGORIES.INVALID_JOURNAL_LIFECYCLE,
            CONSUMED_EVENT_WITHOUT_JOURNAL:
                FICO_RECONCILIATION_CATEGORIES.MISSING_FINANCIAL_POSTING,
        }
        const category =
            categoryMap[row.code] ?? FICO_RECONCILIATION_CATEGORIES.INVALID_JOURNAL_LIFECYCLE
        return {
            fingerprint: `integrity:${row.code}:${row.journalEntryId ?? row.mmAccountingEventId ?? row.message}`,
            category,
            severity,
            message: row.message,
            journalEntryId: row.journalEntryId,
            mmAccountingEventId: row.mmAccountingEventId,
            recommendedAction: FICO_RECONCILIATION_RECOMMENDED[category] ?? null,
        }
    }

    private summarize(detected: DetectedReconciliationException[]) {
        const byCategory: Record<string, number> = {}
        const bySeverity: Record<string, number> = { ERROR: 0, WARNING: 0, INFO: 0 }
        for (const row of detected) {
            byCategory[row.category] = (byCategory[row.category] ?? 0) + 1
            bySeverity[row.severity] = (bySeverity[row.severity] ?? 0) + 1
        }
        return {
            total: detected.length,
            byCategory,
            bySeverity,
            errorCount: bySeverity.ERROR,
            warningCount: bySeverity.WARNING,
        }
    }

    private async syncCases(
        companyId: string,
        detected: DetectedReconciliationException[],
    ) {
        const activeFingerprints = new Set(detected.map((d) => d.fingerprint))
        for (const row of detected) {
            if (row.category === FICO_RECONCILIATION_CATEGORIES.NOT_APPLICABLE) {
                continue
            }
            await this.prisma.ficoReconciliationCase.upsert({
                where: {
                    companyId_fingerprint: {
                        companyId,
                        fingerprint: row.fingerprint,
                    },
                },
                create: {
                    companyId,
                    fingerprint: row.fingerprint,
                    category: row.category,
                    severity: row.severity,
                    status: 'OPEN',
                    message: row.message,
                    sourceModule: row.sourceModule,
                    sourceDocumentType: row.sourceDocumentType,
                    sourceDocumentId: row.sourceDocumentId,
                    journalEntryId: row.journalEntryId,
                    mmAccountingEventId: row.mmAccountingEventId,
                    recommendedAction: row.recommendedAction,
                },
                update: {
                    category: row.category,
                    severity: row.severity,
                    message: row.message,
                    recommendedAction: row.recommendedAction,
                },
            })
        }
        await this.prisma.ficoReconciliationCase.updateMany({
            where: {
                companyId,
                fingerprint: { notIn: [...activeFingerprints] },
                status: { in: ['OPEN', 'INVESTIGATING'] },
            },
            data: {
                status: 'RESOLVED',
                resolutionCode: 'AUTO_CLEARED',
                resolutionNotes:
                    'Exception no longer detected by reconciliation scan.',
                resolvedAt: new Date(),
            },
        })
    }
}