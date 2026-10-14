import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { Prisma, PrismaClient } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import type { ListSalesInvoicesQueryDto } from './dto/sales-invoice.dto'
import {
    billingStatusOf,
    billingStatusWhere,
    dueDateFor,
    type BillingStatus,
} from './sales-invoice-billing'
import { INVOICE_PDF_DEFAULT_COMPANY, type InvoicePdfInput } from './sales-invoice-pdf.model'

type Tx = Prisma.TransactionClient

type DecimalSum = { toString(): string } | number | null

/** Outstanding receivable = issued totals less what was already refunded. */
export const outstandingOf = (sum: {
    totalAmount: DecimalSum
    refundedAmount: DecimalSum
}): number =>
    new Decimal((sum.totalAmount ?? 0).toString())
        .minus((sum.refundedAmount ?? 0).toString())
        .toNumber()

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

    /**
     * Billing dashboard list. KPIs cover the same company/search scope as the
     * table (ignoring the status filter) and are aggregated in the database.
     */
    async list(query: ListSalesInvoicesQueryDto, now = new Date()) {
        const page = Math.max(1, Number(query.page) || 1)
        const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20))
        const search = query.search?.trim()

        const scope: Prisma.SdSalesInvoiceWhereInput = {
            status: { not: 'DRAFT' },
            ...(query.companyId ? { companyId: query.companyId } : {}),
            ...(search
                ? {
                      OR: [
                          { invoiceNumber: { contains: search, mode: 'insensitive' } },
                          { salesOrder: { orderNumber: { contains: search, mode: 'insensitive' } } },
                          { salesOrder: { customerName: { contains: search, mode: 'insensitive' } } },
                          { salesOrder: { customerEmail: { contains: search, mode: 'insensitive' } } },
                      ],
                  }
                : {}),
        }
        const scoped = (status: BillingStatus) => ({
            AND: [scope, billingStatusWhere(status, now)],
        })
        const where = query.status ? scoped(query.status) : scope

        const [rows, total, pending, overdue, paid, outstanding] = await Promise.all([
            this.prisma.sdSalesInvoice.findMany({
                where,
                select: {
                    id: true,
                    invoiceNumber: true,
                    salesOrderId: true,
                    status: true,
                    currency: true,
                    totalAmount: true,
                    refundedAmount: true,
                    issuedAt: true,
                    paidAt: true,
                    salesOrder: {
                        select: {
                            orderNumber: true,
                            customerName: true,
                            customerEmail: true,
                            shipToName: true,
                        },
                    },
                },
                orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.sdSalesInvoice.count({ where }),
            this.prisma.sdSalesInvoice.count({ where: scoped('UNPAID') }),
            this.prisma.sdSalesInvoice.count({ where: scoped('OVERDUE') }),
            this.prisma.sdSalesInvoice.count({ where: scoped('PAID') }),
            this.prisma.sdSalesInvoice.aggregate({
                where: { AND: [scope, { status: 'ISSUED' }] },
                _sum: { totalAmount: true, refundedAmount: true },
            }),
        ])

        return {
            data: rows.map((row) => ({
                id: row.id,
                invoiceNumber: row.invoiceNumber,
                salesOrderId: row.salesOrderId,
                salesOrderReference: row.salesOrder.orderNumber,
                customerName:
                    row.salesOrder.customerName ??
                    row.salesOrder.shipToName ??
                    row.salesOrder.customerEmail,
                currency: row.currency,
                totalAmount: Number(row.totalAmount),
                refundedAmount: Number(row.refundedAmount),
                issuedAt: row.issuedAt,
                dueDate: dueDateFor(row.issuedAt),
                paidAt: row.paidAt,
                status: row.status,
                billingStatus: billingStatusOf(row, now),
            })),
            total,
            page,
            pageSize,
            summary: {
                pendingCount: pending,
                overdueCount: overdue,
                paidCount: paid,
                outstandingAmount: outstandingOf(outstanding._sum),
                currency: 'PHP',
            },
        }
    }

    /** Printable model input for `GET /sd/invoices/:id/pdf`. Read-only. */
    async pdfInput(id: string): Promise<InvoicePdfInput> {
        const invoice = await this.prisma.sdSalesInvoice.findUnique({
            where: { id },
            include: {
                lines: { orderBy: { lineNumber: 'asc' } },
                salesOrder: {
                    select: {
                        orderNumber: true,
                        customerName: true,
                        customerEmail: true,
                        paymentMethod: true,
                        shipToName: true,
                        shipToPhone: true,
                        shipToAddressLine1: true,
                        shipToCity: true,
                        shipToRegion: true,
                        shipToPostalCode: true,
                        shipToCountry: true,
                    },
                },
            },
        })
        if (!invoice) throw new NotFoundException('Invoice not found')

        const company =
            (await this.prisma.company.findUnique({
                where: { id: invoice.companyId },
                select: { name: true, address: true, tin: true },
            })) ??
            (await this.prisma.company.findFirst({
                where: { code: INVOICE_PDF_DEFAULT_COMPANY },
                select: { name: true, address: true, tin: true },
            }))
        const order = invoice.salesOrder

        return {
            invoiceNumber: invoice.invoiceNumber,
            status: invoice.status,
            currency: invoice.currency,
            issuedAt: invoice.issuedAt,
            paidAt: invoice.paidAt,
            createdAt: invoice.createdAt,
            subtotal: invoice.subtotal,
            discountAmount: invoice.discountAmount,
            shippingAmount: invoice.shippingAmount,
            totalAmount: invoice.totalAmount,
            refundedAmount: invoice.refundedAmount,
            notes: invoice.notes,
            salesOrderNumber: order.orderNumber,
            paymentMethod: order.paymentMethod,
            billTo: {
                name:
                    order.customerName ?? order.shipToName ?? order.customerEmail ?? 'Customer',
                email: order.customerEmail,
                phone: order.shipToPhone,
                addressLines: [
                    order.shipToAddressLine1 ?? '',
                    [order.shipToCity, order.shipToRegion, order.shipToPostalCode]
                        .filter(Boolean)
                        .join(', '),
                    order.shipToCountry ?? '',
                ],
            },
            lines: invoice.lines.map((line) => ({
                lineNumber: line.lineNumber,
                sku: line.sku,
                description: line.description,
                variantName: line.variantName,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                lineTotal: line.lineTotal,
            })),
            company,
        }
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
