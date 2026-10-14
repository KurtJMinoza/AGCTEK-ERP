/**
 * Pure view model for the customer invoice PDF (mirrors `quotation-pdf.model.ts`). No Prisma /
 * Nest dependencies; values are display-ready.
 */
import { formatQuotationMoney, type DecimalLike } from './quotation-pdf.model'
import { billingStatusOf, dueDateFor, type BillingStatus } from './sales-invoice-billing'

export const formatInvoiceMoney = formatQuotationMoney

export const INVOICE_PDF_DEFAULT_COMPANY = 'AGCTEK'

export const INVOICE_PDF_DISCLAIMER =
    'Please settle this invoice on or before the due date. Quote the invoice number with your payment.'

export type InvoicePdfInput = {
    invoiceNumber: string
    status: string
    currency: string
    issuedAt: Date | null
    paidAt: Date | null
    createdAt: Date
    subtotal: DecimalLike
    discountAmount: DecimalLike
    shippingAmount: DecimalLike
    totalAmount: DecimalLike
    refundedAmount: DecimalLike
    notes: string | null
    salesOrderNumber: string
    paymentMethod: string | null
    billTo: {
        name: string
        email?: string | null
        phone?: string | null
        addressLines: string[]
    }
    lines: Array<{
        lineNumber: number
        sku: string
        description: string | null
        variantName: string | null
        quantity: DecimalLike
        unitPrice: DecimalLike
        lineTotal: DecimalLike
    }>
    company?: { name?: string | null; address?: string | null; tin?: string | null } | null
}

const STATUS_LABELS: Record<BillingStatus | 'DRAFT', string> = {
    DRAFT: 'Draft',
    UNPAID: 'Unpaid',
    OVERDUE: 'Overdue',
    PAID: 'Paid',
    CANCELLED: 'Cancelled',
    REFUNDED: 'Refunded',
}

const toNumber = (value: DecimalLike): number => {
    const n = typeof value === 'number' ? value : Number(value?.toString?.() ?? 0)
    return Number.isFinite(n) ? n : 0
}

const isoDay = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null)

const trimmed = (value: string | null | undefined) => value?.trim() || null

export function buildInvoicePdfModel(input: InvoicePdfInput, now: Date) {
    const billingStatus = billingStatusOf(input, now)
    return {
        company: {
            name: trimmed(input.company?.name) ?? INVOICE_PDF_DEFAULT_COMPANY,
            address: trimmed(input.company?.address) ?? '',
            tin: trimmed(input.company?.tin) ?? '',
        },
        invoice: {
            number: input.invoiceNumber,
            billingStatus,
            statusLabel: STATUS_LABELS[billingStatus],
            issueDate: isoDay(input.issuedAt ?? input.createdAt)!,
            dueDate: isoDay(dueDateFor(input.issuedAt)),
            paidDate: isoDay(input.paidAt),
            salesOrderNumber: input.salesOrderNumber,
            paymentMethod: trimmed(input.paymentMethod),
        },
        billTo: {
            name: input.billTo.name,
            email: trimmed(input.billTo.email),
            phone: trimmed(input.billTo.phone),
            addressLines: input.billTo.addressLines.filter((line) => line.trim()),
        },
        currency: input.currency || 'PHP',
        lines: input.lines.map((line) => ({
            lineNumber: line.lineNumber,
            sku: line.sku,
            description: [line.description ?? line.sku, line.variantName]
                .filter(Boolean)
                .join(' - '),
            quantity: String(toNumber(line.quantity)),
            unitPrice: toNumber(line.unitPrice),
            lineTotal: toNumber(line.lineTotal),
        })),
        totals: {
            subtotal: toNumber(input.subtotal),
            discount: toNumber(input.discountAmount),
            shipping: toNumber(input.shippingAmount),
            total: toNumber(input.totalAmount),
            refunded: toNumber(input.refundedAmount),
        },
        notes: trimmed(input.notes),
        disclaimer: INVOICE_PDF_DISCLAIMER,
        isDraft: billingStatus === 'DRAFT',
    }
}

export type InvoicePdfModel = ReturnType<typeof buildInvoicePdfModel>
