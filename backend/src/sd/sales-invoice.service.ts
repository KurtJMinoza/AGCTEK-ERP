import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { Prisma, PrismaClient } from '@prisma/client'

type Tx = Prisma.TransactionClient

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
            include: { lines: { orderBy: { lineNumber: 'asc' } } },
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
                include: { lines: { orderBy: { lineNumber: 'asc' } } },
            })
            return created
        })
    }

    /** DRAFT → ISSUED (dispatch or delivery per business rule). Idempotent. */
    async issueForSalesOrder(salesOrderId: string) {
        const invoice = await this.prisma.sdSalesInvoice.findUnique({
            where: { salesOrderId },
        })
        if (!invoice) {
            return this.createForSalesOrder(salesOrderId).then((created) =>
                this.prisma.sdSalesInvoice.update({
                    where: { id: created.id },
                    data: { status: 'ISSUED', issuedAt: new Date() },
                }),
            )
        }
        if (invoice.status === 'DRAFT') {
            return this.prisma.sdSalesInvoice.update({
                where: { id: invoice.id },
                data: { status: 'ISSUED', issuedAt: new Date() },
            })
        }
        return invoice
    }

    async listByCompany(companyId: string) {
        return this.prisma.sdSalesInvoice.findMany({
            where: { companyId },
            include: { lines: { orderBy: { lineNumber: 'asc' } } },
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