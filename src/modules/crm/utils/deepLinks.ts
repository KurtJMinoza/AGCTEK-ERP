import {
    LEAD_STATUSES,
    OPPORTUNITY_STAGES,
    TICKET_PRIORITIES,
    TICKET_STATUSES,
    type LeadListParams,
    type OpportunityListParams,
    type TicketListParams,
} from '../types'
import { formatDate, formatEnumLabel } from './format'

export const CRM_PATHS = {
    leads: '/crm/leads',
    opportunities: '/crm/opportunities',
    tickets: '/crm/tickets',
} as const

export const opportunityHref = (id: string) => `${CRM_PATHS.opportunities}/${encodeURIComponent(id)}`

/** `quotationId` may be a UUID or the literal `new`. */
export const quotationHref = (opportunityId: string, quotationId: string) =>
    `${opportunityHref(opportunityId)}/quotations/${encodeURIComponent(quotationId)}`

type Query = Record<string, string | number | null | undefined>
type SearchParamsLike = { get(name: string): string | null }

/** `/crm/leads` + `{ status: 'NEW' }` → `/crm/leads?status=NEW` (empty values dropped). */
export function crmHref(path: string, query: Query = {}) {
    const entries = Object.entries(query).filter(
        (entry): entry is [string, string | number] => entry[1] != null && entry[1] !== '',
    )
    const qs = new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
    return qs ? `${path}?${qs}` : path
}

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
    return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}

function isoInstant(value: string | null) {
    if (!value) return undefined
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

const activity = (value: string | null) => pick(value, ['OVERDUE'] as const)

/** Unknown or malformed query values are ignored rather than sent to the API. */
export function leadParamsFromUrl(sp: SearchParamsLike): LeadListParams {
    return {
        status: pick(sp.get('status'), LEAD_STATUSES),
        createdFrom: isoInstant(sp.get('createdFrom')),
    }
}

export function opportunityParamsFromUrl(sp: SearchParamsLike): OpportunityListParams {
    const lostReason = sp.get('lostReason')
    return {
        stage: pick(sp.get('stage'), OPPORTUNITY_STAGES),
        activity: activity(sp.get('activity')),
        lostReason: lostReason && /^[A-Z_]{1,40}$/.test(lostReason) ? lostReason : undefined,
        closedFrom: isoInstant(sp.get('closedFrom')),
    }
}

export function ticketParamsFromUrl(sp: SearchParamsLike): TicketListParams {
    return {
        status: pick(sp.get('status'), TICKET_STATUSES),
        queue: pick(sp.get('queue'), ['DEFAULT', 'ALL'] as const),
        sort: pick(sp.get('sort'), ['priority', 'newest'] as const),
        priority: pick(sp.get('priority'), TICKET_PRIORITIES),
        activity: activity(sp.get('activity')),
    }
}

/** Labels for deep-link filters that have no dedicated control on the list page. */
export const filterLabels = {
    activity: () => 'Overdue activities',
    lostReason: (value: string) => `Lost reason: ${formatEnumLabel(value)}`,
    closedFrom: (value: string) => `Closed since ${formatDate(value)}`,
    createdFrom: (value: string) => `Created since ${formatDate(value)}`,
}
