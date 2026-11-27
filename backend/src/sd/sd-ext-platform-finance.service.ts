import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { GoodsIssueService } from '../mm/stock-ops/goods-issue.service'
import { resolveSdActor } from './sd-user-actor.util'
import type {
    SalesOrderAccountingSnapshot,
    SalesOrderJournalLineSummary,
    SalesOrderJournalSummary,
} from './sd-sales-order-finance.service'

const EXT_GI_SOURCE = 'EXT_PLATFORM_SALE'

export type ExtPlatformReceivableSnapshot = {
    arDocumentId: string | null
    openAmount: string | null
    originalAmount: string | null
    openItemStatus: string | null
    customerId: string | null
    customerName: string | null
    dueDate: string | null
}

export type ExtPlatformAccountingSnapshot = {
    transactionId: string
    transactionNumber: string
    companyId: string
    status: string
    settlementStatus: string
    platformFees: string
    actualPlatformFees: string | null
    actualPayout: string | null
    settledAt: string | null
    settlementJournalEntryId: string | null
    recordedByUserId: string | null
    recordedByName: string | null
    recordedByEmployeeCode: string | null
    approvedByUserId: string | null
    approvedByName: string | null
    approvedByEmployeeCode: string | null
    receivable: ExtPlatformReceivableSnapshot | null
    journals: SalesOrderJournalSummary[]
    accountingEvents: SalesOrderAccountingSnapshot['accountingEvents']
}

@Injectable()
export class SdExtPlatformFinanceService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly goodsIssue: GoodsIssueService,
    ) {}

    async getAccountingForTransaction(
        transactionId: string,
        companyId?: string,
    ): Promise<ExtPlatformAccountingSnapshot> {
        const tx = await this.prisma.sdExtPlatformTransaction.findUnique({
            where: { id: transactionId },
            select: {
                id: true,
                transactionNumber: true,
                companyId: true,
                status: true,
                settlementStatus: true,
                platformFees: true,
                actualPlatformFees: true,
                actualPayout: true,
                settledAt: true,
                settlementJournalEntryId: true,
                createdBy: true,
                approvedBy: true,
                ficoArDocument: {
                    select: {
                        id: true,
                        customerId: true,
                        receivableAmount: true,
                        dueDate: true,
                        customer: { select: { companyName: true } },
                        openItem: {
                            select: {
                                originalAmount: true,
                                openAmount: true,
                                status: true,
                            },
                        },
                    },
                },
            },
        })
        if (!tx) throw new NotFoundException('Transaction not found.')
        if (companyId && tx.companyId !== companyId) {
            throw new NotFoundException('Transaction not found.')
        }

        const [recorded, approved] = await Promise.all([
            resolveSdActor(this.prisma, tx.createdBy),
            resolveSdActor(this.prisma, tx.approvedBy),
        ])

        const goodsIssues = await this.prisma.mmGoodsIssue.findMany({
            where: {
                sourceDocumentType: EXT_GI_SOURCE,
                sourceDocumentId: tx.id,
            },
            select: { id: true, status: true },
        })
        for (const gi of goodsIssues) {
            if (gi.status === 'POSTED') {
                await this.goodsIssue.findOne(gi.id)
            }
        }
        const giIds = goodsIssues.map((row) => row.id)

        const events = await this.prisma.mmAccountingEvent.findMany({
            where: {
                companyId: tx.companyId,
                OR: [
                    { documentId: tx.id },
                    ...(giIds.length ? [{ documentId: { in: giIds } }] : []),
                ],
            },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                eventType: true,
                status: true,
                journalEntryId: true,
                lastError: true,
                idempotencyKey: true,
            },
        })

        const eventJournalIds = events
            .map((row) => row.journalEntryId)
            .filter((id): id is string => Boolean(id))

        const journals = await this.prisma.ficoJournalEntry.findMany({
            where: {
                companyId: tx.companyId,
                OR: [
                    { sourceDocumentId: tx.id },
                    ...(giIds.length
                        ? [{ sourceDocumentId: { in: giIds } }]
                        : []),
                    ...(eventJournalIds.length
                        ? [{ id: { in: eventJournalIds } }]
                        : []),
                ],
            },
            orderBy: [{ postingDate: 'desc' }, { createdAt: 'desc' }],
            include: {
                lines: {
                    orderBy: { lineNumber: 'asc' },
                    include: {
                        glAccount: {
                            select: {
                                id: true,
                                accountCode: true,
                                accountName: true,
                            },
                        },
                    },
                },
            },
        })

        const ar = tx.ficoArDocument
        const receivable: ExtPlatformReceivableSnapshot | null = ar
            ? {
                  arDocumentId: ar.id,
                  openAmount: ar.openItem?.openAmount.toString() ?? null,
                  originalAmount:
                      ar.openItem?.originalAmount.toString() ??
                      ar.receivableAmount.toString(),
                  openItemStatus: ar.openItem?.status ?? null,
                  customerId: ar.customerId,
                  customerName: ar.customer.companyName,
                  dueDate: ar.dueDate?.toISOString().slice(0, 10) ?? null,
              }
            : null

        return {
            transactionId: tx.id,
            transactionNumber: tx.transactionNumber,
            companyId: tx.companyId,
            status: tx.status,
            settlementStatus: tx.settlementStatus,
            platformFees: tx.platformFees.toString(),
            actualPlatformFees: tx.actualPlatformFees?.toString() ?? null,
            actualPayout: tx.actualPayout?.toString() ?? null,
            settledAt: tx.settledAt?.toISOString() ?? null,
            settlementJournalEntryId: tx.settlementJournalEntryId,
            recordedByUserId: recorded.userId,
            recordedByName: recorded.fullName,
            recordedByEmployeeCode: recorded.employeeCode,
            approvedByUserId: approved.userId,
            approvedByName: approved.fullName,
            approvedByEmployeeCode: approved.employeeCode,
            receivable,
            journals: journals.map((row) => this.mapJournal(row)),
            accountingEvents: events,
        }
    }

    private mapJournal(
        row: Prisma.FicoJournalEntryGetPayload<{
            include: {
                lines: {
                    include: {
                        glAccount: {
                            select: {
                                id: true
                                accountCode: true
                                accountName: true
                            }
                        }
                    }
                }
            }
        }>,
    ): SalesOrderJournalSummary {
        const primaryLine =
            row.lines.find((line) => line.debitAmount.gt(0)) ?? row.lines[0]
        const metadata =
            row.metadata &&
            typeof row.metadata === 'object' &&
            !Array.isArray(row.metadata)
                ? (row.metadata as Record<string, unknown>)
                : null
        const lines: SalesOrderJournalLineSummary[] = row.lines.map((line) => ({
            lineNumber: line.lineNumber,
            glAccountId: line.glAccountId,
            accountCode: line.glAccount.accountCode,
            accountName: line.glAccount.accountName,
            debitAmount: line.debitAmount.toString(),
            creditAmount: line.creditAmount.toString(),
            description: line.description,
        }))
        return {
            id: row.id,
            documentNumber: row.documentNumber,
            documentType: row.documentType,
            status: row.status,
            postingDate: row.postingDate.toISOString(),
            currencyCode: row.currencyCode,
            totalAmount: row.totalAmount.toString(),
            description: row.description,
            sourceModule: row.sourceModule,
            idempotencyKey: row.idempotencyKey,
            primaryGlAccountId: primaryLine?.glAccountId ?? null,
            primaryAccountCode: primaryLine?.glAccount.accountCode ?? null,
            lineCount: row.lines.length,
            metadata,
            lines,
        }
    }
}