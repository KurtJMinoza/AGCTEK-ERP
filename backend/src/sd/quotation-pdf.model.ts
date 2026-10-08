/**
 * Pure view model for the quotation PDF. No Prisma / Nest dependencies so the mapping can be
 * unit-tested directly from SD quotation data. Values are display-ready; the renderer only lays
 * them out.
 */

/** Prisma `Decimal` at runtime, or a plain number/string in tests. */
export type DecimalLike = { toString(): string } | number | string

export type QuotationPdfCompanyInput = {
    name?: string | null
    address?: string | null
    tin?: string | null
}

export type QuotationPdfCustomerInput = {
    companyName: string
    contactName?: string | null
    email?: string | null
    phone?: string | null
}

export type QuotationPdfLineInput = {
    lineNumber: number
    sku: string
    description: string
    quantity: DecimalLike
    unitPrice: DecimalLike
    lineTotal: DecimalLike
}

export type QuotationPdfInput = {
    quotationNumber: string
    revision: number
    status: string
    currency: string
    validUntil: Date | null
    createdAt: Date
    notes: string | null
    subtotal: DecimalLike
    totalAmount: DecimalLike
    lines: QuotationPdfLineInput[]
    customer: QuotationPdfCustomerInput
    /** Present when the quotation is linked to a CRM opportunity. */
    opportunityName?: string | null
    company?: QuotationPdfCompanyInput | null
}

export type QuotationPdfLine = {
    lineNumber: number
    sku: string
    description: string
    /** Trailing zeros stripped (SD stores quantity as Decimal(18,3)). */
    quantity: string
    unitPrice: number
    lineTotal: number
}

export type QuotationPdfModel = {
    company: { name: string; address: string; tin: string }
    quotation: {
        number: string
        revision: number
        status: string
        statusLabel: string
        /** YYYY-MM-DD. */
        date: string
        /** YYYY-MM-DD, null until sent. */
        validUntil: string | null
    }
    customer: QuotationPdfCustomerInput
    opportunityName: string | null
    currency: string
    lines: QuotationPdfLine[]
    totals: { subtotal: number; total: number }
    notes: string | null
    disclaimer: string
    /** Drives the watermark and a prominent status label. */
    isDraft: boolean
    hasLines: boolean
}

/** Fallback letterhead when no default Company row is available. */
export const QUOTATION_PDF_DEFAULT_COMPANY = 'AGCTEK'

export const QUOTATION_PDF_DISCLAIMER =
    'This is a quotation, not a sales order. Prices are valid only until the stated valid-until date.'

const STATUS_LABELS: Record<string, string> = {
    DRAFT: 'Draft',
    SENT: 'Sent',
    ACCEPTED: 'Accepted',
    REJECTED: 'Rejected',
    EXPIRED: 'Expired',
    CANCELLED: 'Cancelled',
    SUPERSEDED: 'Superseded',
    CONVERTED: 'Converted',
}

export function quotationStatusLabel(status: string): string {
    return STATUS_LABELS[status] ?? status
}

/**
 * Money for the PDF as ASCII-safe `PHP 2,350.00`. The standard PDF fonts (Helvetica) carry no
 * peso glyph, so using the `₱` symbol would render as a broken character; the ISO code is clear
 * and always renders correctly.
 */
export function formatQuotationMoney(amount: number, currency: string): string {
    const code = currency && currency.length === 3 ? currency.toUpperCase() : 'PHP'
    const formatted = new Intl.NumberFormat('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount)
    return `${code} ${formatted}`
}

function toNumber(value: DecimalLike): number {
    const n = typeof value === 'number' ? value : Number(value?.toString?.() ?? 0)
    return Number.isFinite(n) ? n : 0
}

function quantityText(value: DecimalLike): string {
    return String(toNumber(value))
}

function isoDay(value: Date | null): string | null {
    return value ? value.toISOString().slice(0, 10) : null
}

function trimmed(value: string | null | undefined): string | null {
    const text = value?.trim()
    return text ? text : null
}

/** Maps a loaded SD quotation into the printable model. Pure; performs no I/O. */
export function buildQuotationPdfModel(input: QuotationPdfInput): QuotationPdfModel {
    const lines: QuotationPdfLine[] = input.lines.map((line) => ({
        lineNumber: line.lineNumber,
        sku: line.sku,
        description: line.description,
        quantity: quantityText(line.quantity),
        unitPrice: toNumber(line.unitPrice),
        lineTotal: toNumber(line.lineTotal),
    }))

    return {
        company: {
            name: trimmed(input.company?.name) ?? QUOTATION_PDF_DEFAULT_COMPANY,
            address: trimmed(input.company?.address) ?? '',
            tin: trimmed(input.company?.tin) ?? '',
        },
        quotation: {
            number: input.quotationNumber,
            revision: input.revision,
            status: input.status,
            statusLabel: quotationStatusLabel(input.status),
            date: isoDay(input.createdAt)!,
            validUntil: isoDay(input.validUntil),
        },
        customer: {
            companyName: input.customer.companyName,
            contactName: trimmed(input.customer.contactName),
            email: trimmed(input.customer.email),
            phone: trimmed(input.customer.phone),
        },
        opportunityName: trimmed(input.opportunityName),
        currency: input.currency || 'PHP',
        lines,
        totals: {
            subtotal: toNumber(input.subtotal),
            total: toNumber(input.totalAmount),
        },
        notes: trimmed(input.notes),
        disclaimer: QUOTATION_PDF_DISCLAIMER,
        isDraft: input.status === 'DRAFT',
        hasLines: lines.length > 0,
    }
}