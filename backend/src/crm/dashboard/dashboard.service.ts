import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
    overdueActivitiesWhere,
    overdueOpportunityWhere,
    overdueTicketWhere,
} from '../activities/activities.service'
import { LEAD_STATUSES, type LeadStatus } from '../leads/dto/lead.dto'
import { CrmOpportunitiesService } from '../opportunities/opportunities.service'
import { LOST_REASONS } from '../opportunities/opportunity-stages'
import {
    TICKET_DEFAULT_QUEUE_STATUSES,
    TICKET_PRIORITY_ORDER,
} from '../tickets/dto/ticket.dto'
import { CrmDashboardQueryDto, DASHBOARD_DEFAULT_PERIOD_DAYS } from './dashboard.dto'

const DAY_MS = 24 * 60 * 60 * 1000

const countBy = <K extends string>(keys: readonly K[], rows: { key: string | null; count: number }[]) => {
    const counts = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>
    for (const row of rows) {
        if (row.key !== null && row.key in counts) counts[row.key as K] += row.count
    }
    return counts
}

const rate = (part: number, whole: number) => (whole === 0 ? null : Math.round((part / whole) * 1000) / 10)

/**
 * Read-only CRM summary from CRM tables only. Every number matches a list filter so the
 * dashboard can deep-link to exactly those records (see the `filter` notes per section).
 */
@Injectable()
export class CrmDashboardService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly opportunities: CrmOpportunitiesService,
    ) {}

    async get(query: CrmDashboardQueryDto, now = new Date()) {
        const periodDays = query.days ?? DASHBOARD_DEFAULT_PERIOD_DAYS
        const periodFrom = new Date(now.getTime() - periodDays * DAY_MS)

        const [leads, overdue, pipeline, tickets, winLoss, conversion] = await Promise.all([
            this.leadCounts(),
            this.overdueCounts(now),
            this.opportunities.pipeline({}),
            this.ticketQueue(),
            this.winLoss(periodFrom),
            this.conversion(periodFrom),
        ])

        return {
            generatedAt: now,
            periodDays,
            periodFrom,
            leads,
            overdue,
            pipeline,
            tickets,
            winLoss,
            conversion,
        }
    }

    /** filter: leads?status=X */
    private async leadCounts() {
        const groups = await this.prisma.crmLead.groupBy({
            by: ['status'],
            where: { status: { in: ['NEW', 'QUALIFIED'] } },
            _count: { _all: true },
        })
        const byStatus = countBy(['NEW', 'QUALIFIED'] as const, groups.map((g) => ({ key: g.status, count: g._count._all })))
        return { new: byStatus.NEW, qualified: byStatus.QUALIFIED }
    }

    /** filter: opportunities?activity=OVERDUE · tickets?queue=ALL&activity=OVERDUE */
    private async overdueCounts(now: Date) {
        const [opportunities, opportunityActivities, tickets, ticketActivities] = await Promise.all([
            this.prisma.crmOpportunity.count({ where: overdueOpportunityWhere(now) }),
            this.prisma.crmActivity.count({ where: overdueActivitiesWhere('opportunity', now) }),
            this.prisma.crmTicket.count({ where: overdueTicketWhere(now) }),
            this.prisma.crmActivity.count({ where: overdueActivitiesWhere('ticket', now) }),
        ])
        return {
            opportunities: { records: opportunities, activities: opportunityActivities },
            tickets: { records: tickets, activities: ticketActivities },
        }
    }

    /** Default ticket queue (OPEN + WAITING_CUSTOMER). filter: tickets?priority=X / tickets?status=X */
    private async ticketQueue() {
        const groups = await this.prisma.crmTicket.groupBy({
            by: ['status', 'priority'],
            where: { status: { in: [...TICKET_DEFAULT_QUEUE_STATUSES] } },
            _count: { _all: true },
        })
        const byPriority = countBy(
            TICKET_PRIORITY_ORDER,
            groups.map((g) => ({ key: g.priority, count: g._count._all })),
        )
        const byStatus = countBy(
            TICKET_DEFAULT_QUEUE_STATUSES,
            groups.map((g) => ({ key: g.status, count: g._count._all })),
        )
        return {
            queueTotal: groups.reduce((sum, g) => sum + g._count._all, 0),
            byStatus,
            byPriority: TICKET_PRIORITY_ORDER.map((priority) => ({ priority, count: byPriority[priority] })),
        }
    }

    /**
     * Opportunities closed in the window (closedAt is cleared on reopen, so reopened deals drop out).
     * filter: opportunities?stage=CLOSED_WON|CLOSED_LOST&closedFrom=…[&lostReason=X]
     */
    private async winLoss(periodFrom: Date) {
        const closedWhere: Prisma.CrmOpportunityWhereInput = { closedAt: { gte: periodFrom } }
        const [lostGroups, wonGroups] = await Promise.all([
            this.prisma.crmOpportunity.groupBy({
                by: ['lostReason'],
                where: { ...closedWhere, stage: 'CLOSED_LOST' },
                _count: { _all: true },
            }),
            this.prisma.crmOpportunity.groupBy({
                by: ['currency'],
                where: { ...closedWhere, stage: 'CLOSED_WON' },
                _count: { _all: true },
                _sum: { amount: true },
                orderBy: { currency: 'asc' },
            }),
        ])
        const byReason = countBy(
            LOST_REASONS,
            lostGroups.map((g) => ({ key: g.lostReason, count: g._count._all })),
        )
        const lost = lostGroups.reduce((sum, g) => sum + g._count._all, 0)
        const won = wonGroups.reduce((sum, g) => sum + g._count._all, 0)
        return {
            won: {
                count: won,
                byCurrency: wonGroups.map((g) => ({
                    currency: g.currency,
                    count: g._count._all,
                    amount: (g._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
                })),
            },
            lost: {
                count: lost,
                byReason: LOST_REASONS.map((reason) => ({ reason, count: byReason[reason] }))
                    .filter((r) => r.count > 0)
                    .sort((a, b) => b.count - a.count),
            },
            winRate: rate(won, won + lost),
        }
    }

    /**
     * Cohort of leads created in the window and where they stand now (no convertedAt is stored).
     * filter: leads?createdFrom=…[&status=X]
     */
    private async conversion(periodFrom: Date) {
        const groups = await this.prisma.crmLead.groupBy({
            by: ['status'],
            where: { createdAt: { gte: periodFrom } },
            _count: { _all: true },
        })
        const byStatus = countBy<LeadStatus>(
            LEAD_STATUSES,
            groups.map((g) => ({ key: g.status, count: g._count._all })),
        )
        const created = groups.reduce((sum, g) => sum + g._count._all, 0)
        return {
            leadsCreated: created,
            byStatus,
            converted: byStatus.CONVERTED,
            disqualified: byStatus.LOST + byStatus.UNQUALIFIED,
            inProgress: byStatus.NEW + byStatus.CONTACTED + byStatus.QUALIFIED,
            conversionRate: rate(byStatus.CONVERTED, created),
        }
    }
}
