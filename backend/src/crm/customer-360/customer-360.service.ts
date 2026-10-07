import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ShipmentsService } from '../../scm/shipments/shipments.service'
import { SalesOrderService } from '../../sd/sales-order.service'
import { CrmLoyaltyService } from '../loyalty/loyalty.service'
import { OPPORTUNITY_OPEN_STAGES } from '../opportunities/dto/opportunity.dto'
import { opportunityInclude, serializeOpportunity } from '../opportunities/opportunities.service'
import { salesOrderSummary } from '../opportunities/opportunity-handoff.service'
import { ticketInclude } from '../tickets/tickets.service'

const SECTION_LIMIT = 50
const ORDER_LIMIT = 20
const OPEN_TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER']

/** Identity only; credit / AR stay with SD and FICO. */
const CUSTOMER_360_SELECT = {
    id: true,
    customerNumber: true,
    companyName: true,
    contactName: true,
    email: true,
    phone: true,
    currency: true,
    status: true,
    createdAt: true,
    updatedAt: true,
} as const

export const CUSTOMER_360_SECTIONS = [
    'profile',
    'opportunities',
    'tickets',
    'loyalty',
    'orders',
    'shipments',
    'invoices',
] as const
export type Customer360Section = (typeof CUSTOMER_360_SECTIONS)[number]

/** `unavailable` = the owning module failed this time; `not_connected` = no live source yet. */
export type SectionState =
    | { status: 'ok' }
    | { status: 'unavailable'; message: string }
    | { status: 'not_connected'; message: string }

const SECTION_LABELS: Record<Customer360Section, string> = {
    profile: 'CRM profile',
    opportunities: 'Opportunities',
    tickets: 'Tickets',
    loyalty: 'Loyalty',
    orders: 'SD sales orders',
    shipments: 'SCM shipments',
    invoices: 'FICO invoices',
}

/**
 * Read-only orchestration over SdCustomer + CRM records + live SD/SCM reads; never writes
 * other modules' tables. Only a missing SdCustomer is a 404: every other section degrades
 * to its empty value with a section status, and the rest of the payload still returns.
 */
@Injectable()
export class CrmCustomer360Service {
    private readonly logger = new Logger(CrmCustomer360Service.name)

    constructor(
        private readonly prisma: PrismaService,
        private readonly loyalty: CrmLoyaltyService,
        private readonly salesOrders: SalesOrderService,
        private readonly shipments: ShipmentsService,
    ) {}

    async get(customerId: string) {
        const customer = await this.prisma.sdCustomer.findUnique({
            where: { id: customerId },
            select: CUSTOMER_360_SELECT,
        })
        if (!customer) throw new NotFoundException('Customer not found')

        const ordersRead = this.section(customerId, 'orders', [], () => this.readOrders(customerId))
        const [profile, opportunities, tickets, loyalty, orders, shipments] = await Promise.all([
            this.section(customerId, 'profile', null, () =>
                this.prisma.crmProfile.findUnique({ where: { customerId } }),
            ),
            this.section(customerId, 'opportunities', null, () => this.readOpportunities(customerId)),
            this.section(customerId, 'tickets', null, () => this.readTickets(customerId)),
            this.section(customerId, 'loyalty', null, () => this.loyalty.summary(customerId)),
            ordersRead,
            this.readShipments(customerId, ordersRead),
        ])

        const opportunityBySalesOrder = new Map(
            (opportunities[0]?.rows ?? [])
                .filter((o) => o.sdSalesOrderId)
                .map((o) => [o.sdSalesOrderId!, { id: o.id, name: o.name }]),
        )

        return {
            customer,
            profile: profile[0],
            summary: {
                openOpportunities: opportunities[0]?.open ?? null,
                wonOpportunities: opportunities[0]?.won ?? null,
                openTickets: tickets[0]?.open ?? null,
            },
            opportunities: opportunities[0]?.rows ?? [],
            tickets: tickets[0]?.rows ?? [],
            loyalty: loyalty[0],
            orders: orders[0].map((order) => ({
                ...order,
                opportunity: opportunityBySalesOrder.get(order.id) ?? null,
            })),
            shipments: shipments[0],
            // TODO(crm-integration): live read of FICO invoices / AR via a FICO query API (no copies in CRM).
            invoices: [] as never[],
            sections: {
                profile: profile[1],
                opportunities: opportunities[1],
                tickets: tickets[1],
                loyalty: loyalty[1],
                orders: orders[1],
                shipments: shipments[1],
                invoices: {
                    status: 'not_connected',
                    message: 'FICO invoices are not connected to CRM yet',
                },
            } satisfies Record<Customer360Section, SectionState>,
        }
    }

    private async readOpportunities(customerId: string) {
        const [rows, open, won] = await Promise.all([
            this.prisma.crmOpportunity.findMany({
                where: { customerId },
                include: opportunityInclude,
                orderBy: { createdAt: 'desc' },
                take: SECTION_LIMIT,
            }),
            this.prisma.crmOpportunity.count({
                where: { customerId, stage: { in: [...OPPORTUNITY_OPEN_STAGES] } },
            }),
            this.prisma.crmOpportunity.count({ where: { customerId, stage: 'CLOSED_WON' } }),
        ])
        return { rows: rows.map(serializeOpportunity), open, won }
    }

    private async readTickets(customerId: string) {
        const [rows, open] = await Promise.all([
            this.prisma.crmTicket.findMany({
                where: { customerId },
                include: ticketInclude,
                orderBy: { createdAt: 'desc' },
                take: SECTION_LIMIT,
            }),
            this.prisma.crmTicket.count({
                where: { customerId, status: { in: OPEN_TICKET_STATUSES } },
            }),
        ])
        return { rows, open }
    }

    private async readOrders(customerId: string) {
        const rows = await this.salesOrders.list({ customerId, limit: ORDER_LIMIT })
        return rows.map(salesOrderSummary)
    }

    /** Shipments are found through the customer's SD orders, so they depend on that read. */
    private async readShipments(
        customerId: string,
        ordersRead: Promise<readonly [{ id: string }[], SectionState]>,
    ) {
        type Shipments = Awaited<ReturnType<ShipmentsService['findBySalesOrderIds']>>
        const [orders, state] = await ordersRead
        if (state.status !== 'ok') {
            return [[] as Shipments, this.unavailable('shipments')] as const
        }
        return this.section(customerId, 'shipments', [] as Shipments, () =>
            this.shipments.findBySalesOrderIds(orders.map((o) => o.id)),
        )
    }

    private async section<T>(
        customerId: string,
        name: Customer360Section,
        fallback: T,
        read: () => Promise<T>,
    ): Promise<readonly [T, SectionState]> {
        try {
            return [await read(), { status: 'ok' }] as const
        } catch (error) {
            this.logger.warn(
                `Customer 360 ${name} unavailable for ${customerId}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            )
            return [fallback, this.unavailable(name)] as const
        }
    }

    private unavailable(name: Customer360Section): SectionState {
        return {
            status: 'unavailable',
            message: `${SECTION_LABELS[name]} could not be loaded right now`,
        }
    }
}
