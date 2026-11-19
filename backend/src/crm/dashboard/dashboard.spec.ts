import { Prisma } from '@prisma/client'
import { PERMISSION_KEY } from '../../permissions/permission.guard'
import type { PrismaService } from '../../prisma/prisma.service'
import type { CrmOpportunitiesService } from '../opportunities/opportunities.service'
import { CrmDashboardController } from './dashboard.controller'
import { CrmDashboardService } from './dashboard.service'

const NOW = new Date('2026-10-06T02:00:00Z')
const DAY_MS = 24 * 60 * 60 * 1000

type GroupArgs = { by: string[]; where: Record<string, unknown> }

function mockPrisma() {
    return {
        crmLead: {
            groupBy: jest.fn((args: GroupArgs) =>
                Promise.resolve(
                    args.where.createdAt
                        ? [
                              { status: 'CONVERTED', _count: { _all: 3 } },
                              { status: 'LOST', _count: { _all: 1 } },
                              { status: 'UNQUALIFIED', _count: { _all: 1 } },
                              { status: 'NEW', _count: { _all: 5 } },
                          ]
                        : [
                              { status: 'NEW', _count: { _all: 7 } },
                              { status: 'QUALIFIED', _count: { _all: 2 } },
                          ],
                ),
            ),
        },
        crmOpportunity: {
            count: jest.fn().mockResolvedValue(4),
            findMany: jest.fn().mockResolvedValue([]),
            groupBy: jest.fn((args: GroupArgs) =>
                Promise.resolve(
                    args.by[0] === 'lostReason'
                        ? [
                              { lostReason: 'TIMING', _count: { _all: 1 } },
                              { lostReason: 'PRICE', _count: { _all: 2 } },
                          ]
                        : [
                              {
                                  currency: 'PHP',
                                  _count: { _all: 6 },
                                  _sum: { amount: new Prisma.Decimal('1500.5') },
                              },
                          ],
                ),
            ),
        },
        crmTicket: {
            count: jest.fn().mockResolvedValue(2),
            findMany: jest.fn().mockResolvedValue([]),
            groupBy: jest.fn().mockResolvedValue([
                { status: 'OPEN', priority: 'URGENT', _count: { _all: 1 } },
                { status: 'OPEN', priority: 'LOW', _count: { _all: 3 } },
                { status: 'WAITING_CUSTOMER', priority: 'URGENT', _count: { _all: 2 } },
            ]),
        },
        crmActivity: {
            count: jest.fn().mockResolvedValue(5),
            findMany: jest.fn().mockResolvedValue([]),
        },
    }
}

const pipeline = { stages: [], totals: [{ currency: 'PHP', count: 1, amount: '100.00', weightedAmount: '25.00' }] }

function build(prisma = mockPrisma()) {
    const opportunities = { pipeline: jest.fn().mockResolvedValue(pipeline) }
    const service = new CrmDashboardService(
        prisma as unknown as PrismaService,
        opportunities as unknown as CrmOpportunitiesService,
    )
    return { prisma, opportunities, service }
}

describe('CrmDashboardService', () => {
    it('summarizes leads, overdue work, pipeline and the ticket queue', async () => {
        const { prisma, opportunities, service } = build()
        const result = await service.get({}, NOW)

        expect(result.leads).toEqual({ new: 7, qualified: 2 })
        expect(result.overdue).toEqual({
            opportunities: { records: 4, activities: 5 },
            tickets: { records: 2, activities: 5 },
        })
        expect(result.pipeline).toBe(pipeline)
        expect(opportunities.pipeline).toHaveBeenCalledWith({})
        expect(result.tickets).toEqual({
            queueTotal: 6,
            byStatus: { OPEN: 4, WAITING_CUSTOMER: 2 },
            byPriority: [
                { priority: 'URGENT', count: 3 },
                { priority: 'HIGH', count: 0 },
                { priority: 'MEDIUM', count: 0 },
                { priority: 'LOW', count: 3 },
            ],
        })
        expect(prisma.crmTicket.groupBy.mock.calls[0][0].where).toEqual({
            status: { in: ['OPEN', 'WAITING_CUSTOMER'] },
        })
    })

    it('uses the same overdue rule as the list filters', async () => {
        const { prisma, service } = build()
        await service.get({}, NOW)
        const overdue = { doneAt: null, dueAt: { lt: NOW } }
        expect(prisma.crmOpportunity.count.mock.calls[0][0].where).toEqual({
            stage: { in: ['PROSPECTING', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION'] },
            activities: { some: overdue },
        })
        expect(prisma.crmTicket.count.mock.calls[0][0].where).toEqual({
            status: { notIn: ['CLOSED', 'CANCELLED'] },
            activities: { some: overdue },
        })
        expect(prisma.crmActivity.count.mock.calls.map((c) => c[0].where)).toEqual([
            { ...overdue, opportunity: { stage: { in: expect.any(Array) } } },
            { ...overdue, ticket: { status: { notIn: ['CLOSED', 'CANCELLED'] } } },
        ])
    })

    it('reports win/loss by reason and the lead cohort for the default 90-day window', async () => {
        const { prisma, service } = build()
        const result = await service.get({}, NOW)
        const periodFrom = new Date(NOW.getTime() - 90 * DAY_MS)

        expect(result.periodDays).toBe(90)
        expect(result.periodFrom).toEqual(periodFrom)
        expect(result.winLoss).toEqual({
            won: { count: 6, byCurrency: [{ currency: 'PHP', count: 6, amount: '1500.50' }] },
            lost: {
                count: 3,
                byReason: [
                    { reason: 'PRICE', count: 2 },
                    { reason: 'TIMING', count: 1 },
                ],
            },
            winRate: 66.7,
        })
        const closedWheres = prisma.crmOpportunity.groupBy.mock.calls.map((c) => c[0].where)
        expect(closedWheres).toEqual([
            { closedAt: { gte: periodFrom }, stage: 'CLOSED_LOST' },
            { closedAt: { gte: periodFrom }, stage: 'CLOSED_WON' },
        ])
        expect(result.conversion).toEqual(
            expect.objectContaining({
                leadsCreated: 10,
                converted: 3,
                disqualified: 2,
                inProgress: 5,
                conversionRate: 30,
            }),
        )
    })

    it('honours a custom window and returns null rates when nothing closed', async () => {
        const prisma = mockPrisma()
        prisma.crmOpportunity.groupBy.mockImplementation(() => Promise.resolve([]))
        prisma.crmLead.groupBy.mockImplementation(() => Promise.resolve([]))
        const { service } = build(prisma)
        const result = await service.get({ days: 30 }, NOW)

        expect(result.periodFrom).toEqual(new Date(NOW.getTime() - 30 * DAY_MS))
        expect(result.winLoss.winRate).toBeNull()
        expect(result.winLoss.lost.byReason).toEqual([])
        expect(result.conversion.conversionRate).toBeNull()
        expect(result.leads).toEqual({ new: 0, qualified: 0 })
    })
})

describe('CrmDashboardService.leadSources', () => {
    it('returns every lead source with zeros, conversion rate, and won amounts', async () => {
        const prisma = mockPrisma()
        prisma.crmLead.groupBy.mockImplementation((args: GroupArgs) =>
            Promise.resolve(
                args.where.status === 'CONVERTED'
                    ? [
                          { source: 'WEBSITE', _count: { _all: 2 } },
                          { source: 'REFERRAL', _count: { _all: 1 } },
                      ]
                    : [
                          { source: 'WEBSITE', _count: { _all: 5 } },
                          { source: 'REFERRAL', _count: { _all: 3 } },
                          { source: 'OTHER', _count: { _all: 2 } },
                      ],
            ) as never,
        )
        prisma.crmOpportunity.findMany.mockResolvedValue([
            {
                amount: new Prisma.Decimal('100.00'),
                currency: 'PHP',
                lead: { source: 'WEBSITE' },
            },
            {
                amount: new Prisma.Decimal('50.00'),
                currency: 'PHP',
                lead: { source: 'WEBSITE' },
            },
        ])
        const { service } = build(prisma)
        const result = await service.leadSources('user-a', { scope: 'all', days: 30 }, NOW)
        const periodFrom = new Date(NOW.getTime() - 30 * DAY_MS)

        expect(result.periodFrom).toEqual(periodFrom)
        expect(result.sources).toHaveLength(7)
        expect(result.sources.map((s) => s.source)).toEqual([
            'WEBSITE',
            'REFERRAL',
            'WALK_IN',
            'CAMPAIGN',
            'EVENT',
            'COLD_CALL',
            'OTHER',
        ])
        expect(result.sources.find((s) => s.source === 'WEBSITE')).toEqual({
            source: 'WEBSITE',
            leadsCreated: 5,
            converted: 2,
            conversionRate: 40,
            won: {
                count: 2,
                byCurrency: [{ currency: 'PHP', count: 2, amount: '150.00' }],
            },
        })
        expect(result.sources.find((s) => s.source === 'WALK_IN')).toMatchObject({
            leadsCreated: 0,
            converted: 0,
            conversionRate: null,
            won: { count: 0, byCurrency: [] },
        })
        expect(result.totals).toEqual({
            leadsCreated: 10,
            converted: 3,
            conversionRate: 30,
            wonCount: 2,
        })
        expect(prisma.crmOpportunity.findMany.mock.calls[0][0].where).toEqual({
            stage: 'CLOSED_WON',
            closedAt: { gte: periodFrom, lte: NOW },
            leadId: { not: null },
        })
    })

    it('scopes lead and won queries to the owner when mine', async () => {
        const prisma = mockPrisma()
        prisma.crmLead.groupBy.mockResolvedValue([])
        prisma.crmOpportunity.findMany.mockResolvedValue([])
        const { service } = build(prisma)
        await service.leadSources('user-a', {}, NOW)
        expect(prisma.crmLead.groupBy.mock.calls[0][0].where.assignedTo).toBe('user-a')
        expect(prisma.crmOpportunity.findMany.mock.calls[0][0].where.lead).toEqual({
            assignedTo: 'user-a',
        })
    })
})

describe('CrmDashboardService.stalled', () => {
    it('lists open opportunities past the stage-age threshold for the current user', async () => {
        const prisma = mockPrisma()
        const entered = new Date(NOW.getTime() - 20 * DAY_MS)
        prisma.crmOpportunity.count.mockResolvedValue(1)
        prisma.crmOpportunity.findMany.mockResolvedValue([
            {
                id: 'opp-stale',
                name: 'Stuck deal',
                stage: 'PROPOSAL',
                amount: new Prisma.Decimal('500.00'),
                currency: 'PHP',
                expectedCloseDate: null,
                stageEnteredAt: entered,
                assignedTo: 'user-a',
            },
        ])
        const { service } = build(prisma)
        const result = await service.stalled('user-a', {}, NOW)

        expect(result.scope).toBe('mine')
        expect(result.thresholdDays).toBe(14)
        expect(result.count).toBe(1)
        expect(result.items[0]).toMatchObject({
            id: 'opp-stale',
            daysInStage: 20,
            amount: '500.00',
        })
        expect(prisma.crmOpportunity.findMany.mock.calls[0][0].where).toEqual({
            stage: { in: ['PROSPECTING', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION'] },
            stageEnteredAt: { lte: new Date(NOW.getTime() - 14 * DAY_MS) },
            assignedTo: 'user-a',
        })
    })

    it('does not filter by owner when scope=all and honours thresholdDays', async () => {
        const prisma = mockPrisma()
        prisma.crmOpportunity.findMany.mockResolvedValue([])
        const { service } = build(prisma)
        await service.stalled('user-a', { scope: 'all', thresholdDays: 30 }, NOW)
        expect(prisma.crmOpportunity.count.mock.calls[0][0].where).toEqual({
            stage: { in: ['PROSPECTING', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION'] },
            stageEnteredAt: { lte: new Date(NOW.getTime() - 30 * DAY_MS) },
        })
    })
})

describe('CrmDashboardService.pipelineMetrics', () => {
    it('returns open-stage totals and win rate for the default window', async () => {
        const { prisma, opportunities, service } = build()
        opportunities.pipeline.mockResolvedValue({
            stages: [
                {
                    stage: 'PROPOSAL',
                    count: 2,
                    byCurrency: [
                        {
                            currency: 'PHP',
                            count: 2,
                            amount: '200.00',
                            weightedAmount: '100.00',
                        },
                    ],
                },
            ],
            totals: [
                {
                    currency: 'PHP',
                    count: 2,
                    amount: '200.00',
                    weightedAmount: '100.00',
                },
            ],
        })

        const result = await service.pipelineMetrics('user-a', {}, NOW)
        const periodFrom = new Date(NOW.getTime() - 90 * DAY_MS)

        expect(result.scope).toBe('mine')
        expect(result.assignedTo).toBe('user-a')
        expect(result.periodFrom).toEqual(periodFrom)
        expect(result.periodTo).toEqual(NOW)
        expect(opportunities.pipeline).toHaveBeenCalledWith({ assignedTo: 'user-a' })
        expect(result.stages).toEqual([
            {
                stage: 'PROPOSAL',
                count: 2,
                byCurrency: [{ currency: 'PHP', count: 2, totalAmount: '200.00' }],
            },
        ])
        expect(result.totals).toEqual([
            { currency: 'PHP', count: 2, totalAmount: '200.00' },
        ])
        expect(result.winRate).toBe(66.7)
        expect(result.won).toBe(6)
        expect(result.lost).toBe(3)
        expect(prisma.crmOpportunity.groupBy.mock.calls.map((c) => c[0].where)).toEqual([
            {
                closedAt: { gte: periodFrom, lte: NOW },
                assignedTo: 'user-a',
                stage: 'CLOSED_LOST',
            },
            {
                closedAt: { gte: periodFrom, lte: NOW },
                assignedTo: 'user-a',
                stage: 'CLOSED_WON',
            },
        ])
    })

    it('does not filter by owner when scope=all and honours from/to', async () => {
        const { prisma, opportunities, service } = build()
        const from = new Date('2026-09-01T00:00:00Z')
        const to = new Date('2026-09-30T23:59:59Z')
        await service.pipelineMetrics('user-a', { scope: 'all', from, to }, NOW)

        expect(opportunities.pipeline).toHaveBeenCalledWith({})
        expect(prisma.crmOpportunity.groupBy.mock.calls.map((c) => c[0].where)).toEqual([
            { closedAt: { gte: from, lte: to }, stage: 'CLOSED_LOST' },
            { closedAt: { gte: from, lte: to }, stage: 'CLOSED_WON' },
        ])
    })
})

describe('CrmDashboardService.cadence', () => {
    it('scopes overdue and due-today activities to the current user by default', async () => {
        const prisma = mockPrisma()
        prisma.crmActivity.findMany.mockResolvedValue([
            {
                id: 'act-1',
                type: 'CALL',
                summary: 'Follow up',
                dueAt: new Date('2026-10-05T01:00:00Z'),
                assignedTo: 'user-a',
                opportunityId: 'opp-1',
                leadId: null,
                ticketId: null,
                opportunity: { id: 'opp-1', name: 'Deal' },
                lead: null,
                ticket: null,
            },
        ])
        prisma.crmOpportunity.findMany.mockResolvedValue([
            {
                id: 'opp-1',
                name: 'Deal',
                stage: 'PROPOSAL',
                amount: new Prisma.Decimal('100.00'),
                currency: 'PHP',
                expectedCloseDate: new Date('2026-10-20T00:00:00Z'),
            },
        ])
        prisma.crmOpportunity.count.mockResolvedValue(1)
        prisma.crmTicket.findMany.mockResolvedValue([
            { id: 't-1', subject: 'Help', priority: 'URGENT', status: 'OPEN' },
            { id: 't-2', subject: 'Later', priority: 'LOW', status: 'OPEN' },
        ])
        prisma.crmTicket.count.mockResolvedValue(2)
        const { service } = build(prisma)

        const result = await service.cadence('user-a', {}, NOW)

        expect(result.scope).toBe('mine')
        expect(result.assignedTo).toBe('user-a')
        expect(prisma.crmActivity.count.mock.calls[0][0].where.assignedTo).toBe('user-a')
        expect(prisma.crmActivity.count.mock.calls[0][0].where.doneAt).toBeNull()
        expect(prisma.crmActivity.count.mock.calls[0][0].where.dueAt).toEqual({ lt: NOW })
        expect(prisma.crmActivity.count.mock.calls[1][0].where.dueAt).toEqual({
            gte: NOW,
            lt: expect.any(Date),
        })
        expect(result.overdueActivities.items[0]).toMatchObject({
            id: 'act-1',
            parent: { kind: 'opportunity', id: 'opp-1', label: 'Deal' },
        })
        expect(result.openOpportunities.items[0].amount).toBe('100.00')
        expect(result.openTickets.items.map((t) => t.priority)).toEqual(['URGENT', 'LOW'])
    })

    it('does not filter by owner when scope=all', async () => {
        const prisma = mockPrisma()
        prisma.crmOpportunity.findMany.mockResolvedValue([])
        prisma.crmTicket.findMany.mockResolvedValue([])
        const { service } = build(prisma)
        await service.cadence('user-a', { scope: 'all' }, NOW)
        expect(prisma.crmActivity.count.mock.calls[0][0].where.assignedTo).toBeUndefined()
        expect(prisma.crmOpportunity.count.mock.calls[0][0].where.assignedTo).toBeUndefined()
    })
})

describe('CrmDashboardController RBAC metadata', () => {
    it('requires crm.dashboard:read', () => {
        expect(Reflect.getMetadata(PERMISSION_KEY, CrmDashboardController.prototype.get)).toEqual({
            resource: 'crm.dashboard',
            action: 'read',
        })
        expect(
            Reflect.getMetadata(PERMISSION_KEY, CrmDashboardController.prototype.cadence),
        ).toEqual({
            resource: 'crm.dashboard',
            action: 'read',
        })
        expect(
            Reflect.getMetadata(PERMISSION_KEY, CrmDashboardController.prototype.pipeline),
        ).toEqual({
            resource: 'crm.dashboard',
            action: 'read',
        })
        expect(
            Reflect.getMetadata(PERMISSION_KEY, CrmDashboardController.prototype.stalled),
        ).toEqual({
            resource: 'crm.dashboard',
            action: 'read',
        })
        expect(
            Reflect.getMetadata(PERMISSION_KEY, CrmDashboardController.prototype.leadSources),
        ).toEqual({
            resource: 'crm.dashboard',
            action: 'read',
        })
    })
})
