import { BadRequestException, ConflictException } from '@nestjs/common'

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

/** Must match the partial unique index "sd_quotations_one_active_per_opportunity". */
export const ACTIVE_QUOTATION_STATUSES = ['DRAFT', 'SENT', 'ACCEPTED'] as const
/** Statuses that run out at `validUntil` (a DRAFT has no validity until it is sent). */
export const EXPIRABLE_QUOTATION_STATUSES = ['SENT', 'ACCEPTED'] as const

export type QuotationAction =
    | 'EDIT'
    | 'SEND'
    | 'ACCEPT'
    | 'REJECT'
    | 'CANCEL'
    | 'REVISE'
    | 'EXPIRE'
    | 'CONVERT'

/**
 * Status after each allowed action; anything missing is refused. REVISE gives the status of the
 * revised version (its successor is a new DRAFT): superseded when it was still active, unchanged otherwise.
 */
const TRANSITIONS: Record<QuotationStatus, Partial<Record<QuotationAction, QuotationStatus>>> = {
    DRAFT: { EDIT: 'DRAFT', SEND: 'SENT', CANCEL: 'CANCELLED' },
    SENT: {
        ACCEPT: 'ACCEPTED',
        REJECT: 'REJECTED',
        CANCEL: 'CANCELLED',
        REVISE: 'SUPERSEDED',
        EXPIRE: 'EXPIRED',
        CONVERT: 'CONVERTED',
    },
    ACCEPTED: {
        CANCEL: 'CANCELLED',
        REVISE: 'SUPERSEDED',
        EXPIRE: 'EXPIRED',
        CONVERT: 'CONVERTED',
    },
    REJECTED: { REVISE: 'REJECTED' },
    EXPIRED: { REVISE: 'EXPIRED' },
    CANCELLED: {},
    SUPERSEDED: {},
    CONVERTED: {},
}

const ACTION_VERBS: Record<QuotationAction, string> = {
    EDIT: 'edit',
    SEND: 'send',
    ACCEPT: 'accept',
    REJECT: 'reject',
    CANCEL: 'cancel',
    REVISE: 'revise',
    EXPIRE: 'expire',
    CONVERT: 'convert',
}

export function canQuotation(status: string, action: QuotationAction) {
    return TRANSITIONS[status as QuotationStatus]?.[action] !== undefined
}

/** The status `action` leads to; 409 when the action is not allowed from `status`. */
export function nextQuotationStatus(status: string, action: QuotationAction): QuotationStatus {
    const next = TRANSITIONS[status as QuotationStatus]?.[action]
    if (!next) {
        const article = /^[AEIOU]/.test(status) ? 'an' : 'a'
        throw new ConflictException({
            code: 'QUOTATION_INVALID_TRANSITION',
            message: `Cannot ${ACTION_VERBS[action]} ${article} ${status} quotation`,
            status,
        })
    }
    return next
}

export const REVISION_REASONS = ['CUSTOMER_REQUEST', 'ERROR_CORRECTION', 'OTHER'] as const
export type RevisionReason = (typeof REVISION_REASONS)[number]

export function formatQuotationNumber(value: bigint | number) {
    return `Q-${String(value).padStart(6, '0')}`
}

// Validity is a calendar day in the Philippines (UTC+8, no DST): valid through 23:59:59.999 local time.
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
export const QUOTATION_VALIDITY_DAYS = 30
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** Calendar date (YYYY-MM-DD) in Manila at `now`. */
export function manilaDate(now: Date) {
    return new Date(now.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10)
}

export function endOfManilaDay(date: string) {
    return new Date(Date.parse(`${date}T00:00:00.000Z`) + DAY_MS - MANILA_OFFSET_MS - 1)
}

function addDays(date: string, days: number) {
    return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** `validUntil` for a quotation sent at `now`: the requested day, or 30 days after today (Manila). */
export function resolveValidUntil(requested: string | undefined, now: Date) {
    const today = manilaDate(now)
    if (requested === undefined) return endOfManilaDay(addDays(today, QUOTATION_VALIDITY_DAYS))
    const parsed = Date.parse(`${requested}T00:00:00.000Z`)
    if (!DATE_ONLY.test(requested) || Number.isNaN(parsed) || new Date(parsed).toISOString().slice(0, 10) !== requested) {
        throw new BadRequestException('validUntil must be a date (YYYY-MM-DD)')
    }
    if (requested < today) {
        throw new BadRequestException('validUntil cannot be in the past')
    }
    return endOfManilaDay(requested)
}

export function isQuotationExpired(q: { status: string; validUntil: Date | null }, now: Date) {
    return (
        (EXPIRABLE_QUOTATION_STATUSES as readonly string[]).includes(q.status) &&
        q.validUntil !== null &&
        q.validUntil.getTime() < now.getTime()
    )
}

/** Status to display: overdue SENT / ACCEPTED quotations read as EXPIRED before anything persists it. */
export function effectiveQuotationStatus(q: { status: string; validUntil: Date | null }, now: Date) {
    return isQuotationExpired(q, now) ? 'EXPIRED' : q.status
}
