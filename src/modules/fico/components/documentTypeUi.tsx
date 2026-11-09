'use client'

import type { FicoBadgeTone } from './ficoTableUi'

export const DOCUMENT_TYPE_ROUTE = '/modules/fico/document-types'

export const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
    GENERAL_JOURNAL: 'General Journal',
    ADJUSTMENT: 'Adjustment',
    VENDOR_INVOICE: 'Vendor Invoice',
    VENDOR_CREDIT: 'Vendor Credit',
    VENDOR_PAYMENT: 'Vendor Payment',
    CUSTOMER_INVOICE: 'Customer Invoice',
    CUSTOMER_CREDIT: 'Customer Credit',
    CUSTOMER_RECEIPT: 'Customer Receipt',
    ASSET_ACCOUNTING: 'Asset Accounting',
    REVERSAL: 'Reversal',
    INVENTORY_ACCOUNTING: 'Inventory Accounting',
    SALES_ACCOUNTING: 'Sales Accounting',
    OTHER: 'Other',
}

export const DOCUMENT_ACCOUNT_TYPE_LABELS: Record<string, string> = {
    GL_ACCOUNT: 'G/L Account',
    VENDOR: 'Vendor',
    CUSTOMER: 'Customer',
    ASSET: 'Asset',
    BANK: 'Bank',
    INVENTORY: 'Inventory',
}

export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
    ACTIVE: 'Active',
    INACTIVE: 'Inactive',
}

export const DOCUMENT_NUMBER_ASSIGNMENT_LABELS: Record<string, string> = {
    INTERNAL: 'Internal',
    EXTERNAL: 'External',
}

export const DOCUMENT_STATUS_TONES: Record<string, FicoBadgeTone> = {
    ACTIVE: 'success',
    INACTIVE: 'warning',
}

export const DOCUMENT_AUDIT_ACTION_LABELS: Record<string, string> = {
    DOCUMENT_TYPE_CREATE: 'Document type created',
    DOCUMENT_TYPE_UPDATE: 'Document type updated',
    DOCUMENT_TYPE_ACTIVATE: 'Document type activated',
    DOCUMENT_TYPE_DEACTIVATE: 'Document type deactivated',
    DOCUMENT_TYPE_DELETE: 'Document type deleted',
}

export const DOCUMENT_AUDIT_ACTION_TONES: Record<string, FicoBadgeTone> = {
    DOCUMENT_TYPE_CREATE: 'success',
    DOCUMENT_TYPE_UPDATE: 'info',
    DOCUMENT_TYPE_ACTIVATE: 'success',
    DOCUMENT_TYPE_DEACTIVATE: 'warning',
    DOCUMENT_TYPE_DELETE: 'danger',
}

function optionsOf(labels: Record<string, string>) {
    return Object.entries(labels).map(([value, label]) => ({ value, label }))
}

export const DOCUMENT_CATEGORY_OPTIONS = optionsOf(DOCUMENT_CATEGORY_LABELS)
export const DOCUMENT_ACCOUNT_TYPE_OPTIONS = optionsOf(
    DOCUMENT_ACCOUNT_TYPE_LABELS,
)
export const DOCUMENT_STATUS_OPTIONS = optionsOf(DOCUMENT_STATUS_LABELS)
export const DOCUMENT_NUMBER_ASSIGNMENT_OPTIONS = optionsOf(
    DOCUMENT_NUMBER_ASSIGNMENT_LABELS,
)

export const DOCUMENT_CATEGORY_FILTER_OPTIONS = DOCUMENT_CATEGORY_OPTIONS

export const DOCUMENT_STATUS_FILTER_OPTIONS = DOCUMENT_STATUS_OPTIONS

export const DOCUMENT_REVERSAL_FILTER_OPTIONS = [
    { value: 'true', label: 'Reversal allowed' },
    { value: 'false', label: 'Reversal not allowed' },
]

export function documentTypeHref(id: string, suffix?: string): string {
    return suffix
        ? `${DOCUMENT_TYPE_ROUTE}/${id}/${suffix}`
        : `${DOCUMENT_TYPE_ROUTE}/${id}`
}

export function documentCategoryLabel(value: string | null | undefined) {
    if (!value) return '—'
    return DOCUMENT_CATEGORY_LABELS[value] ?? value
}

export function documentAccountTypeLabel(value: string) {
    return DOCUMENT_ACCOUNT_TYPE_LABELS[value] ?? value
}

export function documentAccountTypeLabels(values: readonly string[]) {
    if (!values.length) return '—'
    return values.map(documentAccountTypeLabel).join(', ')
}

export function documentNumberRangeLabel(
    range:
        | {
              rangeCode: string
              rangeName: string
          }
        | null
        | undefined,
) {
    if (!range) return '—'
    return `${range.rangeCode} — ${range.rangeName}`
}
