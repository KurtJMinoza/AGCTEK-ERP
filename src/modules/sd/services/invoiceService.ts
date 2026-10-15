import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import { toApiError } from './apiError'

const BASE = '/sd/invoices'

/** SD billing view of an invoice; OVERDUE is derived from issue date + payment term. */
export type BillingStatus = 'UNPAID' | 'OVERDUE' | 'PAID' | 'CANCELLED' | 'REFUNDED'

export type Invoice = {
    id: string
    invoiceNumber: string
    salesOrderId: string
    salesOrderReference: string
    customerName: string | null
    currency: string
    totalAmount: number
    refundedAmount: number
    issuedAt: string | null
    dueDate: string | null
    paidAt: string | null
    status: string
    billingStatus: BillingStatus
}

export type InvoiceSummary = {
    pendingCount: number
    overdueCount: number
    paidCount: number
    outstandingAmount: number
    currency: string
}

export type InvoiceListResult = {
    data: Invoice[]
    total: number
    page: number
    pageSize: number
    summary: InvoiceSummary
}

export type ListInvoicesParams = {
    status?: BillingStatus
    search?: string
    companyId?: string
    page?: number
    pageSize?: number
}

export async function listInvoices(params: ListInvoicesParams = {}): Promise<InvoiceListResult> {
    try {
        const { data } = await ErpAxiosBase.get<InvoiceListResult>(BASE, {
            params: { ...params, search: params.search?.trim() || undefined },
        })
        return data
    } catch (error) {
        throw toApiError(error, 'Unable to load invoices')
    }
}

type Decimalish = string | number

export type InvoiceLine = {
    id: string
    lineNumber: number
    sku: string
    description: string | null
    variantName: string | null
    quantity: Decimalish
    unitPrice: Decimalish
    lineTotal: Decimalish
}

/** Invoice document: stored status plus the derived billing view. */
export type InvoiceDetail = {
    id: string
    invoiceNumber: string
    /** DRAFT | ISSUED (posted) | PAID | CANCELLED | REFUNDED */
    status: string
    billingStatus: BillingStatus | 'DRAFT'
    currency: string
    subtotal: Decimalish
    discountAmount: Decimalish
    shippingAmount: Decimalish
    totalAmount: Decimalish
    refundedAmount: Decimalish
    issuedAt: string | null
    dueDate: string | null
    paidAt: string | null
    cancelledAt: string | null
    notes: string | null
    createdAt: string
    lines: InvoiceLine[]
    billTo: {
        customerId: string
        customerNumber: string | null
        name: string | null
        email: string | null
    }
    salesOrder: {
        orderNumber: string
        channel: string
        status: string
        company: { id: string; code: string; name: string; address: string; tin: string } | null
        paymentMethod: string | null
        paymentStatus: string | null
        paymentReference: string | null
        isDemoPayment: boolean
        shipToName: string | null
        shipToPhone: string | null
        shipToAddressLine1: string | null
        shipToCity: string | null
        shipToRegion: string | null
        shipToPostalCode: string | null
        shipToCountry: string | null
        shippedAt: string | null
        deliveredAt: string | null
    }
}

export async function getInvoice(id: string): Promise<InvoiceDetail> {
    try {
        const { data } = await ErpAxiosBase.get<InvoiceDetail>(
            `${BASE}/${encodeURIComponent(id)}`,
        )
        return data
    } catch (error) {
        throw toApiError(error, 'Unable to load the invoice')
    }
}

/** Server-rendered invoice PDF, requested inline so it can open in a browser tab. */
export async function fetchInvoicePdf(id: string): Promise<Blob> {
    try {
        const { data } = await ErpAxiosBase.get<Blob>(
            `${BASE}/${encodeURIComponent(id)}/pdf`,
            { params: { inline: 1 }, responseType: 'blob' },
        )
        return data
    } catch (error) {
        throw toApiError(error, 'Unable to load the invoice PDF')
    }
}
