import { getSession } from 'next-auth/react'
import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    Activity,
    ActivityParent,
    ConvertLeadInput,
    ConvertLeadResult,
    CreateActivityInput,
    CreateLeadInput,
    CreateOpportunityInput,
    CreateOpportunitySalesOrderInput,
    WinOpportunityInput,
    CreateOpportunitySalesOrderResult,
    CreateTicketInput,
    CrmDashboard,
    Customer360,
    Lead,
    LeadListParams,
    LinkedSalesOrder,
    Opportunity,
    OpportunityListParams,
    OpportunityPipeline,
    OpportunityPipelineParams,
    OpportunityStagesConfig,
    Paginated,
    Quotation,
    QuotationLinesInput,
    Ticket,
    TicketComment,
    TicketListParams,
    UpdateLeadInput,
    UpdateOpportunityInput,
    UpdateTicketInput,
} from '../types'

/** CRM reads are permission-guarded too; ErpAxiosBase only attaches X-User-Id on mutations. */
async function actorHeaders() {
    const session = await getSession()
    return session?.user?.id ? { 'X-User-Id': session.user.id } : {}
}

async function get<T>(path: string, params?: object) {
    const { data } = await ErpAxiosBase.get<T>(path, {
        params,
        headers: await actorHeaders(),
    })
    return data
}

function compact<T extends object>(params?: T) {
    if (!params) return undefined
    return Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== ''),
    )
}

type ApiOpportunity = Omit<Opportunity, 'amount'> & { amount: string | null }

const toOpportunity = (row: ApiOpportunity): Opportunity => ({
    ...row,
    amount: row.amount === null ? null : Number(row.amount),
})

export async function apiGetLeads(params?: LeadListParams) {
    return get<Paginated<Lead>>('/crm/leads', compact(params))
}

export async function apiCreateLead(body: CreateLeadInput) {
    const { data } = await ErpAxiosBase.post<Lead>('/crm/leads', body)
    return data
}

export async function apiUpdateLead(id: string, body: UpdateLeadInput) {
    const { data } = await ErpAxiosBase.patch<Lead>(
        `/crm/leads/${encodeURIComponent(id)}`,
        body,
    )
    return data
}

export async function apiConvertLead(id: string, body: ConvertLeadInput) {
    const { data } = await ErpAxiosBase.post<
        Omit<ConvertLeadResult, 'opportunity'> & { opportunity: ApiOpportunity }
    >(`/crm/leads/${encodeURIComponent(id)}/convert`, body)
    return { ...data, opportunity: toOpportunity(data.opportunity) } satisfies ConvertLeadResult
}

export async function apiGetOpportunities(params?: OpportunityListParams) {
    const result = await get<Paginated<ApiOpportunity>>(
        '/crm/opportunities',
        compact(params),
    )
    return { ...result, data: result.data.map(toOpportunity) }
}

export async function apiGetOpportunity(id: string) {
    return toOpportunity(await get<ApiOpportunity>(`/crm/opportunities/${encodeURIComponent(id)}`))
}

export async function apiCreateOpportunity(body: CreateOpportunityInput) {
    const { data } = await ErpAxiosBase.post<ApiOpportunity>('/crm/opportunities', body)
    return toOpportunity(data)
}

export async function apiUpdateOpportunity(id: string, body: UpdateOpportunityInput) {
    const { data } = await ErpAxiosBase.patch<ApiOpportunity>(
        `/crm/opportunities/${encodeURIComponent(id)}`,
        body,
    )
    return toOpportunity(data)
}

const salesOrderPath = (opportunityId: string) =>
    `/crm/opportunities/${encodeURIComponent(opportunityId)}/sales-order`

export async function apiGetOpportunitySalesOrder(opportunityId: string) {
    return get<LinkedSalesOrder>(salesOrderPath(opportunityId))
}

async function postHandoff(path: string, body: WinOpportunityInput) {
    const { data } = await ErpAxiosBase.post<
        Omit<CreateOpportunitySalesOrderResult, 'opportunity'> & { opportunity: ApiOpportunity }
    >(path, body)
    return {
        ...data,
        opportunity: toOpportunity(data.opportunity),
    } satisfies CreateOpportunitySalesOrderResult
}

/**
 * Close as won: SD creates the order and the stage commits together; on any error the
 * opportunity keeps its stage. Idempotent (`created: false` when already won with an order).
 */
export async function apiWinOpportunity(opportunityId: string, body: WinOpportunityInput) {
    return postHandoff(`/crm/opportunities/${encodeURIComponent(opportunityId)}/win`, body)
}

/** Retry ERP handoff for Closed Won without an order; idempotent like `apiWinOpportunity`. */
export async function apiCreateOpportunitySalesOrder(
    opportunityId: string,
    body: CreateOpportunitySalesOrderInput,
) {
    return postHandoff(salesOrderPath(opportunityId), body)
}

const quotationsPath = (opportunityId: string) =>
    `/crm/opportunities/${encodeURIComponent(opportunityId)}/quotations`

/** Newest first; SD owns the quotations. */
export async function apiGetOpportunityQuotations(opportunityId: string) {
    return get<Quotation[]>(quotationsPath(opportunityId))
}

/** New DRAFT for the opportunity's customer (Proposal / Negotiation only; also needs sd:create). */
export async function apiCreateOpportunityQuotation(opportunityId: string, body: QuotationLinesInput) {
    const { data } = await ErpAxiosBase.post<Quotation>(quotationsPath(opportunityId), body)
    return data
}

export async function apiGetOpportunityStages() {
    return get<OpportunityStagesConfig>('/crm/opportunities/stages')
}

export async function apiGetOpportunityPipeline(params?: OpportunityPipelineParams) {
    return get<OpportunityPipeline>('/crm/opportunities/pipeline', compact(params))
}

export async function apiGetCrmDashboard(days?: number) {
    return get<CrmDashboard>('/crm/dashboard', compact({ days }))
}

const ACTIVITY_PARENT_ROOT: Record<ActivityParent['kind'], string> = {
    opportunity: '/crm/opportunities',
    ticket: '/crm/tickets',
}

const activitiesPath = (parent: ActivityParent) =>
    `${ACTIVITY_PARENT_ROOT[parent.kind]}/${encodeURIComponent(parent.id)}/activities`

export async function apiGetActivities(parent: ActivityParent) {
    return get<Activity[]>(activitiesPath(parent))
}

export async function apiCreateActivity(parent: ActivityParent, body: CreateActivityInput) {
    const { data } = await ErpAxiosBase.post<Activity>(activitiesPath(parent), body)
    return data
}

/** `next` schedules a follow-up in the same transaction as the completion. */
export async function apiCompleteActivity(
    parent: ActivityParent,
    activityId: string,
    next?: CreateActivityInput,
) {
    const { data } = await ErpAxiosBase.post<{ completed: Activity; next: Activity | null }>(
        `${activitiesPath(parent)}/${encodeURIComponent(activityId)}/complete`,
        next ? { next } : {},
    )
    return data
}

export async function apiGetTickets(params?: TicketListParams) {
    return get<Paginated<Ticket>>('/crm/tickets', compact(params))
}

export async function apiCreateTicket(body: CreateTicketInput) {
    const { data } = await ErpAxiosBase.post<Ticket>('/crm/tickets', body)
    return data
}

export async function apiUpdateTicket(id: string, body: UpdateTicketInput) {
    const { data } = await ErpAxiosBase.patch<Ticket>(
        `/crm/tickets/${encodeURIComponent(id)}`,
        body,
    )
    return data
}

export async function apiGetTicketComments(ticketId: string) {
    return get<TicketComment[]>(`/crm/tickets/${encodeURIComponent(ticketId)}/comments`)
}

export async function apiAddTicketComment(ticketId: string, body: string) {
    const { data } = await ErpAxiosBase.post<TicketComment>(
        `/crm/tickets/${encodeURIComponent(ticketId)}/comments`,
        { body },
    )
    return data
}

export async function apiGetCustomer360(customerId: string) {
    const result = await get<Omit<Customer360, 'opportunities'> & { opportunities: ApiOpportunity[] }>(
        `/crm/customers/${encodeURIComponent(customerId)}/360`,
    )
    return { ...result, opportunities: result.opportunities.map(toOpportunity) }
}
