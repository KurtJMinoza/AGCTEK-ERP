import type { ApDocumentRow } from '../../types/accountsPayable'
import { apAmount } from './apUtils'

export type ApRegisterDisplayStatus = 'Paid' | 'Partial' | 'Unpaid' | 'Overdue'

export type ApRegisterSummary = {
    currencyCode: string
    totalPayables: number
    totalPaid: number
    outstanding: number
    documentCount: number
}

const startOfToday = () => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
}

/** Display id akin to "AP-0001" — prefers business reference, then MM invoice no. */
export function apDocumentDisplayNumber(doc: ApDocumentRow): string {
    if (doc.referenceNumber?.trim()) return doc.referenceNumber.trim()
    const inv = doc.sourceSupplierInvoice?.invoiceNumber
    if (inv?.trim()) return inv.trim()
    return `AP-${doc.id.slice(-8).toUpperCase()}`
}

export function apDocumentDescription(doc: ApDocumentRow): string {
    const type = doc.documentType.replace(/_/g, ' ').toLowerCase()
    const ref = doc.referenceNumber?.trim()
    const inv = doc.sourceSupplierInvoice?.invoiceNumber
    if (inv) return `${type} · ${inv}`
    if (ref) return ref
    return type.replace(/^\w/, (c) => c.toUpperCase())
}

export function apRegisterLineAmounts(doc: ApDocumentRow) {
    const total = apAmount(doc.grossAmount)
    const balance = doc.openItem ? apAmount(doc.openItem.openAmount) : 0
    const paid = Math.max(0, total - balance)
    return { total, paid, balance }
}

export function apRegisterDisplayStatus(doc: ApDocumentRow): ApRegisterDisplayStatus {
    const { balance, total } = apRegisterLineAmounts(doc)
    if (doc.status === 'REVERSED' || balance <= 0.0001) return 'Paid'
    const due = doc.openItem?.dueDate ?? doc.dueDate
    if (due) {
        const dueDate = new Date(due)
        if (!Number.isNaN(dueDate.getTime()) && dueDate < startOfToday() && balance > 0) {
            return 'Overdue'
        }
    }
    if (balance < total - 0.0001) return 'Partial'
    return 'Unpaid'
}

const REGISTER_DOC_TYPES = new Set([
    'INVOICE',
    'EXPENSE_INVOICE',
    'NON_PO_INVOICE',
    'DEBIT_ADJUSTMENT',
    'OPENING_BALANCE',
])

/** Supplier invoice-style rows for the payables register (excludes pure payments/clearings). */
export function filterApRegisterDocuments(documents: ApDocumentRow[]): ApDocumentRow[] {
    return documents.filter(
        (doc) =>
            doc.status === 'POSTED' &&
            (REGISTER_DOC_TYPES.has(doc.documentType) ||
                (doc.openItem?.direction === 'CREDIT' && apAmount(doc.grossAmount) > 0)),
    )
}

export function summarizeApRegister(
    documents: ApDocumentRow[],
    fallbackCurrency = 'PHP',
): ApRegisterSummary {
    const rows = filterApRegisterDocuments(documents)
    const currencyCode = rows[0]?.currencyCode ?? fallbackCurrency
    let totalPayables = 0
    let outstanding = 0
    for (const doc of rows) {
        const { total, balance } = apRegisterLineAmounts(doc)
        totalPayables += total
        outstanding += balance
    }
    const totalPaid = Math.max(0, totalPayables - outstanding)
    return {
        currencyCode,
        totalPayables,
        totalPaid,
        outstanding,
        documentCount: rows.length,
    }
}

export function apRegisterStatusTone(
    status: ApRegisterDisplayStatus,
): 'success' | 'warning' | 'danger' | 'default' {
    switch (status) {
        case 'Paid':
            return 'success'
        case 'Partial':
            return 'warning'
        case 'Overdue':
            return 'danger'
        default:
            return 'default'
    }
}