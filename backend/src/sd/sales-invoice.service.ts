import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { SdEventEmitterService } from './sd-event-emitter.service'
import { SD_EVENTS, type SdSalesInvoicePaidPayload } from './sd-event.types'
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
const salesOrderSummarySelect = {
    orderNumber: true,
    channel: true,
    status: true,
    customerId: true,
    customerName: true,
    customerEmail: true,
    company: { select: { id: true, code: true, name: true } },
    paymentMethod: true,
    paymentStatus: true,
    paymentReference: true,
    paymentProvider: true,
    isDemoPayment: true,
} satisfies Prisma.SdSalesOrderSelect

const invoiceInclude = {
    lines: { orderBy: { lineNumber: 'asc' as const } },
    salesOrder: { select: salesOrderSummarySelect },
} satisfies Prisma.SdSalesInvoiceInclude

const invoiceDetailInclude = {
    lines: { orderBy: { lineNumber: 'asc' as const } },
    salesOrder: {
        select: {
            ...salesOrderSummarySelect,
            company: {
                select: { id: true, code: true, name: true, address: true, tin: true },
            },
            shipToName: true,
            shipToPhone: true,
            shipToAddressLine1: true,
            shipToCity: true,
            shipToRegion: true,
            shipToPostalCode: true,
            shipToCountry: true,
            shippedAt: true,
            deliveredAt: true,
        },
    },
} satisfies Prisma.SdSalesInvoiceInclude

type BillToSource = {
    salesOrder: {
        customerId: string
        customerName: string | null
        customerEmail: string | null
    }
}

/**
 * Customer sales invoice (AR) — one per sales order (unique `salesOrderId`).
 * Posting rule: DRAFT at dispatch (goods issue posted), POSTED (ISSUED, or
 * PAID when the payment is already settled) on delivery POD. All methods are
 * idempotent.
 */
@Injectable()
export class SalesInvoiceService {
    private readonly logger = new Logger(SalesInvoiceService.name)

    constructor(
        private prisma: PrismaService,
        @Optional() private readonly sdEvents?: SdEventEmitterService,
    ) {}

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

    /**
     * DRAFT → ISSUED on delivery POD, then settled to PAID when the order
     * payment is already Paid. The invoice is always the full order — the
     * customer pays in full at the door. Idempotent.
     */
    async issueForSalesOrder(salesOrderId: string) {
        const invoice =
            (await this.prisma.sdSalesInvoice.findUnique({
                where: { salesOrderId },
                include: { lines: true },
            })) ?? (await this.createForSalesOrder(salesOrderId))

        if (invoice.status === 'DRAFT') {
            await this.prisma.sdSalesInvoice.updateMany({
                where: { id: invoice.id, status: 'DRAFT' },
                data: { status: 'ISSUED', issuedAt: new Date() },
            })
        }

        const order = await this.prisma.sdSalesOrder.findUnique({
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
        if (order?.paymentStatus === 'Paid') {
            await this.markPaidForSalesOrder(
                salesOrderId,
                order.payments[0]?.paidAt ?? new Date(),
            )
        }

        return this.prisma.sdSalesInvoice.findUnique({
            where: { id: invoice.id },
            include: invoiceInclude,
        })
    }

    /**
     * A payment settled after posting (COD collected after POD, bank transfer
     * verified) moves the posted invoice to PAID. A DRAFT stays DRAFT — an
     * invoice is never Paid before it is posted; `issueForSalesOrder` reads
     * the order payment and posts it straight to PAID on delivery.
     */
    async markPaidForSalesOrder(salesOrderId: string, paidAt: Date) {
        const result = await this.prisma.sdSalesInvoice.updateMany({
            where: { salesOrderId, status: 'ISSUED' },
            data: { status: 'PAID', paidAt },
        })
        if (result.count > 0) await this.announcePaid(salesOrderId, paidAt)
        return result
    }

    /**
     * Publishes the settled invoice (CRM loyalty earns on it). The payment is already committed, so a
     * failed hand-off is logged and the outbox row stays PENDING instead of failing the payment.
     */
    private async announcePaid(salesOrderId: string, paidAt: Date) {
        if (!this.sdEvents) return
        const invoice = await this.prisma.sdSalesInvoice.findUnique({
            where: { salesOrderId },
            select: {
                id: true,
                invoiceNumber: true,
                companyId: true,
                currency: true,
                totalAmount: true,
                salesOrder: { select: { customerId: true } },
            },
        })
        if (!invoice?.salesOrder.customerId) return
        const payload: SdSalesInvoicePaidPayload = {
            salesInvoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            salesOrderId,
            customerId: invoice.salesOrder.customerId,
            companyId: invoice.companyId,
            currency: invoice.currency,
            totalAmount: invoice.totalAmount.toString(),
            paidAt: paidAt.toISOString(),
            idempotencyKey: invoice.id,
        }
        try {
            await this.sdEvents.emit(SD_EVENTS.SALES_INVOICE_PAID, payload)
        } catch (err) {
            this.logger.error(
                `Invoice ${invoice.invoiceNumber}: paid hand-off failed (${err instanceof Error ? err.message : String(err)})`,
            )
        }
    }

    /** Billing status of an order's invoice for read-only displays (CRM); null before dispatch. */
    async statusForSalesOrder(salesOrderId: string, now = new Date()) {
        const invoice = await this.prisma.sdSalesInvoice.findUnique({
            where: { salesOrderId },
            select: {
                id: true,
                invoiceNumber: true,
                status: true,
                issuedAt: true,
                paidAt: true,
                currency: true,
                totalAmount: true,
            },
        })
        if (!invoice) return null
        return {
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            billingStatus: billingStatusOf(invoice, now),
            issuedAt: invoice.issuedAt,
            paidAt: invoice.paidAt,
            dueDate: dueDateFor(invoice.issuedAt),
            currency: invoice.currency,
            totalAmount: invoice.totalAmount.toFixed(2),
        }
    }

    /** Invoice document (`GET /sd/invoices/:id`). Read-only. */
    async findOne(id: string, now = new Date()) {
        const invoice = await this.prisma.sdSalesInvoice.findUnique({
            where: { id },
            include: invoiceDetailInclude,
        })
        if (!invoice) throw new NotFoundException('Invoice not found')

        const [withBillTo] = await this.withBillTo([invoice])
        return {
            ...withBillTo,
            dueDate: dueDateFor(invoice.issuedAt),
            billingStatus: billingStatusOf(invoice, now),
        }
    }

    /**
     * `SdSalesOrder.customerId` is not a foreign key (e-commerce orders may
     * reference a storefront account), so bill-to prefers the SD customer
     * master when one matches and falls back to the order's snapshot.
     */
    private async withBillTo<T extends BillToSource>(rows: T[]) {
        const ids = [...new Set(rows.map((r) => r.salesOrder.customerId))]
        const customers = ids.length
            ? await this.prisma.sdCustomer.findMany({
                  where: { id: { in: ids } },
                  select: { id: true, customerNumber: true, companyName: true, email: true },
              })
            : []
        const byId = new Map(customers.map((c) => [c.id, c]))
        return rows.map((row) => {
            const customer = byId.get(row.salesOrder.customerId)
            return {
                ...row,
                billTo: {
                    customerId: row.salesOrder.customerId,
                    customerNumber: customer?.customerNumber ?? null,
                    name:
                        customer?.companyName ??
                        row.salesOrder.customerName ??
                        row.salesOrder.customerEmail ??
                        null,
                    email: customer?.email ?? row.salesOrder.customerEmail ?? null,
                },
            }
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
