import ErpAxiosBase from '@/services/axios/ErpAxiosBase'

export const QUOTATION_STATUSES = [
    'DRAFT',
    'SENT',
    'ACCEPTED',
    'REJECTED',
    'EXPIRED',
    'CANCELLED',
    'SUPERSEDED',
    'CONVERTED',
] as const
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number]

export const REVISION_REASONS = ['CUSTOMER_REQUEST', 'ERROR_CORRECTION', 'OTHER'] as const
export type RevisionReason = (typeof REVISION_REASONS)[number]

export type ProductLineInput = { productId: string; quantity: number }

/** SD money and quantities arrive as decimal strings. */
export type QuotationLine = {
    id: string
    lineNumber: number
    productId: string
    sku: string
    description: string
    quantity: string
    unitPrice: string
    lineTotal: string
}

/** A DRAFT line whose product can no longer be sold; SD blocks Send until it is removed. */
export type QuotationLineIssue = { lineNumber: number; sku: string; reason: 'NOT_FOUND' | 'INACTIVE' }

/** SD quotation. `effectiveStatus` shows an overdue SENT / ACCEPTED as EXPIRED before SD persists it. */
export type Quotation = {
    id: string
    quotationNumber: string
    revision: number
    previousRevisionId: string | null
    revisionReason: RevisionReason | null
    revisionNotes: string | null
    crmOpportunityId: string
    customerId: string
    divisionId: string | null
    currency: string
    status: QuotationStatus
    effectiveStatus: QuotationStatus
    isExpired: boolean
    /** End of the last valid day (Asia/Manila). */
    validUntil: string | null
    subtotal: string
    totalAmount: string
    notes: string | null
    sentBy: string | null
    sentAt: string | null
    decidedBy: string | null
    decidedAt: string | null
    decisionReason: string | null
    cancelledBy: string | null
    cancelledAt: string | null
    cancelReason: string | null
    convertedAt: string | null
    createdBy: string | null
    createdAt: string
    updatedAt: string
    lines: QuotationLine[]
    lineIssues: QuotationLineIssue[]
}

export type QuotationLinesInput = { lines: ProductLineInput[]; notes?: string }

/** 409 QUOTATION_PRICES_CHANGED: the draft was re-priced and saved; nothing was sent. */
export type QuotationPriceChange = {
    lineNumber: number
    sku: string
    previousUnitPrice: string
    unitPrice: string
}

const path = (id: string, action = '') => `/sd/quotations/${encodeURIComponent(id)}${action}`

/** One SD-owned quotation by id. */
export async function getQuotation(id: string) {
    const { data } = await ErpAxiosBase.get<Quotation>(path(id))
    return data
}

function filenameFromDisposition(disposition: unknown): string | null {
    if (typeof disposition !== 'string') return null
    const match = /filename\*?=(?:UTF-8''|")?([^";]+)"?/i.exec(disposition)
    if (!match) return null
    try {
        return decodeURIComponent(match[1].trim())
    } catch {
        return match[1].trim()
    }
}

/** Read-only PDF of the quotation; returns the bytes plus the server filename when provided. */
export async function downloadQuotationPdf(id: string) {
    const response = await ErpAxiosBase.get<Blob>(path(id, '/pdf'), { responseType: 'blob' })
    return {
        blob: response.data,
        filename: filenameFromDisposition(response.headers?.['content-disposition']),
    }
}

/** DRAFT only; SD re-prices every line from the catalog. */
export async function updateQuotationDraft(id: string, body: Partial<QuotationLinesInput>) {
    const { data } = await ErpAxiosBase.patch<Quotation>(path(id), body)
    return data
}

/** `validUntil` is the last valid day (YYYY-MM-DD); SD defaults to 30 days. */
export async function sendQuotation(id: string, body: { validUntil?: string }) {
    const { data } = await ErpAxiosBase.post<Quotation>(path(id, '/send'), body)
    return data
}

/** New DRAFT revision re-priced from the catalog; returns the new revision. */
export async function reviseQuotation(id: string, body: { reason: RevisionReason; notes?: string }) {
    const { data } = await ErpAxiosBase.post<Quotation>(path(id, '/revise'), body)
    return data
}

export async function acceptQuotation(id: string, body: { note?: string }) {
    const { data } = await ErpAxiosBase.post<Quotation>(path(id, '/accept'), body)
    return data
}

export async function rejectQuotation(id: string, body: { reason: string }) {
    const { data } = await ErpAxiosBase.post<Quotation>(path(id, '/reject'), body)
    return data
}

export async function cancelQuotation(id: string, body: { reason?: string }) {
    const { data } = await ErpAxiosBase.post<Quotation>(path(id, '/cancel'), body)
    return data
}
