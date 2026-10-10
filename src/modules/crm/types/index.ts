import type { ProductLineInput } from '@/modules/sd/services/quotationService'

export type Paginated<T> = {
    data: T[]
    total: number
    page: number
    pageSize: number
}

export type PageParams = {
    page?: number
    pageSize?: number
}

/** SD-owned customer master, as referenced by CRM records. */
export type CrmCustomerRef = {
    id: string
    customerNumber: string
    companyName: string
    contactName: string
    status: string
    /** SD billing currency; absent on older payloads. */
    currency?: string
}

export const LEAD_STATUSES = [
    'NEW',
    'CONTACTED',
    'QUALIFIED',
    'UNQUALIFIED',
    'CONVERTED',
    'LOST',
] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const LEAD_SOURCES = [
    'WEBSITE',
    'REFERRAL',
    'WALK_IN',
    'CAMPAIGN',
    'EVENT',
    'COLD_CALL',
    'OTHER',
] as const
export type LeadSource = (typeof LEAD_SOURCES)[number]

export type Lead = {
    id: string
    customerId: string | null
    customer: CrmCustomerRef | null
    name: string
    email: string | null
    phone: string | null
    source: LeadSource
    status: LeadStatus
    assignedTo: string | null
    score: number | null
    createdAt: string
    updatedAt: string
}

export type LeadListParams = PageParams & {
    search?: string
    status?: LeadStatus
    source?: LeadSource
    customerId?: string
    /** ISO instant; created at or after. */
    createdFrom?: string
}

/** OVERDUE = records still accepting activities with an open activity past due. */
export type ActivityFilter = 'OVERDUE'

export type CreateLeadInput = {
    name: string
    email?: string
    phone?: string
    source?: LeadSource
    customerId?: string
    score?: number
}

export type UpdateLeadInput = {
    name?: string
    email?: string | null
    phone?: string | null
    source?: LeadSource
    status?: LeadStatus
    customerId?: string | null
    score?: number | null
}

/** Leads in these statuses can be converted; LOST / UNQUALIFIED must be re-engaged first. */
export const CONVERTIBLE_LEAD_STATUSES: readonly LeadStatus[] = [
    'NEW',
    'CONTACTED',
    'QUALIFIED',
]

export type ConvertLeadInput = {
    /** Link an existing SD customer (omit when the lead is already linked). */
    customerId?: string
    /** Ask SD to create the customer; requires sd:create. */
    newCustomer?: {
        companyName: string
        contactName?: string
        email?: string
        phone?: string
    }
    opportunity?: {
        name?: string
        amount?: number
        currency?: string
        stage?: (typeof OPPORTUNITY_OPEN_STAGES)[number]
        expectedCloseDate?: string
    }
}

export const OPPORTUNITY_OPEN_STAGES = [
    'PROSPECTING',
    'QUALIFICATION',
    'PROPOSAL',
    'NEGOTIATION',
] as const
export const OPPORTUNITY_STAGES = [
    ...OPPORTUNITY_OPEN_STAGES,
    'CLOSED_WON',
    'CLOSED_LOST',
] as const
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number]

export type Opportunity = {
    id: string
    customerId: string
    customer: CrmCustomerRef
    leadId: string | null
    lead: {
        id: string
        name: string
        status: LeadStatus
        source?: LeadSource
    } | null
    name: string
    description: string | null
    /** Parsed from the API's 2-decimal string. */
    amount: number | null
    currency: string
    stage: OpportunityStage
    probability: number | null
    expectedCloseDate: string | null
    closedAt: string | null
    /** Set when CLOSED_LOST; cleared when the opportunity is reopened. */
    lostReason: string | null
    lostNotes: string | null
    assignedTo: string | null
    /** Set once by the Closed Won handoff; CRM never overwrites or clears it. */
    sdSalesOrderId: string | null
    /** Present on opportunity list/detail payloads; absent on Customer 360 rows. */
    nextActivityStatus?: NextActivityStatus
    nextActivityDueAt?: string | null
    /** Detail/update payloads only: display fields for `assignedTo`. */
    owner?: CrmUserRef | null
    createdAt: string
    updatedAt: string
}

export type CrmUserRef = {
    id: string
    userName: string
    firstName: string
    lastName: string
}

/** Read-only view of the SD order linked to an opportunity (SD owns the document). */
export type LinkedSalesOrder = {
    id: string
    orderNumber: string
    status: string
    /** STANDARD | POS | ECOMMERCE */
    channel: string
    /** POS | WEBSITE | CRM | ERP */
    source: string
    currency: string
    /** 2-decimal string from SD. */
    totalAmount: string | null
    lineCount: number
    createdAt: string
}

export {
    QUOTATION_STATUSES,
    REVISION_REASONS,
    type ProductLineInput,
    type Quotation,
    type QuotationLine,
    type QuotationLineIssue,
    type QuotationLinesInput,
    type QuotationPriceChange,
    type QuotationStatus,
    type RevisionReason,
} from '@/modules/sd/services/quotationService'

/**
 * POST /crm/opportunities/:id/win — the order comes from `quotationId` (SENT / ACCEPTED SD
 * quotation) or, without an active quotation, from `lines`; never both. Neither is needed when an
 * SD order is already linked.
 */
export type WinOpportunityInput = {
    lines?: ProductLineInput[]
    quotationId?: string
    notes?: string
}

/** Retry ERP handoff: same sources as win. */
export type CreateOpportunitySalesOrderInput = WinOpportunityInput

export type CreateOpportunitySalesOrderResult = {
    opportunity: Opportunity
    salesOrder: LinkedSalesOrder
    created: boolean
}

export const ACTIVITY_TYPES = ['CALL', 'EMAIL', 'MEETING', 'TODO'] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]

/** Server-computed; priority OVERDUE > DUE_TODAY > UPCOMING > NONE. */
export type NextActivityStatus = 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING' | 'NONE'

export type Activity = {
    id: string
    opportunityId: string | null
    leadId: string | null
    ticketId: string | null
    type: ActivityType
    summary: string
    dueAt: string
    assignedTo: string
    assignee: CrmUserRef | null
    doneAt: string | null
    dueStatus: Exclude<NextActivityStatus, 'NONE'> | 'DONE'
    createdAt: string
    updatedAt: string
}

export type CreateActivityInput = {
    type: ActivityType
    summary: string
    /** ISO instant. */
    dueAt: string
    assignedTo?: string
}

export type ActivityParent = { kind: 'opportunity' | 'ticket'; id: string }

/**
 * Chatter feed entry (Odoo-style): CRM notes / SYSTEM audit rows plus activities, SD quotes
 * and the sales-order link that CRM merges at read time (SD data is never copied here).
 */
export const FEED_ITEM_TYPES = [
    'NOTE',
    'SYSTEM',
    'ACTIVITY',
    'QUOTATION',
    'SALES_ORDER',
] as const
export type FeedItemType = (typeof FEED_ITEM_TYPES)[number]

export type CrmFeedItem = {
    id: string
    type: FeedItemType
    /** ISO instant used for the cursor. */
    at: string
    actor: CrmUserRef | null
    summary: string
    metadata: Record<string, unknown> | null
}

export type OpportunityFeedPage = {
    data: CrmFeedItem[]
    /** Pass this back as `cursor` to page older entries; null = end of the feed. */
    nextCursor: string | null
}

/** A CRM-owned chat note (NOTE rows). SYSTEM rows never reach the client as editable notes. */
export type CrmMessage = {
    id: string
    opportunityId: string | null
    leadId: string | null
    kind: 'NOTE' | 'SYSTEM'
    body: string | null
    metadata: Record<string, unknown> | null
    authorId: string | null
    author: CrmUserRef | null
    createdAt: string
    updatedAt: string | null
    deletedAt: string | null
}

export type OpportunityListParams = PageParams & {
    search?: string
    stage?: OpportunityStage
    customerId?: string
    activity?: ActivityFilter
    lostReason?: string
    /** ISO instant; closed at or after. */
    closedFrom?: string
}

export type CreateOpportunityInput = {
    customerId: string
    name: string
    description?: string
    amount?: number
    currency?: string
    stage?: (typeof OPPORTUNITY_OPEN_STAGES)[number]
    probability?: number
    expectedCloseDate?: string
    leadId?: string
}

export type UpdateOpportunityInput = {
    name?: string
    description?: string | null
    amount?: number | null
    currency?: string
    stage?: OpportunityStage
    probability?: number | null
    expectedCloseDate?: string | null
    lostReason?: string | null
    lostNotes?: string | null
}

export type ConvertLeadResult = {
    lead: Lead
    opportunity: Opportunity
    customer: { id: string; created: boolean }
    activitiesMoved: number
}

/** Server-owned stage rules (GET /crm/opportunities/stages). */
export type OpportunityStageMeta = {
    stage: OpportunityStage
    order: number | null
    defaultProbability: number
    isWon: boolean
    isLost: boolean
    requiresCustomer: boolean
    requiresAmount: boolean
    requiresExpectedClose: boolean
}

export type OpportunityStagesConfig = {
    stages: OpportunityStageMeta[]
    lostReasons: string[]
    lostReasonsRequiringNotes: string[]
}

export type PipelineCurrencyTotal = {
    currency: string
    count: number
    /** 2-decimal strings from the API. */
    amount: string
    weightedAmount: string
}

export type OpportunityPipeline = {
    stages: {
        stage: OpportunityStage
        count: number
        byCurrency: PipelineCurrencyTotal[]
    }[]
    totals: PipelineCurrencyTotal[]
}

export type OpportunityPipelineParams = {
    search?: string
    customerId?: string
    assignedTo?: string
}

export const TICKET_STATUSES = [
    'OPEN',
    'IN_PROGRESS',
    'WAITING_CUSTOMER',
    'RESOLVED',
    'CLOSED',
    'CANCELLED',
] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export const TICKET_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const
export type TicketPriority = (typeof TICKET_PRIORITIES)[number]

export const TICKET_CATEGORIES = [
    'GENERAL',
    'PRODUCT',
    'DELIVERY',
    'BILLING',
    'RETURN',
    'COMPLAINT',
    'TECHNICAL',
    'OTHER',
] as const
export type TicketCategory = (typeof TICKET_CATEGORIES)[number]

export type Ticket = {
    id: string
    customerId: string
    customer: CrmCustomerRef
    subject: string
    description: string | null
    status: TicketStatus
    priority: TicketPriority
    category: TicketCategory
    assignedTo: string | null
    /** Free-text reference to an SD/MM return; CRM does not execute RMAs. */
    rmaReference: string | null
    createdAt: string
    updatedAt: string
    _count: { comments: number }
    /** Present on ticket list payloads; absent on Customer 360 rows. */
    nextActivityStatus?: NextActivityStatus
    nextActivityDueAt?: string | null
}

/** Ticket statuses where activities may still be scheduled (CLOSED / CANCELLED are read-only). */
export const TICKET_ACTIVITY_STATUSES: readonly TicketStatus[] = [
    'OPEN',
    'IN_PROGRESS',
    'WAITING_CUSTOMER',
    'RESOLVED',
]

export type TicketQueue = 'DEFAULT' | 'ALL'
export type TicketSort = 'priority' | 'newest'

export type TicketListParams = PageParams & {
    search?: string
    /** Overrides `queue`. */
    status?: TicketStatus
    /** Server default (DEFAULT) = OPEN + WAITING_CUSTOMER. */
    queue?: TicketQueue
    /** Server default = priority (URGENT → LOW, oldest first). */
    sort?: TicketSort
    priority?: TicketPriority
    customerId?: string
    activity?: ActivityFilter
}

export type CreateTicketInput = {
    customerId: string
    subject: string
    description?: string
    priority?: TicketPriority
    category?: TicketCategory
    rmaReference?: string
}

export type UpdateTicketInput = {
    subject?: string
    description?: string | null
    status?: TicketStatus
    priority?: TicketPriority
    category?: TicketCategory
    rmaReference?: string | null
}

export type TicketComment = {
    id: string
    ticketId: string
    body: string
    authorId: string | null
    author: {
        id: string
        userName: string
        firstName: string
        lastName: string
    } | null
    createdAt: string
}

export type LoyaltyTransaction = {
    id: string
    type: 'EARN' | 'REDEEM' | 'EXPIRE' | 'ADJUSTMENT' | 'REVERSAL'
    points: number
    referenceType: string | null
    referenceId: string | null
    note: string | null
    createdAt: string
}

export type LoyaltySummary = {
    /** null when the customer has no loyalty account yet. */
    accountId: string | null
    customerId: string
    pointsBalance: number
    tier: string | null
    transactions: LoyaltyTransaction[]
}

export type CrmProfile = {
    id: string
    customerId: string
    tier: string
    churnScore: number
    notes: string | null
    ownerUserId: string | null
}

export type Customer360 = {
    customer: CrmCustomerRef & {
        email: string
        phone: string
        currency: string
        createdAt: string
    }
    profile: CrmProfile | null
    /** A count is null when its section is unavailable. */
    summary: {
        openOpportunities: number | null
        wonOpportunities: number | null
        openTickets: number | null
    }
    opportunities: Opportunity[]
    tickets: Ticket[]
    /** null when the loyalty section is unavailable. */
    loyalty: LoyaltySummary | null
    /** Live SD read (most recent 20). */
    orders: Customer360Order[]
    /** Live SCM read for the orders above. */
    shipments: Customer360Shipment[]
    /** Placeholder until FICO exposes a customer invoice query. */
    invoices: unknown[]
    sections: Record<Customer360Section, Customer360SectionState>
}

export type Customer360Section =
    | 'profile'
    | 'opportunities'
    | 'tickets'
    | 'loyalty'
    | 'orders'
    | 'shipments'
    | 'invoices'

/** `unavailable` = the owning module failed this time; `not_connected` = no live source yet. */
export type Customer360SectionState =
    | { status: 'ok' }
    | { status: 'unavailable' | 'not_connected'; message: string }

export type Customer360Order = LinkedSalesOrder & {
    /** CRM opportunity that handed this order to SD, if any. */
    opportunity: { id: string; name: string } | null
}

export type Customer360Shipment = {
    id: string
    reference: string
    status: string
    salesOrderId: string | null
    requestedDeliveryAt: string | null
    latestDeliveryAt: string | null
    deliveredAt: string | null
    hasProofOfDelivery: boolean
    exceptionCode: string | null
    exceptionNote: string | null
    trackingNumber: string | null
    carrier: string | null
    createdAt: string
}

export const DASHBOARD_PERIODS = [30, 90, 365] as const
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number]

/** `GET /crm/dashboard` — every count matches a list filter so widgets can deep-link. */
export type CrmDashboard = {
    generatedAt: string
    periodDays: number
    periodFrom: string
    leads: { new: number; qualified: number }
    overdue: Record<
        'opportunities' | 'tickets',
        { records: number; activities: number }
    >
    pipeline: OpportunityPipeline
    tickets: {
        queueTotal: number
        byStatus: { OPEN: number; WAITING_CUSTOMER: number }
        byPriority: { priority: TicketPriority; count: number }[]
    }
    winLoss: {
        won: {
            count: number
            byCurrency: { currency: string; count: number; amount: string }[]
        }
        lost: { count: number; byReason: { reason: string; count: number }[] }
        winRate: number | null
    }
    conversion: {
        leadsCreated: number
        byStatus: Record<LeadStatus, number>
        converted: number
        disqualified: number
        inProgress: number
        conversionRate: number | null
    }
}
