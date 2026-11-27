import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type {
    SalesOrderAccountingSnapshot,
    SalesOrderJournalSummary,
} from './sd-sales-order-finance.service'

export type ReturnRequestAccountingSnapshot = {
    returnRequestId: string
    requestNumber: string
    companyId: string
    salesOrderId: string
    mmCustomerReturnId: string | null
    journals: SalesOrderJournalSummary[]
    accountingEvents: SalesOrderAccountingSnapshot['accountingEvents']
}

/**
 * Read-only accounting snapshot for a customer return request:
 * MM restock (SALES_RETURN) + SD refund (SdSalesReturnRefundPaid) journals.
 */
@Injectable()
export class SdReturnRequestFinanceService {
    constructor(private readonly prisma: PrismaService) {}

    async getAccountingForReturnRequest(
        returnRequestId: string,
        companyId?: string,
    ): Promise<ReturnRequestAccountingSnapshot> {
        const request = await this.prisma.sdReturnRequest.findUnique({
            where: { id: returnRequestId },
            select: {
                id: true,
                requestNumber: true,
                companyId: true,
                salesOrderId: true,
                mmCustomerReturnId: true,
            },
        })
        if (!request) throw new NotFoundException('Return request not found')
        if (companyId && request.companyId !== companyId) {
            throw new NotFoundException('Return request not found')
        }

        const refund = await this.prisma.sdRefund.findUnique({
            where: { returnRequestId },
            select: { id: true },
        })
        const refundIdempotency = refund
            ? `sales-return-refund:${request.id}:${refund.id}`
            : null
        const restockIdempotency = request.mmCustomerReturnId
            ? `CustomerReturnRestocked:CUSTOMER_RETURN:${request.mmCustomerReturnId}`
            : null

        const events = await this.prisma.mmAccountingEvent.findMany({
            where: {
                companyId: request.companyId,
                OR: [
                    { documentId: request.id },
                    ...(request.mmCustomerReturnId
                        ? [{ documentId: request.mmCustomerReturnId }]
                        : []),
                    ...(refundIdempotency
                        ? [{ idempotencyKey: refundIdempotency }]
                        : []),
                    ...(restockIdempotency
                        ? [{ idempotencyKey: restockIdempotency }]
                        : []),
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
                companyId: request.companyId,
                OR: [
                    { sourceDocumentId: request.id },
                    ...(request.mmCustomerReturnId
                        ? [{ sourceDocumentId: request.mmCustomerReturnId }]
                        : []),
                    ...(refundIdempotency
                        ? [{ idempotencyKey: refundIdempotency }]
                        : []),
                    ...(restockIdempotency
                        ? [{ idempotencyKey: restockIdempotency }]
                        : []),
                    ...(eventJournalIds.length
                        ? [{ id: { in: eventJournalIds } }]
                        : []),
                    {
                        metadata: {
                            path: ['returnRequestId'],
                            equals: request.id,
                        },
                    },
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

        return {
            returnRequestId: request.id,
            requestNumber: request.requestNumber,
            companyId: request.companyId,
            salesOrderId: request.salesOrderId,
            mmCustomerReturnId: request.mmCustomerReturnId,
            journals: journals
                .filter(
                    (row) =>
                        row.status !== 'LEGACY' &&
                        // Header-only stubs are not successful return accounting.
                        row.lines.length > 0,
                )
                .map((row) => this.mapJournal(row)),
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
            lines: row.lines.map((line) => ({
                lineNumber: line.lineNumber,
                glAccountId: line.glAccountId,
                accountCode: line.glAccount.accountCode,
                accountName: line.glAccount.accountName,
                debitAmount: line.debitAmount.toString(),
                creditAmount: line.creditAmount.toString(),
                description: line.description,
            })),
        }
    }
}
