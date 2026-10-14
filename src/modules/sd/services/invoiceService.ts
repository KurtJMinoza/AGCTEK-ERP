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
