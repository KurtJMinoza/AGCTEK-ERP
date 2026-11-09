'use client'

import type { FicoBadgeTone } from './ficoTableUi'
import type { FicoTaxCode, FicoTaxCodeType, FicoTaxRate } from '../types'

export const TAX_CODE_ROUTE = '/modules/fico/tax-codes'

export const TAX_CATEGORY_LABELS: Record<string, string> = {
    SALES_TAX: 'Sales Tax',
    PURCHASE_TAX: 'Purchase Tax',
    INPUT_TAX: 'Input Tax',
    OUTPUT_TAX: 'Output Tax',
    WITHHOLDING_TAX: 'Withholding Tax',
    OTHER_TAX: 'Other Tax',
}

export const TAX_TYPE_LABELS: Record<string, string> = {
    VAT: 'VAT',
    PERCENTAGE_TAX: 'Percentage Tax',
    WITHHOLDING_TAX: 'Withholding Tax',
    ZERO_RATED_TAX: 'Zero-Rated Tax',
    EXEMPT_TAX: 'Exempt Tax',
    NON_TAXABLE: 'Non-Taxable',
    OTHER_TAX: 'Other Tax',
}

export const CALCULATION_METHOD_LABELS: Record<string, string> = {
    TAX_EXCLUSIVE: 'Tax Exclusive',
    TAX_INCLUSIVE: 'Tax Inclusive',
    NOT_APPLICABLE: 'Not Applicable',
}

export const RATE_UNIT_LABELS: Record<string, string> = {
    PERCENTAGE: 'Percentage',
    FIXED_AMOUNT: 'Fixed Amount',
}

export const ROUNDING_METHOD_LABELS: Record<string, string> = {
    HALF_UP: 'Half Up',
    HALF_DOWN: 'Half Down',
    HALF_EVEN: 'Half Even (banker’s)',
    UP: 'Always Up',
    DOWN: 'Always Down',
}

export const ROUNDING_LEVEL_LABELS: Record<string, string> = {
    PER_LINE_ITEM: 'Per Line Item',
    PER_DOCUMENT: 'Per Document',
}

export const EFFECTIVE_STATUS_LABELS: Record<string, string> = {
    DRAFT: 'Draft',
    ACTIVE: 'Active',
    INACTIVE: 'Inactive',
    SCHEDULED: 'Scheduled',
    EXPIRED: 'Expired',
}

export const TAX_APPLICATION_TYPE_LABELS: Record<string, string> = {
    SALES: 'Sales',
    PURCHASE: 'Purchase',
    SERVICE: 'Service',
    INVENTORY: 'Inventory',
    CUSTOMER_INVOICE: 'Customer invoice',
    SUPPLIER_INVOICE: 'Supplier invoice',
    INVENTORY_PURCHASE: 'Inventory purchase',
    OTHER: 'Other',
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
    TAX_CODE_CREATE: 'Tax code created',
    TAX_CODE_UPDATE: 'Tax code updated',
    TAX_CODE_ACTIVATE: 'Tax code activated',
    TAX_CODE_DEACTIVATE: 'Tax code deactivated',
    TAX_CODE_DELETE: 'Tax code deleted',
    TAX_CODE_RATE_CREATE: 'Rate created',
    TAX_CODE_RATE_UPDATE: 'Rate updated',
    TAX_CODE_RATE_DEACTIVATE: 'Rate deactivated',
    TAX_CODE_DUPLICATE: 'Tax code duplicated',
}

export const TAX_CODE_STATUS_TONES: Record<string, FicoBadgeTone> = {
    DRAFT: 'default',
    ACTIVE: 'success',
    INACTIVE: 'warning',
    SCHEDULED: 'info',
    EXPIRED: 'danger',
}

export const TAX_RATE_STATUS_TONES: Record<string, FicoBadgeTone> = {
    ACTIVE: 'success',
    INACTIVE: 'warning',
    SCHEDULED: 'info',
    EXPIRED: 'danger',
}

export const AUDIT_ACTION_TONES: Record<string, FicoBadgeTone> = {
    TAX_CODE_CREATE: 'success',
    TAX_CODE_UPDATE: 'info',
    TAX_CODE_ACTIVATE: 'success',
    TAX_CODE_DEACTIVATE: 'warning',
    TAX_CODE_DELETE: 'danger',
    TAX_CODE_RATE_CREATE: 'success',
    TAX_CODE_RATE_UPDATE: 'info',
    TAX_CODE_RATE_DEACTIVATE: 'warning',
    TAX_CODE_DUPLICATE: 'info',
}

function optionsOf(labels: Record<string, string>) {
    return Object.entries(labels).map(([value, label]) => ({ value, label }))
}

export const TAX_CATEGORY_OPTIONS = optionsOf(TAX_CATEGORY_LABELS)
export const TAX_TYPE_OPTIONS = optionsOf(TAX_TYPE_LABELS)
export const CALCULATION_METHOD_OPTIONS = optionsOf(CALCULATION_METHOD_LABELS)
export const RATE_UNIT_OPTIONS = optionsOf(RATE_UNIT_LABELS)
export const ROUNDING_METHOD_OPTIONS = optionsOf(ROUNDING_METHOD_LABELS)
export const ROUNDING_LEVEL_OPTIONS = optionsOf(ROUNDING_LEVEL_LABELS)
export const TAX_APPLICATION_TYPE_OPTIONS = optionsOf(TAX_APPLICATION_TYPE_LABELS)

export const TAX_CODE_FILTER_STATUS_OPTIONS = [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'SCHEDULED', label: 'Scheduled' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'INACTIVE', label: 'Inactive' },
    { value: 'EXPIRED', label: 'Expired' },
]

export const ZERO_LIKE_TAX_TYPES: readonly FicoTaxCodeType[] = [
    'ZERO_RATED_TAX',
    'EXEMPT_TAX',
    'NON_TAXABLE',
]

export const TAX_BEARING_TYPES: readonly FicoTaxCodeType[] = [
    'VAT',
    'PERCENTAGE_TAX',
    'WITHHOLDING_TAX',
    'OTHER_TAX',
]

export function isZeroLikeTaxType(taxType: string | null | undefined): boolean {
    return ZERO_LIKE_TAX_TYPES.includes(taxType as FicoTaxCodeType)
}

export function isWithholdingTaxCode(
    taxCode:
        | Pick<FicoTaxCode, 'taxCategory' | 'taxType'>
        | null
        | undefined,
): boolean {
    return (
        taxCode?.taxCategory === 'WITHHOLDING_TAX' ||
        taxCode?.taxType === 'WITHHOLDING_TAX'
    )
}

export function formatTaxRate(
    rate: number | string | null | undefined,
    rateUnit: string | null | undefined,
): string {
    if (rate === null || rate === undefined || rate === '') return '—'
    const value =
        typeof rate === 'number'
            ? rate
            : Number.parseFloat(String(rate).replace(/,/g, ''))
    if (!Number.isFinite(value)) return '—'
    const formatted = value.toLocaleString('en-US', {
        maximumFractionDigits: 6,
    })
    return rateUnit === 'FIXED_AMOUNT' ? formatted : `${formatted}%`
}

export function formatTaxAmount(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
        return '—'
    }
    return value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
    })
}

export function taxCodeHref(id: string, suffix?: string): string {
    return suffix ? `${TAX_CODE_ROUTE}/${id}/${suffix}` : `${TAX_CODE_ROUTE}/${id}`
}

/** Human summary of the effective-dated rate window for a tax code row. */
export function taxRateWindow(rate: FicoTaxRate | null | undefined): string {
    if (!rate) return 'No rate configured'
    return `${rate.effectiveFrom.slice(0, 10)} → ${rate.effectiveTo?.slice(0, 10) ?? 'open'}`
}

export function taxApplicabilityLabels(
    taxCode: Pick<
        FicoTaxCode,
        | 'isSalesApplicable'
        | 'isPurchaseApplicable'
        | 'isServiceApplicable'
        | 'isInventoryApplicable'
    >,
): string[] {
    const labels: string[] = []
    if (taxCode.isSalesApplicable) labels.push('Sales')
    if (taxCode.isPurchaseApplicable) labels.push('Purchases')
    if (taxCode.isServiceApplicable) labels.push('Services')
    if (taxCode.isInventoryApplicable) labels.push('Inventory')
    return labels
}
