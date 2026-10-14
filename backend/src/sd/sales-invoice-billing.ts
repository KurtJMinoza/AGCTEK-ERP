import type { Prisma } from '@prisma/client'

/** Fixed payment term until customers carry their own terms. */
export const INVOICE_PAYMENT_TERM_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

/** Billing view of an invoice; UNPAID/OVERDUE split the stored ISSUED status. */
export const BILLING_STATUSES = ['UNPAID', 'OVERDUE', 'PAID', 'CANCELLED', 'REFUNDED'] as const
export type BillingStatus = (typeof BILLING_STATUSES)[number]

export const dueDateFor = (issuedAt: Date | null): Date | null =>
    issuedAt ? new Date(issuedAt.getTime() + INVOICE_PAYMENT_TERM_DAYS * DAY_MS) : null

/** Invoices issued before this instant are past their due date. */
export const overdueCutoff = (now: Date): Date =>
    new Date(now.getTime() - INVOICE_PAYMENT_TERM_DAYS * DAY_MS)

export function billingStatusOf(
    invoice: { status: string; issuedAt: Date | null },
    now: Date,
): BillingStatus | 'DRAFT' {
    switch (invoice.status) {
        case 'PAID':
        case 'CANCELLED':
        case 'REFUNDED':
        case 'DRAFT':
            return invoice.status
        default: {
            const due = dueDateFor(invoice.issuedAt)
            return due && due < now ? 'OVERDUE' : 'UNPAID'
        }
    }
}

/** Query-side twin of `billingStatusOf`, so filters and KPIs run in the database. */
export function billingStatusWhere(
    status: BillingStatus,
    now: Date,
): Prisma.SdSalesInvoiceWhereInput {
    const cutoff = overdueCutoff(now)
    switch (status) {
        case 'UNPAID':
            return {
                status: 'ISSUED',
                OR: [{ issuedAt: null }, { issuedAt: { gte: cutoff } }],
            }
        case 'OVERDUE':
            return { status: 'ISSUED', issuedAt: { lt: cutoff } }
        default:
            return { status }
    }
}
