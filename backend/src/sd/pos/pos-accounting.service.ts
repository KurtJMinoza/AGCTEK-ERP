import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { FicoAccountingEventProcessorService } from '../../fico/fico-accounting-event-processor.service'

export type PosSaleAccountingSnapshot = {
    salesOrderId: string
    orderNumber: string
    receiptNumber: string | null
    paymentStatus: string | null
    accountingEvent: {
        id: string
        status: string
        lastError: string | null
        lastErrorCode: string | null
        attemptCount: number
        journalEntryId: string | null
    } | null
    journal: {
        id: string
        documentNumber: string | null
        status: string
    } | null
    arDocument: {
        id: string
        referenceNumber: string | null
        grossAmount: string
        openItemAmount: string | null
    } | null
    posReceivable: {
        balance: string
        originalAmount: string
        dueDate: string | null
    } | null
}

@Injectable()
export class PosAccountingService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly processor: FicoAccountingEventProcessorService,
    ) {}

    async getSaleAccounting(orderId: string): Promise<PosSaleAccountingSnapshot> {
        const order = await this.prisma.sdSalesOrder.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                orderNumber: true,
                receiptNumber: true,
                paymentStatus: true,
            },
        })
        if (!order) throw new NotFoundException('POS sale not found')

        const event = await this.prisma.mmAccountingEvent.findFirst({
            where: {
                idempotencyKey: `pos-revenue:${order.id}`,
            },
            select: {
                id: true,
                status: true,
                lastError: true,
                lastErrorCode: true,
                attemptCount: true,
                journalEntryId: true,
            },
        })

        const journal = event?.journalEntryId
            ? await this.prisma.ficoJournalEntry.findUnique({
                  where: { id: event.journalEntryId },
                  select: { id: true, documentNumber: true, status: true },
              })
            : null

        const arDocument = await this.prisma.ficoArDocument.findFirst({
            where: { sourceSalesOrderId: order.id },
            select: {
                id: true,
                referenceNumber: true,
                grossAmount: true,
                openItem: {
                    select: { openAmount: true },
                },
            },
        })

        const posReceivable = await this.prisma.sdPosReceivable.findUnique({
            where: { salesOrderId: order.id },
            select: { balance: true, originalAmount: true, dueDate: true },
        })

        return {
            salesOrderId: order.id,
            orderNumber: order.orderNumber,
            receiptNumber: order.receiptNumber,
            paymentStatus: order.paymentStatus,
            accountingEvent: event,
            journal,
            arDocument: arDocument
                ? {
                      id: arDocument.id,
                      referenceNumber: arDocument.referenceNumber,
                      grossAmount: arDocument.grossAmount.toString(),
                      openItemAmount:
                          arDocument.openItem?.openAmount.toString() ?? null,
                  }
                : null,
            posReceivable: posReceivable
                ? {
                      balance: posReceivable.balance.toString(),
                      originalAmount: posReceivable.originalAmount.toString(),
                      dueDate: posReceivable.dueDate?.toISOString().slice(0, 10) ?? null,
                  }
                : null,
        }
    }

    /**
     * Dry-run recovery audit; when dryRun=false, retries the durable accounting
     * event if no journal exists yet (idempotent).
     */
    async reconcileSaleAccountingById(orderId: string, dryRun = true) {
        const order = await this.prisma.sdSalesOrder.findUnique({
            where: { id: orderId },
            select: { orderNumber: true },
        })
        if (!order) throw new NotFoundException('POS sale not found')
        return this.reconcileSaleAccounting(order.orderNumber, dryRun)
    }

    async reconcileSaleAccounting(
        orderNumber: string,
        dryRun = true,
    ): Promise<{
        orderNumber: string
        dryRun: boolean
        action: 'NONE' | 'WOULD_RETRY' | 'RETRIED'
        before: PosSaleAccountingSnapshot | null
        after: PosSaleAccountingSnapshot | null
        notes: string[]
    }> {
        const order = await this.prisma.sdSalesOrder.findFirst({
            where: { orderNumber },
            select: { id: true },
        })
        if (!order) throw new NotFoundException(`Sale ${orderNumber} not found`)

        const before = await this.getSaleAccounting(order.id)
        const notes: string[] = []

        if (before.journal) {
            notes.push('Journal entry already exists — no recovery posting.')
            return {
                orderNumber,
                dryRun,
                action: 'NONE',
                before,
                after: before,
                notes,
            }
        }

        if (!before.accountingEvent) {
            notes.push('No PosSaleCompleted accounting event found.')
            return {
                orderNumber,
                dryRun,
                action: 'NONE',
                before,
                after: before,
                notes,
            }
        }

        if (before.accountingEvent.status === 'CONSUMED') {
            notes.push('Event already consumed but journal not linked — manual investigation required.')
            return {
                orderNumber,
                dryRun,
                action: 'NONE',
                before,
                after: before,
                notes,
            }
        }

        if (dryRun) {
            notes.push(
                `Would retry accounting event ${before.accountingEvent.id} (status ${before.accountingEvent.status}).`,
            )
            return {
                orderNumber,
                dryRun: true,
                action: 'WOULD_RETRY',
                before,
                after: before,
                notes,
            }
        }

        const status = await this.processor.retryEvent(before.accountingEvent.id)
        notes.push(`Retry completed with status ${status}.`)
        const after = await this.getSaleAccounting(order.id)
        return {
            orderNumber,
            dryRun: false,
            action: 'RETRIED',
            before,
            after,
            notes,
        }
    }
}