import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Prevents duplicate SD revenue recognition when billing (AR invoice) and
 * POS/SD revenue journals target the same sales order.
 */
@Injectable()
export class FicoSdRevenueGuardService {
    constructor(private readonly prisma: PrismaService) {}

    revenueIdempotencyKey(salesOrderId: string) {
        return `pos-revenue:${salesOrderId}`
    }

    async findPostedRevenueJournal(salesOrderId: string) {
        return this.prisma.ficoJournalEntry.findFirst({
            where: {
                status: 'POSTED',
                OR: [
                    { idempotencyKey: this.revenueIdempotencyKey(salesOrderId) },
                    {
                        sourceDocumentId: salesOrderId,
                        documentType: { in: ['SD_REVENUE', 'CUSTOMER_INVOICE'] },
                    },
                ],
            },
            select: { id: true, documentNumber: true, idempotencyKey: true },
        })
    }

    async shouldSkipInvoiceFinancialPosting(salesOrderId: string) {
        const order = await this.prisma.sdSalesOrder.findUnique({
            where: { id: salesOrderId },
            select: { channel: true, paymentStatus: true },
        })
        if (!order) return { skip: true, reason: 'ORDER_NOT_FOUND' as const }
        if (order.channel === 'POS') {
            return {
                skip: true,
                reason: 'POS_REVENUE_AT_REGISTER' as const,
            }
        }
        const existingRevenue = await this.findPostedRevenueJournal(salesOrderId)
        if (existingRevenue) {
            return {
                skip: true,
                reason: 'REVENUE_ALREADY_POSTED' as const,
                journalEntryId: existingRevenue.id,
            }
        }
        return { skip: false as const }
    }
}