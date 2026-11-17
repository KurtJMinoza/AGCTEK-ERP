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

export const REVISION_REASONS = [
    'CUSTOMER_REQUEST',
    'ERROR_CORRECTION',
    'OTHER',
] as const
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
export type QuotationLineIssue = {
    lineNumber: number
    sku: string
    reason: 'NOT_FOUND' | 'INACTIVE'
}

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
    /** Customer-facing payment terms printed on the PDF. */
    paymentTerms: string | null
    sentBy: string | null
    sentAt: string | null
    decidedBy: string | null
    decidedAt: string | null
    decisionReason: string | null
    cancelledBy: string | null
    cancelledAt: string | null
    cancelReason: string | null
    convertedAt: string | null
    /** Last successful cover-email delivery of this revision. */
    lastEmailedAt: string | null
    createdBy: string | null
    createdAt: string
    updatedAt: string
    lines: QuotationLine[]
    /** Free-text headings above product lines (never priced), ordered by `beforeLineNumber`. */
    sections: QuotationSection[]
    lineIssues: QuotationLineIssue[]
}

export type QuotationSection = {
    id: string
    title: string
    beforeLineNumber: number
}
export type QuotationSectionInput = { title: string; beforeLineNumber: number }

export type QuotationLinesInput = {
    lines: ProductLineInput[]
    /** Sending `lines` replaces the headings (omitted = none). */
    sections?: QuotationSectionInput[]
    notes?: string
    /** Empty string clears the payment terms. */
    paymentTerms?: string
}

/** Indicative stock per line (checkout company, all warehouses); never reserves or blocks. */
export type QuotationLineStockState =
    | 'OK'
    | 'LOW'
    | 'NONE'
    | 'NOT_TRACKED'
    | 'UNKNOWN'
export type QuotationLineStock = {
    productId: string
    quantity: number
    state: QuotationLineStockState
    availableBaseQty: number | null
    requiredBaseQty: number | null
}

/** 409 QUOTATION_PRICES_CHANGED: the draft was re-priced and saved; nothing was sent. */
export type QuotationPriceChange = {
    lineNumber: number
    sku: string
    previousUnitPrice: string
    unitPrice: string
}

const path = (id: string, action = '') =>
    `/sd/quotations/${encodeURIComponent(id)}${action}`

export type ListQuotationsParams = {
    crmOpportunityId?: string
    customerId?: string
    status?: QuotationStatus
    limit?: number
}

/** Lists quotations (newest first). Status is exact; omit it and filter client-side when needed. */
export async function listQuotations(params: ListQuotationsParams = {}) {
    const { data } = await ErpAxiosBase.get<Quotation[]>('/sd/quotations', {
        params,
    })
    return data
}

/** Soft stock signal for quotation lines (OK / LOW / NONE / NOT_TRACKED / UNKNOWN). */
export async function checkQuotationStock(lines: ProductLineInput[]) {
    const { data } = await ErpAxiosBase.post<QuotationLineStock[]>(
        '/sd/quotations/stock-check',
        { lines },
    )
    return data
}

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
    const response = await ErpAxiosBase.get<Blob>(path(id, '/pdf'), {
        responseType: 'blob',
    })
    return {
        blob: response.data,
        filename: filenameFromDisposition(
            response.headers?.['content-disposition'],
        ),
    }
}

export type QuotationHistoryEvent = {
    id: string
    /** CREATED | EDITED | SENT | REVISED | SUPERSEDED | ACCEPTED | REJECTED | CANCELLED | EXPIRED | CONVERTED */
    action: string
    fromStatus: string | null
    toStatus: string
    note: string | null
    createdAt: string
    actor: {
        id: string
        userName: string
        firstName: string
        lastName: string
    } | null
}

/** Append-only lifecycle history of one revision, oldest first. */
export async function getQuotationHistory(id: string) {
    const { data } = await ErpAxiosBase.get<QuotationHistoryEvent[]>(
        path(id, '/history'),
    )
    return data
}

/** DRAFT only; SD re-prices every line from the catalog. */
export async function updateQuotationDraft(
    id: string,
    body: Partial<QuotationLinesInput>,
) {
    const { data } = await ErpAxiosBase.patch<Quotation>(path(id), body)
    return data
}

/** `validUntil` is the last valid day (YYYY-MM-DD); SD defaults to 30 days. */
export async function sendQuotation(id: string, body: { validUntil?: string }) {
    const { data } = await ErpAxiosBase.post<Quotation>(path(id, '/send'), body)
    return data
}

/** New DRAFT revision re-priced from the catalog; returns the new revision. */
export async function reviseQuotation(
    id: string,
    body: { reason: RevisionReason; notes?: string },
) {
    const { data } = await ErpAxiosBase.post<Quotation>(
        path(id, '/revise'),
        body,
    )
    return data
}

/** Editable cover-email template (SD quotation scope). */
export type QuotationEmailTemplate = {
    key: string
    name: string
    subject: string
    bodyText: string
    bodyHtml: string | null
    isDefault: boolean
    isActive: boolean
    updatedAt: string
}

/** Rendered composer content plus the recipient and attachment for this revision. */
export type QuotationEmailPreview = {
    to: string | null
    customerName: string
    quotationNumber: string
    revision: number
    templateKey: string
    templates: QuotationEmailTemplate[]
    subject: string
    bodyText: string
    bodyHtml: string
    attachmentFilename: string
    hasStoredPdf: boolean
    lastEmailedAt: string | null
}

export type SendQuotationEmailInput = {
    templateKey?: string
    subject?: string
    bodyText?: string
    bodyHtml?: string
    isResend?: boolean
}

export type QuotationEmailSendResult = {
    sent: boolean
    messageId?: string
    skippedReason?: string
    error?: string
    to: string
    subject: string
    attachmentFilename: string
    lastEmailedAt: string | null
}

/** Composer prefill: template copy rendered with this quotation's values. Read-only. */
export async function getQuotationEmailPreview(
    id: string,
    templateKey?: string,
) {
    const { data } = await ErpAxiosBase.get<QuotationEmailPreview>(
        path(id, '/email-preview'),
        {
            params: templateKey ? { templateKey } : undefined,
        },
    )
    return data
}

/** Emails the stored quotation PDF; the cover letter is the template with the composer overrides. */
export async function sendQuotationEmail(
    id: string,
    body: SendQuotationEmailInput,
) {
    const { data } = await ErpAxiosBase.post<QuotationEmailSendResult>(
        path(id, '/email'),
        body,
    )
    return data
}

export type SaveQuotationEmailTemplateInput = {
    name: string
    subject: string
    bodyText: string
}

/**
 * Saves the composer copy as a reusable QUOTATION template. Quotation values are restored to
 * `{{placeholders}}` server-side so the template works for other customers too.
 */
export async function createQuotationEmailTemplate(
    id: string,
    body: SaveQuotationEmailTemplateInput,
) {
    const { data } = await ErpAxiosBase.post<QuotationEmailTemplate>(
        path(id, '/email-templates'),
        body,
    )
    return data
}

/** `{{placeholders}}` a quotation email template may use (SD renders them per quotation). */
export const QUOTATION_EMAIL_PLACEHOLDERS = [
    'customerName',
    'contactName',
    'quotationNumber',
    'revision',
    'amount',
    'currency',
    'validUntil',
    'companyName',
    'repName',
    'opportunityName',
] as const

/** Every QUOTATION email template, inactive ones included (CRM › Emails). */
export async function listQuotationEmailTemplates() {
    const { data } = await ErpAxiosBase.get<QuotationEmailTemplate[]>(
        '/sd/email-templates',
        { params: { includeInactive: '1' } },
    )
    return data
}

export type UpdateQuotationEmailTemplateInput = {
    name?: string
    subject?: string
    bodyText?: string
    isDefault?: boolean
    isActive?: boolean
}

/** Edits template copy; the key stays fixed so send / resend keep resolving it. */
export async function updateQuotationEmailTemplate(
    key: string,
    body: UpdateQuotationEmailTemplateInput,
) {
    const { data } = await ErpAxiosBase.patch<QuotationEmailTemplate>(
        `/sd/email-templates/${encodeURIComponent(key)}`,
        body,
    )
    return data
}

/** The PDF exactly as emailed (404 until the first email), stored once per revision. */
export async function downloadSentQuotationPdf(id: string) {
    const response = await ErpAxiosBase.get<Blob>(path(id, '/pdf/sent'), {
        responseType: 'blob',
    })
    return {
        blob: response.data,
        filename: filenameFromDisposition(
            response.headers?.['content-disposition'],
        ),
    }
}

export async function acceptQuotation(id: string, body: { note?: string }) {
    const { data } = await ErpAxiosBase.post<Quotation>(
        path(id, '/accept'),
        body,
    )
    return data
}

export async function rejectQuotation(id: string, body: { reason: string }) {
    const { data } = await ErpAxiosBase.post<Quotation>(
        path(id, '/reject'),
        body,
    )
    return data
}

export async function cancelQuotation(id: string, body: { reason?: string }) {
    const { data } = await ErpAxiosBase.post<Quotation>(
        path(id, '/cancel'),
        body,
    )
    return data
}
