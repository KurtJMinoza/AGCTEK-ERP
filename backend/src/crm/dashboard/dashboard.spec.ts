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
            groupBy: jest.fn().mockResolvedValue([
                { status: 'OPEN', priority: 'URGENT', _count: { _all: 1 } },
                { status: 'OPEN', priority: 'LOW', _count: { _all: 3 } },
                { status: 'WAITING_CUSTOMER', priority: 'URGENT', _count: { _all: 2 } },
            ]),
        },
        crmActivity: { count: jest.fn().mockResolvedValue(5) },
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

describe('CrmDashboardController RBAC metadata', () => {
    it('requires crm.dashboard:read', () => {
        expect(Reflect.getMetadata(PERMISSION_KEY, CrmDashboardController.prototype.get)).toEqual({
            resource: 'crm.dashboard',
            action: 'read',
        })
    })
})
