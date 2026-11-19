import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
    overdueActivitiesWhere,
    overdueOpportunityWhere,
    overdueTicketWhere,
} from '../activities/activities.service'
import { LEAD_SOURCES, LEAD_STATUSES, type LeadSource, type LeadStatus } from '../leads/dto/lead.dto'
import { OPPORTUNITY_OPEN_STAGES } from '../opportunities/dto/opportunity.dto'
import { CrmOpportunitiesService } from '../opportunities/opportunities.service'
import { LOST_REASONS } from '../opportunities/opportunity-stages'
import {
    TICKET_DEFAULT_QUEUE_STATUSES,
    TICKET_PRIORITY_ORDER,
} from '../tickets/dto/ticket.dto'
import {
    CADENCE_LIST_LIMIT,
    cadenceDueTodayWhere,
    cadenceOverdueWhere,
} from './dashboard-cadence'
import {
    daysInStage,
    stalledOpportunityWhere,
    STALL_DEFAULT_THRESHOLD_DAYS,
    STALL_LIST_LIMIT,
} from './dashboard-stalls'
import {
    CrmDashboardCadenceQueryDto,
    CrmDashboardLeadSourcesQueryDto,
    CrmDashboardPipelineQueryDto,
    CrmDashboardQueryDto,
    CrmDashboardStalledQueryDto,
    DASHBOARD_DEFAULT_PERIOD_DAYS,
} from './dashboard.dto'

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

    /**
     * Personal work queue for the signed-in rep (or a manager-scoped owner).
     * Activities exclude completed (`doneAt`); overdue excludes same-day remaining items.
     */
    async cadence(userId: string, query: CrmDashboardCadenceQueryDto, now = new Date()) {
        const assignedTo =
            query.scope === 'all' ? undefined : (query.assignedTo?.trim() || userId)

        const activityInclude = {
            opportunity: { select: { id: true, name: true } },
            lead: { select: { id: true, name: true } },
            ticket: { select: { id: true, subject: true } },
        } as const

        const overdueWhere = cadenceOverdueWhere(now, assignedTo)
        const dueTodayWhere = cadenceDueTodayWhere(now, assignedTo)
        const openOppWhere: Prisma.CrmOpportunityWhereInput = {
            stage: { in: [...OPPORTUNITY_OPEN_STAGES] },
            ...(assignedTo ? { assignedTo } : {}),
        }
        const openTicketWhere: Prisma.CrmTicketWhereInput = {
            status: { in: [...TICKET_DEFAULT_QUEUE_STATUSES] },
            ...(assignedTo ? { assignedTo } : {}),
        }

        const [
            overdueCount,
            dueTodayCount,
            overdueRows,
            dueTodayRows,
            openOpportunitiesCount,
            openOpportunities,
            openTicketsCount,
            openTickets,
        ] = await Promise.all([
            this.prisma.crmActivity.count({ where: overdueWhere }),
            this.prisma.crmActivity.count({ where: dueTodayWhere }),
            this.prisma.crmActivity.findMany({
                where: overdueWhere,
                include: activityInclude,
                orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
                take: CADENCE_LIST_LIMIT,
            }),
            this.prisma.crmActivity.findMany({
                where: dueTodayWhere,
                include: activityInclude,
                orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
                take: CADENCE_LIST_LIMIT,
            }),
            this.prisma.crmOpportunity.count({ where: openOppWhere }),
            this.prisma.crmOpportunity.findMany({
                where: openOppWhere,
                select: {
                    id: true,
                    name: true,
                    stage: true,
                    amount: true,
                    currency: true,
                    expectedCloseDate: true,
                },
                orderBy: [{ expectedCloseDate: 'asc' }, { amount: 'desc' }, { id: 'asc' }],
                take: CADENCE_LIST_LIMIT,
            }),
            this.prisma.crmTicket.count({ where: openTicketWhere }),
            this.prisma.crmTicket.findMany({
                where: openTicketWhere,
                select: {
                    id: true,
                    subject: true,
                    priority: true,
                    status: true,
                },
                orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
                take: 50,
            }),
        ])

        // Priority is stored as free strings; sort URGENT→LOW then keep the top preview rows.
        const priorityRank = new Map(
            TICKET_PRIORITY_ORDER.map((p, i) => [p, i] as const),
        )
        openTickets.sort(
            (a, b) =>
                (priorityRank.get(a.priority as (typeof TICKET_PRIORITY_ORDER)[number]) ?? 99) -
                (priorityRank.get(b.priority as (typeof TICKET_PRIORITY_ORDER)[number]) ?? 99),
        )
        const topTickets = openTickets.slice(0, CADENCE_LIST_LIMIT)

        return {
            generatedAt: now,
            scope: query.scope === 'all' ? 'all' : 'mine',
            assignedTo: assignedTo ?? null,
            overdueActivities: {
                count: overdueCount,
                items: overdueRows.map((row) => this.cadenceActivityView(row)),
            },
            dueTodayActivities: {
                count: dueTodayCount,
                items: dueTodayRows.map((row) => this.cadenceActivityView(row)),
            },
            openOpportunities: {
                count: openOpportunitiesCount,
                items: openOpportunities.map((row) => ({
                    id: row.id,
                    name: row.name,
                    stage: row.stage,
                    amount: row.amount == null ? null : row.amount.toFixed(2),
                    currency: row.currency,
                    expectedCloseDate: row.expectedCloseDate,
                })),
            },
            openTickets: {
                count: openTicketsCount,
                items: topTickets.map((row) => ({
                    id: row.id,
                    subject: row.subject,
                    priority: row.priority,
                    status: row.status,
                })),
            },
        }
    }

    /**
     * Open-stage funnel (live counts + Σ amount) plus win rate for a closed period.
     * Reuses the opportunities pipeline engine; win rate ignores open deals.
     */
    async pipelineMetrics(
        userId: string,
        query: CrmDashboardPipelineQueryDto,
        now = new Date(),
    ) {
        const assignedTo =
            query.scope === 'all' ? undefined : (query.assignedTo?.trim() || userId)
        const { periodFrom, periodTo } = this.resolvePeriod(query, now)

        const [pipeline, winLoss] = await Promise.all([
            this.opportunities.pipeline(assignedTo ? { assignedTo } : {}),
            this.winLoss(periodFrom, { assignedTo, periodTo }),
        ])

        return {
            generatedAt: now,
            scope: query.scope === 'all' ? 'all' : 'mine',
            assignedTo: assignedTo ?? null,
            periodFrom,
            periodTo,
            stages: pipeline.stages.map((stage) => ({
                stage: stage.stage,
                count: stage.count,
                byCurrency: stage.byCurrency.map((c) => ({
                    currency: c.currency,
                    count: c.count,
                    totalAmount: c.amount,
                })),
            })),
            totals: pipeline.totals.map((total) => ({
                currency: total.currency,
                count: total.count,
                totalAmount: total.amount,
            })),
            winRate: winLoss.winRate,
            won: winLoss.won.count,
            lost: winLoss.lost.count,
        }
    }

    private resolvePeriod(
        query: { days?: number; from?: Date; to?: Date },
        now: Date,
    ) {
        const periodTo = query.to && query.to.getTime() < now.getTime() ? query.to : now
        if (query.from) {
            return { periodFrom: query.from, periodTo }
        }
        const days = query.days ?? DASHBOARD_DEFAULT_PERIOD_DAYS
        return {
            periodFrom: new Date(periodTo.getTime() - days * DAY_MS),
            periodTo,
        }
    }

    /**
     * Lead cohort created in the period, broken down by source (zeros included).
     * Won amount = CLOSED_WON opportunities closed in the same window that still link a lead.
     */
    async leadSources(
        userId: string,
        query: CrmDashboardLeadSourcesQueryDto,
        now = new Date(),
    ) {
        const assignedTo =
            query.scope === 'all' ? undefined : (query.assignedTo?.trim() || userId)
        const { periodFrom, periodTo } = this.resolvePeriod(query, now)
        const createdAt: Prisma.DateTimeFilter = { gte: periodFrom, lte: periodTo }
        const leadOwner = assignedTo ? { assignedTo } : {}

        const [createdGroups, convertedGroups, wonRows] = await Promise.all([
            this.prisma.crmLead.groupBy({
                by: ['source'],
                where: { createdAt, ...leadOwner },
                _count: { _all: true },
            }),
            this.prisma.crmLead.groupBy({
                by: ['source'],
                where: { createdAt, status: 'CONVERTED', ...leadOwner },
                _count: { _all: true },
            }),
            this.prisma.crmOpportunity.findMany({
                where: {
                    stage: 'CLOSED_WON',
                    closedAt: { gte: periodFrom, lte: periodTo },
                    leadId: { not: null },
                    ...(assignedTo ? { lead: { assignedTo } } : {}),
                },
                select: {
                    amount: true,
                    currency: true,
                    lead: { select: { source: true } },
                },
            }),
        ])

        const createdBy = countBy(
            LEAD_SOURCES,
            createdGroups.map((g) => ({ key: g.source, count: g._count._all })),
        )
        const convertedBy = countBy(
            LEAD_SOURCES,
            convertedGroups.map((g) => ({ key: g.source, count: g._count._all })),
        )

        const wonBySource = new Map<
            LeadSource,
            Map<string, { count: number; amount: Prisma.Decimal }>
        >()
        for (const row of wonRows) {
            const source = row.lead?.source
            if (!source || !(LEAD_SOURCES as readonly string[]).includes(source)) continue
            const keyed = source as LeadSource
            const byCurrency = wonBySource.get(keyed) ?? new Map()
            const cur = byCurrency.get(row.currency) ?? {
                count: 0,
                amount: new Prisma.Decimal(0),
            }
            cur.count += 1
            cur.amount = cur.amount.plus(row.amount ?? 0)
            byCurrency.set(row.currency, cur)
            wonBySource.set(keyed, byCurrency)
        }

        const sources = LEAD_SOURCES.map((source) => {
            const leadsCreated = createdBy[source]
            const converted = convertedBy[source]
            const wonCurrencies = [...(wonBySource.get(source) ?? new Map())].map(
                ([currency, t]) => ({
                    currency,
                    count: t.count,
                    amount: t.amount.toFixed(2),
                }),
            )
            wonCurrencies.sort((a, b) => a.currency.localeCompare(b.currency))
            return {
                source,
                leadsCreated,
                converted,
                conversionRate: rate(converted, leadsCreated),
                won: {
                    count: wonCurrencies.reduce((sum, c) => sum + c.count, 0),
                    byCurrency: wonCurrencies,
                },
            }
        })

        return {
            generatedAt: now,
            scope: query.scope === 'all' ? 'all' : 'mine',
            assignedTo: assignedTo ?? null,
            periodFrom,
            periodTo,
            sources,
            totals: {
                leadsCreated: sources.reduce((sum, s) => sum + s.leadsCreated, 0),
                converted: sources.reduce((sum, s) => sum + s.converted, 0),
                conversionRate: rate(
                    sources.reduce((sum, s) => sum + s.converted, 0),
                    sources.reduce((sum, s) => sum + s.leadsCreated, 0),
                ),
                wonCount: sources.reduce((sum, s) => sum + s.won.count, 0),
            },
        }
    }

    /**
     * Open opportunities sitting in the same stage longer than the threshold.
     * Defaults to org-wide (`scope=all` via caller) or personal when scoped to mine.
     */
    async stalled(userId: string, query: CrmDashboardStalledQueryDto, now = new Date()) {
        const assignedTo =
            query.scope === 'all' ? undefined : (query.assignedTo?.trim() || userId)
        const thresholdDays = query.thresholdDays ?? STALL_DEFAULT_THRESHOLD_DAYS
        const where = stalledOpportunityWhere(now, thresholdDays, assignedTo)

        const [count, rows] = await Promise.all([
            this.prisma.crmOpportunity.count({ where }),
            this.prisma.crmOpportunity.findMany({
                where,
                select: {
                    id: true,
                    name: true,
                    stage: true,
                    amount: true,
                    currency: true,
                    expectedCloseDate: true,
                    stageEnteredAt: true,
                    assignedTo: true,
                },
                orderBy: [{ stageEnteredAt: 'asc' }, { amount: 'desc' }, { id: 'asc' }],
                take: STALL_LIST_LIMIT,
            }),
        ])

        return {
            generatedAt: now,
            scope: query.scope === 'all' ? 'all' : 'mine',
            assignedTo: assignedTo ?? null,
            thresholdDays,
            count,
            items: rows.map((row) => ({
                id: row.id,
                name: row.name,
                stage: row.stage,
                amount: row.amount == null ? null : row.amount.toFixed(2),
                currency: row.currency,
                expectedCloseDate: row.expectedCloseDate,
                stageEnteredAt: row.stageEnteredAt,
                daysInStage: daysInStage(row.stageEnteredAt, now),
                assignedTo: row.assignedTo,
            })),
        }
    }

    private cadenceActivityView(row: {
        id: string
        type: string
        summary: string
        dueAt: Date
        assignedTo: string
        opportunityId: string | null
        leadId: string | null
        ticketId: string | null
        opportunity: { id: string; name: string } | null
        lead: { id: string; name: string } | null
        ticket: { id: string; subject: string } | null
    }) {
        const parent = row.opportunity
            ? {
                  kind: 'opportunity' as const,
                  id: row.opportunity.id,
                  label: row.opportunity.name,
              }
            : row.ticket
              ? {
                    kind: 'ticket' as const,
                    id: row.ticket.id,
                    label: row.ticket.subject,
                }
              : row.lead
                ? {
                      kind: 'lead' as const,
                      id: row.lead.id,
                      label: row.lead.name,
                  }
                : null

        return {
            id: row.id,
            type: row.type,
            summary: row.summary,
            dueAt: row.dueAt,
            assignedTo: row.assignedTo,
            parent,
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
    private async winLoss(
        periodFrom: Date,
        opts: { assignedTo?: string; periodTo?: Date } = {},
    ) {
        const closedAt: Prisma.DateTimeFilter = { gte: periodFrom }
        if (opts.periodTo) closedAt.lte = opts.periodTo
        const closedWhere: Prisma.CrmOpportunityWhereInput = {
            closedAt,
            ...(opts.assignedTo ? { assignedTo: opts.assignedTo } : {}),
        }
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
