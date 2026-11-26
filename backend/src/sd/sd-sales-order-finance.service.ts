import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { resolveSdActor } from './sd-user-actor.util'

export type SalesOrderJournalLineSummary = {
    lineNumber: number
    glAccountId: string
    accountCode: string
    accountName: string
    debitAmount: string
    creditAmount: string
    description: string | null
}

export type SalesOrderJournalSummary = {
    id: string
    documentNumber: string | null
    documentType: string
    status: string
    postingDate: string
    currencyCode: string
    totalAmount: string
    description: string | null
    sourceModule: string | null
    idempotencyKey: string | null
    primaryGlAccountId: string | null
    primaryAccountCode: string | null
    lineCount: number
    metadata: Record<string, unknown> | null
    lines: SalesOrderJournalLineSummary[]
}

export type SalesOrderArDocumentSummary = {
    id: string
    documentType: string
    status: string
    referenceNumber: string | null
    journalEntryId: string | null
    receivableAmount: string
}

export type SalesOrderAccountingSnapshot = {
    salesOrderId: string
    orderNumber: string
    companyId: string
    channel: string
    cashierUserId: string | null
    cashierName: string | null
    cashierEmployeeCode: string | null
    performedByUserId: string | null
    performedByName: string | null
    performedByEmployeeCode: string | null
    journals: SalesOrderJournalSummary[]
    accountingEvents: Array<{
        id: string
        eventType: string
        status: string
        journalEntryId: string | null
        lastError: string | null
        idempotencyKey: string | null
    }>
    arDocuments: SalesOrderArDocumentSummary[]
    inventoryJournals: SalesOrderJournalSummary[]
    salesInvoiceId: string | null
}

@Injectable()
export class SdSalesOrderFinanceService {
    constructor(private readonly prisma: PrismaService) {}

    async getAccountingForSalesOrder(
        salesOrderId: string,
        companyId?: string,
    ): Promise<SalesOrderAccountingSnapshot> {
        const order = await this.prisma.sdSalesOrder.findUnique({
            where: { id: salesOrderId },
            select: {
                id: true,
                orderNumber: true,
                companyId: true,
                channel: true,
                cashierUserId: true,
                salesOwnerId: true,
                createdBy: true,
            },
        })
        if (!order) throw new NotFoundException('Sales order not found')
        if (companyId && order.companyId && order.companyId !== companyId) {
            throw new NotFoundException('Sales order not found')
        }
        const resolvedCompanyId = order.companyId ?? companyId
        if (!resolvedCompanyId) {
            throw new NotFoundException('Sales order has no company scope')
        }

        const performerRef =
            order.channel === 'POS'
                ? order.cashierUserId
                : order.salesOwnerId ?? order.createdBy ?? order.cashierUserId
        const performer = await resolveSdActor(this.prisma, performerRef)
        const cashierName = performer.fullName

        const revenueIdempotency = `pos-revenue:${salesOrderId}`
        const events = await this.prisma.mmAccountingEvent.findMany({
            where: {
                companyId: resolvedCompanyId,
                OR: [
                    { documentId: salesOrderId },
                    { idempotencyKey: revenueIdempotency },
                ],
            },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                eventType: true,
                status: true,
                journalEntryId: true,
                lastError: true,
                lastErrorCode: true,
                idempotencyKey: true,
            },
        })

        const eventJournalIds = events
            .map((row) => row.journalEntryId)
            .filter((id): id is string => Boolean(id))

        const goodsIssues = await this.prisma.mmGoodsIssue.findMany({
            where: {
                sourceDocumentType: 'SALES_ORDER',
                sourceDocumentId: salesOrderId,
            },
            select: { id: true },
        })
        const goodsIssueIds = goodsIssues.map((row) => row.id)

        const journals = await this.prisma.ficoJournalEntry.findMany({
            where: {
                companyId: resolvedCompanyId,
                OR: [
                    { sourceDocumentId: salesOrderId },
                    { idempotencyKey: revenueIdempotency },
                    ...(goodsIssueIds.length
                        ? [{ sourceDocumentId: { in: goodsIssueIds } }]
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
                            select: { id: true, accountCode: true, accountName: true },
                        },
                    },
                },
            },
        })

        const mappedJournals = journals.map((row) => this.mapJournal(row))
        const inventoryJournals = mappedJournals.filter(
            (row) =>
                row.documentType === 'MM_GI' ||
                row.documentType.startsWith('MM_') ||
                row.metadata?.eventType === 'GoodsIssuePosted',
        )
        const sdJournals = mappedJournals.filter(
            (row) => !inventoryJournals.some((inv) => inv.id === row.id),
        )

        const [arDocuments, salesInvoice] = await Promise.all([
            this.prisma.ficoArDocument.findMany({
                where: {
                    companyId: resolvedCompanyId,
                    sourceSalesOrderId: salesOrderId,
                },
                select: {
                    id: true,
                    documentType: true,
                    status: true,
                    referenceNumber: true,
                    journalEntryId: true,
                    receivableAmount: true,
                },
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.sdSalesInvoice.findUnique({
                where: { salesOrderId },
                select: { id: true },
            }),
        ])

        return {
            salesOrderId: order.id,
            orderNumber: order.orderNumber,
            companyId: resolvedCompanyId,
            channel: order.channel,
            cashierUserId: order.cashierUserId,
            cashierName,
            cashierEmployeeCode: performer.employeeCode,
            performedByUserId: performer.userId,
            performedByName: performer.fullName,
            performedByEmployeeCode: performer.employeeCode,
            journals: sdJournals,
            accountingEvents: events,
            arDocuments: arDocuments.map((doc) => ({
                ...doc,
                receivableAmount: doc.receivableAmount.toString(),
            })),
            inventoryJournals,
            salesInvoiceId: salesInvoice?.id ?? null,
        }
    }

    private mapJournal(
        row: Prisma.FicoJournalEntryGetPayload<{
            include: {
                lines: {
                    include: {
                        glAccount: { select: { id: true; accountCode: true; accountName: true } }
                    }
                }
            }
        }>,
    ): SalesOrderJournalSummary {
        const primaryLine =
            row.lines.find((line) => line.debitAmount.gt(0)) ?? row.lines[0]
        const metadata =
            row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
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