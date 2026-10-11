import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { Prisma, PrismaClient } from '@prisma/client'

type Tx = Prisma.TransactionClient

/**
 * Payment remains owned by the sales order/payment record. Invoices expose
 * that authoritative state through their existing sales-order relation rather
 * than carrying a second, drifting payment model.
 */
const invoiceInclude = {
    lines: { orderBy: { lineNumber: 'asc' as const } },
    salesOrder: {
        select: {
            paymentMethod: true,
            paymentStatus: true,
            paymentReference: true,
            paymentProvider: true,
            isDemoPayment: true,
        },
    },
} satisfies Prisma.SdSalesInvoiceInclude

/**
 * Customer sales invoice (AR) — one per sales order (unique `salesOrderId`),
 * auto-created when the shipment is dispatched (goods issue posted) and
 * finalized on delivery. All methods are idempotent.
 */
@Injectable()
export class SalesInvoiceService {
    private readonly logger = new Logger(SalesInvoiceService.name)

    constructor(private prisma: PrismaService) {}

    async createForSalesOrder(salesOrderId: string) {
        const existing = await this.prisma.sdSalesInvoice.findUnique({
            where: { salesOrderId },
            include: invoiceInclude,
        })
        if (existing) return existing

        const order = await this.prisma.sdSalesOrder.findUnique({
            where: { id: salesOrderId },
            include: {
                lines: { orderBy: { lineNumber: 'asc' } },
                shipments: { take: 1, orderBy: { createdAt: 'desc' } },
            },
        })
        if (!order) throw new NotFoundException('Sales order not found')
        if (!order.companyId) {
            throw new Error(
                `Sales order ${order.orderNumber} has no company scope for invoicing`,
            )
        }
        const companyId = order.companyId

        return this.prisma.$transaction(async (tx) => {
            const created = await tx.sdSalesInvoice.create({
                data: {
                    invoiceNumber: await this.nextInvoiceNumber(tx),
                    companyId,
                    salesOrderId: order.id,
                    shipmentId: order.shipments[0]?.id ?? null,
                    status: 'DRAFT',
                    currency: order.currency ?? 'PHP',
                    subtotal: order.subtotal ?? 0,
                    discountAmount: order.discountAmount ?? 0,
                    shippingAmount: order.shippingAmount ?? 0,
                    totalAmount: order.totalAmount ?? 0,
                    lines: {
                        create: order.lines.map((line, idx) => ({
                            lineNumber: line.lineNumber ?? idx + 1,
                            salesOrderLineId: line.id,
                            description: line.description,
                            sku: line.sku ?? line.variantSku ?? '',
                            variantName: line.variantName,
                            quantity: line.quantity,
                            unitPrice: line.unitPrice ?? 0,
                            lineTotal: line.lineTotal ?? 0,
                        })),
                    },
                },
                include: invoiceInclude,
            })
            return created
        })
    }

    /** DRAFT → ISSUED (dispatch or delivery per business rule). Idempotent. */
    async issueForSalesOrder(salesOrderId: string) {
        const payment = await this.prisma.sdSalesOrder.findUnique({
            where: { id: salesOrderId },
            select: {
                paymentStatus: true,
                payments: {
                    where: { status: 'Paid' },
                    orderBy: { paidAt: 'desc' },
                    take: 1,
                    select: { paidAt: true },
                },
            },
        })
        const paidAt = payment?.payments[0]?.paidAt ?? null
        const issueData = {
            status: payment?.paymentStatus === 'Paid' ? 'PAID' : 'ISSUED',
            issuedAt: new Date(),
            ...(paidAt ? { paidAt } : {}),
        }
        const invoice = await this.prisma.sdSalesInvoice.findUnique({
            where: { salesOrderId },
        })
        if (!invoice) {
            return this.createForSalesOrder(salesOrderId).then((created) =>
                this.prisma.sdSalesInvoice.update({
                    where: { id: created.id },
                    data: issueData,
                    include: invoiceInclude,
                }),
            )
        }
        if (invoice.status === 'DRAFT') {
            return this.prisma.sdSalesInvoice.update({
                where: { id: invoice.id },
                data: issueData,
                include: invoiceInclude,
            })
        }
        return invoice
    }

    /**
     * A later COD collection or bank-transfer verification updates an already
     * issued invoice without duplicating the payment record. If no invoice has
     * been issued yet, `issueForSalesOrder` reads the order payment and marks
     * it paid when dispatch eventually creates the invoice.
     */
    async markPaidForSalesOrder(salesOrderId: string, paidAt: Date) {
        return this.prisma.sdSalesInvoice.updateMany({
            where: {
                salesOrderId,
                status: { notIn: ['CANCELLED', 'REFUNDED'] },
            },
            data: { status: 'PAID', paidAt },
        })
    }

    async listByCompany(companyId: string) {
        return this.prisma.sdSalesInvoice.findMany({
            where: { companyId },
            include: invoiceInclude,
            orderBy: { createdAt: 'desc' },
            take: 200,
        })
    }

    private async nextInvoiceNumber(tx: Tx) {
        const prefix = `INV-${new Date()
            .toISOString()
            .slice(0, 10)
            .replace(/-/g, '')}`
        const count = await tx.sdSalesInvoice.count({
            where: { invoiceNumber: { startsWith: prefix } },
        })
        return `${prefix}-${String(count + 1).padStart(4, '0')}`
    }
}

export type { PrismaClient }
