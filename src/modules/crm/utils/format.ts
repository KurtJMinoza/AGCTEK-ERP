import type { StatusTone } from '@/components/shared/StatusBadge'

const toneMap: Record<string, StatusTone> = {
    NEW: 'info',
    CONTACTED: 'info',
    QUALIFIED: 'success',
    UNQUALIFIED: 'default',
    CONVERTED: 'success',
    LOST: 'danger',
    PROSPECTING: 'default',
    QUALIFICATION: 'info',
    PROPOSAL: 'info',
    NEGOTIATION: 'warning',
    CLOSED_WON: 'success',
    CLOSED_LOST: 'danger',
    OPEN: 'info',
    IN_PROGRESS: 'info',
    WAITING_CUSTOMER: 'warning',
    RESOLVED: 'success',
    CLOSED: 'default',
    CANCELLED: 'danger',
    LOW: 'default',
    MEDIUM: 'info',
    HIGH: 'warning',
    URGENT: 'danger',
    ACTIVE: 'success',
    BLOCKED: 'danger',
    DRAFT: 'default',
    SENT: 'info',
    ACCEPTED: 'success',
    REJECTED: 'danger',
    EXPIRED: 'warning',
    SUPERSEDED: 'default',
}

/** Numeric value of an SD decimal string (display only; SD computes all amounts). */
export function decimal(value: string | number | null | undefined) {
    if (value === null || value === undefined || value === '') return null
    const n = Number(value)
    return Number.isFinite(n) ? n : null
}

export function crmTone(value: string): StatusTone {
    return toneMap[value] ?? 'default'
}

/** `WAITING_CUSTOMER` → `Waiting Customer`. */
export function formatEnumLabel(value: string) {
    return value
        .toLowerCase()
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
}

export function enumOptions<T extends string>(values: readonly T[]) {
    return values.map((value) => ({ value, label: formatEnumLabel(value) }))
}

export function formatMoney(amount: number | null, currency = 'PHP') {
    if (amount === null) return '—'
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: currency.length === 3 ? currency : 'PHP',
    }).format(amount)
}

export function formatDate(value: string | null | undefined) {
    if (!value) return '—'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString()
}

export function formatUserName(
    user: { userName: string; firstName: string; lastName: string } | null | undefined,
    fallback = 'Unknown user',
) {
    if (!user) return fallback
    return `${user.firstName} ${user.lastName}`.trim() || user.userName
}

export function toDateInput(value: string | null | undefined) {
    if (!value) return ''
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}
