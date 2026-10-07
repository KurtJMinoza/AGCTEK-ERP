import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PERMISSION_KEY } from '../../permissions/permission.guard'
import type { PrismaService } from '../../prisma/prisma.service'
import type { QuotationService } from '../../sd/quotation.service'
import { CrmActivitiesService } from '../activities/activities.service'
import type { UpdateOpportunityDto } from './dto/opportunity.dto'
import { CrmOpportunitiesController } from './opportunities.controller'
import {
    canMoveStage,
    CrmOpportunitiesService,
    serializeOpportunity,
} from './opportunities.service'
import { isForwardMove, unmetStageRequirements } from './opportunity-stages'

const updatedAt = new Date('2026-10-01T00:00:00Z')

function opportunity(overrides: Record<string, unknown> = {}) {
    return {
        id: 'opp-1',
        customerId: 'cust-1',
        leadId: null,
        name: 'Fleet deal',
        amount: new Decimal('1500'),
        stage: 'NEGOTIATION',
        probability: 60,
        expectedCloseDate: new Date('2026-12-31T00:00:00Z'),
        closedAt: null,
        lostReason: null as string | null,
        lostNotes: null as string | null,
        sdSalesOrderId: null as string | null,
        updatedAt,
        customer: { id: 'cust-1' },
        lead: null,
        ...overrides,
    }
}

function mockPrisma(
    opts: {
        opportunity?: ReturnType<typeof opportunity> | null
        customer?: boolean
        customerStatus?: string
        lead?: { customerId: string | null } | null
    } = {},
) {
    return {
        sdCustomer: {
            findUnique: jest
                .fn()
                .mockResolvedValue(
                    opts.customer === false ? null : { id: 'cust-1', status: opts.customerStatus ?? 'ACTIVE' },
                ),
        },
        user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-2' }) },
        crmLead: {
            findUnique: jest.fn().mockResolvedValue(opts.lead === undefined ? { customerId: null } : opts.lead),
        },
        crmOpportunity: {
            findUnique: jest
                .fn()
                .mockResolvedValue(opts.opportunity === undefined ? opportunity() : opts.opportunity),
            create: jest.fn((args: { data: Record<string, unknown> }) =>
                Promise.resolve({ ...opportunity(), ...args.data }),
            ),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findMany: jest.fn().mockResolvedValue([opportunity()]),
            count: jest.fn().mockResolvedValue(1),
        },
        crmActivity: { groupBy: jest.fn().mockResolvedValue([]) },
        $queryRaw: jest.fn(
            (strings: TemplateStringsArray): Promise<unknown[]> =>
                Promise.resolve(strings.join('?').includes('FOR UPDATE') ? [{ id: 'opp-1' }] : []),
        ),
        $transaction: jest.fn(),
    }
}

const mockQuotations = () => ({
    expireOverdue: jest.fn().mockResolvedValue(0),
    findActiveForOpportunity: jest.fn().mockResolvedValue(null),
    cancelActiveForOpportunity: jest.fn().mockResolvedValue(0),
})

const service = (prisma: ReturnType<typeof mockPrisma>, quotations = mockQuotations()) => {
    prisma.$transaction.mockImplementation((arg: unknown) =>
        Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prisma),
    )
    return new CrmOpportunitiesService(
        prisma as unknown as PrismaService,
        new CrmActivitiesService(prisma as unknown as PrismaService),
        quotations as unknown as QuotationService,
    )
}

const updateData = (prisma: ReturnType<typeof mockPrisma>) =>
    (prisma.crmOpportunity.updateMany.mock.calls[0][0] as { data: Record<string, unknown> }).data

describe('CrmOpportunitiesService', () => {
    it('requires an existing SdCustomer on create and never creates one', async () => {
        const prisma = mockPrisma({ customer: false })
        await expect(
            service(prisma).create({ customerId: 'missing', name: 'X' }, 'user-1'),
        ).rejects.toBeInstanceOf(NotFoundException)
        expect(prisma.crmOpportunity.create).not.toHaveBeenCalled()
    })

    it('creates in PROSPECTING by default and returns amount as a 2-decimal string', async () => {
        const prisma = mockPrisma()
        const created = await service(prisma).create(
            { customerId: 'cust-1', name: 'Deal', amount: 1234.5 },
            'user-1',
        )
        const data = prisma.crmOpportunity.create.mock.calls[0][0].data
        expect(data).toEqual(expect.objectContaining({ stage: 'PROSPECTING', currency: 'PHP' }))
        expect(data).not.toHaveProperty('sdSalesOrderId')
        expect(created.amount).toBe('1234.50')
    })

    it('rejects a lead that belongs to another customer', async () => {
        const prisma = mockPrisma({ lead: { customerId: 'cust-other' } })
        await expect(
            service(prisma).create({ customerId: 'cust-1', name: 'X', leadId: 'lead-1' }, 'user-1'),
        ).rejects.toThrow('Lead belongs to a different customer')
    })

    it('refuses Closed Won through update; winning goes through POST :id/win', async () => {
        const prisma = mockPrisma()
        await expect(
            service(prisma).update('opp-1', { stage: 'CLOSED_WON' }, 'user-1'),
        ).rejects.toThrow(/POST \/crm\/opportunities\/:id\/win/)
        expect(prisma.crmOpportunity.updateMany).not.toHaveBeenCalled()
    })

    it('assertCanWin passes an open opportunity with an amount and an active customer', async () => {
        const prisma = mockPrisma()
        await expect(service(prisma).assertCanWin(opportunity())).resolves.toBeUndefined()
    })

    it('assertCanWin requires an amount', async () => {
        const prisma = mockPrisma()
        await expect(
            service(prisma).assertCanWin(opportunity({ amount: null })),
        ).rejects.toThrow('Moving to Closed Won requires an amount')
    })

    it('closes as lost with zero probability and the given reason', async () => {
        const prisma = mockPrisma()
        await service(prisma).update(
            'opp-1',
            { stage: 'CLOSED_LOST', lostReason: 'PRICE' },
            'user-1',
        )
        expect(updateData(prisma)).toEqual(
            expect.objectContaining({ stage: 'CLOSED_LOST', probability: 0, lostReason: 'PRICE' }),
        )
    })

    it('reopens a lost opportunity and clears closedAt', async () => {
        const prisma = mockPrisma({
            opportunity: opportunity({ stage: 'CLOSED_LOST', closedAt: new Date() }),
        })
        await service(prisma).update('opp-1', { stage: 'PROPOSAL' }, 'user-1')
        expect(updateData(prisma)).toEqual(
            expect.objectContaining({ stage: 'PROPOSAL', closedAt: null }),
        )
    })

    it('treats Closed Won as read-only', async () => {
        const prisma = mockPrisma({ opportunity: opportunity({ stage: 'CLOSED_WON' }) })
        await expect(
            service(prisma).update('opp-1', { name: 'Renamed' }, 'user-1'),
        ).rejects.toBeInstanceOf(ConflictException)
    })

    it('rejects moving a lost opportunity straight to won', async () => {
        const prisma = mockPrisma()
        await expect(
            service(prisma).assertCanWin(opportunity({ stage: 'CLOSED_LOST' })),
        ).rejects.toThrow('Cannot move opportunity from CLOSED_LOST to CLOSED_WON')
    })

    it('reports a concurrent modification as a conflict', async () => {
        const prisma = mockPrisma()
        prisma.crmOpportunity.updateMany.mockResolvedValue({ count: 0 })
        await expect(
            service(prisma).update('opp-1', { name: 'Renamed' }, 'user-1'),
        ).rejects.toBeInstanceOf(ConflictException)
    })

    it('serializes amounts consistently in lists', async () => {
        const prisma = mockPrisma()
        const result = await service(prisma).list({})
        expect(result.data[0].amount).toBe('1500.00')
        expect(result).toEqual(expect.objectContaining({ total: 1, page: 1, pageSize: 20 }))
    })

    it('adds the next-activity badge to every list row with one grouped query', async () => {
        const prisma = mockPrisma()
        prisma.crmOpportunity.findMany.mockResolvedValue([
            opportunity({ id: 'opp-1' }),
            opportunity({ id: 'opp-2' }),
        ])
        const overdue = new Date(Date.now() - 60 * 60 * 1000)
        prisma.crmActivity.groupBy.mockResolvedValue([
            { opportunityId: 'opp-1', _min: { dueAt: overdue } },
        ])

        const result = await service(prisma).list({})

        expect(prisma.crmActivity.groupBy).toHaveBeenCalledTimes(1)
        expect(prisma.crmActivity.groupBy.mock.calls[0][0]).toEqual(
            expect.objectContaining({
                where: { opportunityId: { in: ['opp-1', 'opp-2'] }, doneAt: null },
            }),
        )
        expect(result.data[0]).toEqual(
            expect.objectContaining({ nextActivityStatus: 'OVERDUE', nextActivityDueAt: overdue }),
        )
        expect(result.data[1]).toEqual(
            expect.objectContaining({ nextActivityStatus: 'NONE', nextActivityDueAt: null }),
        )
    })

    it('detail view adds the owner display fields (and skips the lookup when unassigned)', async () => {
        const assigned = mockPrisma({ opportunity: opportunity({ assignedTo: 'user-2' }) })
        assigned.user.findUnique.mockResolvedValue({
            id: 'user-2',
            userName: 'jdoe',
            firstName: 'Jane',
            lastName: 'Doe',
        })
        const detail = await service(assigned).findOne('opp-1')
        expect(detail.owner).toEqual({ id: 'user-2', userName: 'jdoe', firstName: 'Jane', lastName: 'Doe' })
        expect(detail).toEqual(expect.objectContaining({ amount: '1500.00', nextActivityStatus: 'NONE' }))
        expect(assigned.user.findUnique.mock.calls[0][0]).toEqual(
            expect.objectContaining({ where: { id: 'user-2' } }),
        )

        const unassigned = mockPrisma({ opportunity: opportunity({ assignedTo: null }) })
        expect((await service(unassigned).findOne('opp-1')).owner).toBeNull()
        expect(unassigned.user.findUnique).not.toHaveBeenCalled()
    })

    it('applies the dashboard deep-link filters (overdue, lost reason, closed since)', async () => {
        const prisma = mockPrisma()
        const closedFrom = new Date('2026-07-01T00:00:00Z')
        await service(prisma).list({
            stage: 'CLOSED_LOST',
            lostReason: 'PRICE',
            closedFrom,
            activity: 'OVERDUE',
        })
        const where = prisma.crmOpportunity.findMany.mock.calls[0][0].where
        expect(where).toEqual(
            expect.objectContaining({
                stage: 'CLOSED_LOST',
                lostReason: 'PRICE',
                closedAt: { gte: closedFrom },
            }),
        )
        // Overdue is ANDed so it cannot override an explicit stage filter.
        expect(where.AND).toEqual([
            {
                stage: { in: ['PROSPECTING', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION'] },
                activities: { some: { doneAt: null, dueAt: { lt: expect.any(Date) } } },
            },
        ])
        expect(prisma.crmOpportunity.count.mock.calls[0][0].where).toBe(where)
    })
})

describe('opportunity stage rules', () => {
    it.each([
        ['PROSPECTING', 'NEGOTIATION', true],
        ['NEGOTIATION', 'QUALIFICATION', true],
        ['PROPOSAL', 'CLOSED_WON', true],
        ['QUALIFICATION', 'CLOSED_LOST', true],
        ['CLOSED_LOST', 'PROSPECTING', true],
        ['CLOSED_LOST', 'CLOSED_WON', false],
        ['CLOSED_WON', 'NEGOTIATION', true],
        ['CLOSED_WON', 'CLOSED_LOST', false],
    ] as const)('%s -> %s allowed=%s', (from, to, allowed) => {
        expect(canMoveStage(from, to)).toBe(allowed)
    })

    it.each([
        ['PROSPECTING', 'PROPOSAL', true],
        ['NEGOTIATION', 'CLOSED_WON', true],
        ['CLOSED_LOST', 'QUALIFICATION', true],
        ['NEGOTIATION', 'PROPOSAL', false],
        ['CLOSED_WON', 'NEGOTIATION', false],
        ['PROPOSAL', 'CLOSED_LOST', false],
        ['PROPOSAL', 'PROPOSAL', false],
    ])('%s -> %s is forward=%s', (from, to, forward) => {
        expect(isForwardMove(from, to)).toBe(forward)
    })

    it('lists every unmet requirement of a stage', () => {
        expect(
            unmetStageRequirements('CLOSED_WON', {
                amount: null,
                expectedCloseDate: null,
                customerStatus: 'BLOCKED',
            }),
        ).toEqual(['an amount', 'an active SD customer'])
        expect(
            unmetStageRequirements('PROPOSAL', { amount: 1, expectedCloseDate: null, customerStatus: null }),
        ).toEqual(['an expected close date'])
        expect(
            unmetStageRequirements('PROSPECTING', { amount: null, expectedCloseDate: null, customerStatus: null }),
        ).toEqual([])
    })

    it('serializes null amounts as null', () => {
        expect(serializeOpportunity({ amount: null }).amount).toBeNull()
    })
})

describe('Phase 2 pipeline quality', () => {
    it('blocks a forward move until the target stage requirements are met', async () => {
        const prisma = mockPrisma({
            opportunity: opportunity({ stage: 'QUALIFICATION', amount: null, expectedCloseDate: null }),
        })
        await expect(
            service(prisma).update('opp-1', { stage: 'PROPOSAL' }, 'user-1'),
        ).rejects.toThrow('Moving to Proposal requires an amount and an expected close date')
        expect(prisma.crmOpportunity.updateMany).not.toHaveBeenCalled()
    })

    it('accepts the forward move when the same request supplies the requirements', async () => {
        const prisma = mockPrisma({
            opportunity: opportunity({ stage: 'QUALIFICATION', amount: null, expectedCloseDate: null }),
        })
        await service(prisma).update(
            'opp-1',
            { stage: 'PROPOSAL', amount: 500, expectedCloseDate: new Date('2026-11-30') },
            'user-1',
        )
        expect(updateData(prisma)).toEqual(
            expect.objectContaining({ stage: 'PROPOSAL', probability: 50 }),
        )
    })

    it('keeps an explicit probability instead of the stage default', async () => {
        const prisma = mockPrisma({ opportunity: opportunity({ stage: 'PROPOSAL' }) })
        await service(prisma).update('opp-1', { stage: 'NEGOTIATION', probability: 90 }, 'user-1')
        expect(updateData(prisma).probability).toBe(90)
    })

    it('refuses to win for a BLOCKED or missing SD customer', async () => {
        await expect(
            service(mockPrisma({ customerStatus: 'BLOCKED' })).assertCanWin(opportunity()),
        ).rejects.toThrow('Moving to Closed Won requires an active SD customer')
        await expect(
            service(mockPrisma({ customer: false })).assertCanWin(opportunity()),
        ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('rejects clearing a required field while staying in a gated stage', async () => {
        const prisma = mockPrisma({ opportunity: opportunity({ stage: 'PROPOSAL' }) })
        await expect(
            service(prisma).update('opp-1', { amount: null }, 'user-1'),
        ).rejects.toThrow('Proposal stage requires an amount')
    })

    it('does not gate unrelated edits on legacy rows', async () => {
        const prisma = mockPrisma({
            opportunity: opportunity({ stage: 'PROPOSAL', amount: null, expectedCloseDate: null }),
        })
        await service(prisma).update('opp-1', { name: 'Renamed' }, 'user-1')
        expect(updateData(prisma)).toEqual({ updatedBy: 'user-1', name: 'Renamed' })
    })

    it('moves backward without gates and without clearing amount, dates or customer', async () => {
        const prisma = mockPrisma({
            opportunity: opportunity({ stage: 'NEGOTIATION', amount: null, expectedCloseDate: null }),
        })
        await service(prisma).update('opp-1', { stage: 'PROSPECTING' }, 'user-1')
        const data = updateData(prisma)
        expect(data).toEqual(
            expect.objectContaining({ stage: 'PROSPECTING', probability: 10, closedAt: null }),
        )
        for (const field of ['amount', 'expectedCloseDate', 'customerId', 'leadId', 'sdSalesOrderId']) {
            expect(data).not.toHaveProperty(field)
        }
    })

    it('requires a lost reason to close as lost', async () => {
        const prisma = mockPrisma()
        await expect(
            service(prisma).update('opp-1', { stage: 'CLOSED_LOST' }, 'user-1'),
        ).rejects.toThrow('A lost reason is required to close an opportunity as lost')
    })

    it('requires notes for the OTHER lost reason', async () => {
        const prisma = mockPrisma()
        await expect(
            service(prisma).update('opp-1', { stage: 'CLOSED_LOST', lostReason: 'OTHER' }, 'user-1'),
        ).rejects.toThrow('Lost notes are required when the reason is OTHER')
        await service(prisma).update(
            'opp-1',
            { stage: 'CLOSED_LOST', lostReason: 'OTHER', lostNotes: 'Project shelved' },
            'user-1',
        )
        expect(updateData(prisma)).toEqual(
            expect.objectContaining({ lostReason: 'OTHER', lostNotes: 'Project shelved' }),
        )
    })

    it('rejects a lost reason on an opportunity that is not lost', async () => {
        const prisma = mockPrisma()
        await expect(
            service(prisma).update('opp-1', { lostReason: 'PRICE' }, 'user-1'),
        ).rejects.toThrow('Lost reason and notes are only accepted on lost opportunities')
    })

    it('does not let a lost opportunity clear its reason', async () => {
        const prisma = mockPrisma({
            opportunity: opportunity({ stage: 'CLOSED_LOST', lostReason: 'PRICE' }),
        })
        await expect(
            service(prisma).update('opp-1', { lostReason: null }, 'user-1'),
        ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('leaving lost clears only the lost reason and notes', async () => {
        const prisma = mockPrisma({
            opportunity: opportunity({
                stage: 'CLOSED_LOST',
                closedAt: new Date(),
                lostReason: 'TIMING',
                lostNotes: 'Next fiscal year',
            }),
        })
        await service(prisma).update('opp-1', { stage: 'QUALIFICATION' }, 'user-1')
        const data = updateData(prisma)
        expect(data).toEqual(
            expect.objectContaining({ lostReason: null, lostNotes: null, closedAt: null }),
        )
        for (const field of ['amount', 'expectedCloseDate', 'customerId']) {
            expect(data).not.toHaveProperty(field)
        }
    })

    it('reopens Closed Won without touching the SD sales order link', async () => {
        const prisma = mockPrisma({
            opportunity: opportunity({
                stage: 'CLOSED_WON',
                closedAt: new Date(),
                sdSalesOrderId: 'so-1',
            }),
        })
        await service(prisma).update('opp-1', { stage: 'NEGOTIATION' }, 'user-1')
        const data = updateData(prisma)
        expect(data).toEqual(
            expect.objectContaining({ stage: 'NEGOTIATION', closedAt: null, probability: 75 }),
        )
        expect(data).not.toHaveProperty('sdSalesOrderId')
        expect(prisma.crmOpportunity.updateMany.mock.calls[0][0].where).toEqual(
            expect.objectContaining({ stage: 'CLOSED_WON' }),
        )
    })

    it('ignores a client-supplied sdSalesOrderId (not part of the update contract)', async () => {
        const prisma = mockPrisma({
            opportunity: opportunity({ stage: 'CLOSED_WON', sdSalesOrderId: 'so-1' }),
        })
        const dto = { stage: 'PROPOSAL', sdSalesOrderId: null } as unknown as UpdateOpportunityDto
        await service(prisma).update('opp-1', dto, 'user-1')
        expect(updateData(prisma)).not.toHaveProperty('sdSalesOrderId')
    })

    it('locks the customer once an SD sales order is linked', async () => {
        const prisma = mockPrisma({
            opportunity: opportunity({ stage: 'NEGOTIATION', sdSalesOrderId: 'so-1' }),
        })
        await expect(
            service(prisma).update('opp-1', { customerId: 'cust-2' }, 'user-1'),
        ).rejects.toThrow(/customer cannot change/)
        expect(prisma.crmOpportunity.updateMany).not.toHaveBeenCalled()
    })

    it('Closed Won cannot move straight to lost', async () => {
        const prisma = mockPrisma({ opportunity: opportunity({ stage: 'CLOSED_WON' }) })
        await expect(
            service(prisma).update('opp-1', { stage: 'CLOSED_LOST', lostReason: 'PRICE' }, 'user-1'),
        ).rejects.toBeInstanceOf(ConflictException)
    })

    it('creates with the stage default probability and gates the starting stage', async () => {
        const prisma = mockPrisma()
        await service(prisma).create({ customerId: 'cust-1', name: 'Deal' }, 'user-1')
        expect(prisma.crmOpportunity.create.mock.calls[0][0].data.probability).toBe(10)
        await expect(
            service(prisma).create({ customerId: 'cust-1', name: 'Deal', stage: 'NEGOTIATION' }, 'user-1'),
        ).rejects.toThrow('Moving to Negotiation requires an amount and an expected close date')
    })

    it('summarizes the weighted pipeline per stage and currency in one query', async () => {
        const prisma = mockPrisma()
        prisma.$queryRaw.mockResolvedValue([
            { stage: 'PROPOSAL', currency: 'PHP', count: 2, amount: new Decimal('1000'), weighted: new Decimal('500') },
            { stage: 'NEGOTIATION', currency: 'PHP', count: 1, amount: new Decimal('400'), weighted: new Decimal('300') },
            { stage: 'NEGOTIATION', currency: 'USD', count: 1, amount: new Decimal('100'), weighted: new Decimal('75') },
        ])
        const result = await service(prisma).pipeline({})
        expect(prisma.$queryRaw).toHaveBeenCalledTimes(1)
        expect(result.stages.map((s) => s.stage)).toEqual([
            'PROSPECTING',
            'QUALIFICATION',
            'PROPOSAL',
            'NEGOTIATION',
        ])
        expect(result.stages[3]).toEqual(
            expect.objectContaining({ stage: 'NEGOTIATION', count: 2 }),
        )
        expect(result.totals).toEqual([
            { currency: 'PHP', count: 3, amount: '1400.00', weightedAmount: '800.00' },
            { currency: 'USD', count: 1, amount: '100.00', weightedAmount: '75.00' },
        ])
    })

    describe('with SD quotations', () => {
        const activeQuote = { id: 'q-1', quotationNumber: 'Q-000042', revision: 1, status: 'SENT' }

        it('cancels the active quotation in the Closed Lost transaction, under the opportunity lock', async () => {
            const prisma = mockPrisma()
            const quotations = mockQuotations()
            const order: string[] = []
            prisma.$queryRaw.mockImplementation(() => (order.push('lock'), Promise.resolve([{ id: 'opp-1' }])))
            prisma.crmOpportunity.updateMany.mockImplementation(() => (order.push('update'), Promise.resolve({ count: 1 })))
            quotations.cancelActiveForOpportunity.mockImplementation(() => (order.push('cancel'), Promise.resolve(1)))

            await service(prisma, quotations).update('opp-1', { stage: 'CLOSED_LOST', lostReason: 'PRICE' }, 'user-1')

            expect(order).toEqual(['lock', 'update', 'cancel'])
            expect(quotations.cancelActiveForOpportunity).toHaveBeenCalledWith(prisma, 'opp-1', {
                cancelledBy: 'user-1',
                reason: 'Opportunity closed as lost (PRICE)',
            })
        })

        it('cancels nothing when the Closed Lost write loses a race', async () => {
            const prisma = mockPrisma()
            const quotations = mockQuotations()
            prisma.crmOpportunity.updateMany.mockResolvedValue({ count: 0 })

            await expect(
                service(prisma, quotations).update('opp-1', { stage: 'CLOSED_LOST', lostReason: 'PRICE' }, 'user-1'),
            ).rejects.toThrow(/changed concurrently/)
            expect(quotations.cancelActiveForOpportunity).not.toHaveBeenCalled()
        })

        it('refuses a customer change while a quotation is active', async () => {
            const prisma = mockPrisma()
            const quotations = mockQuotations()
            quotations.findActiveForOpportunity.mockResolvedValue(activeQuote)

            await expect(
                service(prisma, quotations).update('opp-1', { customerId: 'cust-2' }, 'user-1'),
            ).rejects.toMatchObject({
                response: {
                    code: 'QUOTATION_ACTIVE',
                    quotationId: 'q-1',
                    message: 'Quotation Q-000042 rev 1 is SENT; cancel it before changing the customer',
                },
            })
            expect(quotations.expireOverdue).toHaveBeenCalledWith(prisma, 'opp-1')
            expect(prisma.crmOpportunity.updateMany).not.toHaveBeenCalled()
        })

        it('changes the customer when no quotation is active', async () => {
            const prisma = mockPrisma()
            const quotations = mockQuotations()

            await service(prisma, quotations).update('opp-1', { customerId: 'cust-2' }, 'user-1')

            expect(quotations.findActiveForOpportunity).toHaveBeenCalledWith(prisma, 'opp-1')
            expect(updateData(prisma)).toMatchObject({ customerId: 'cust-2' })
        })

        it('leaves quotations alone for other edits and does not lock', async () => {
            const prisma = mockPrisma()
            const quotations = mockQuotations()

            await service(prisma, quotations).update('opp-1', { name: 'Renamed', stage: 'PROPOSAL' }, 'user-1')

            expect(prisma.$transaction).not.toHaveBeenCalled()
            expect(quotations.findActiveForOpportunity).not.toHaveBeenCalled()
            expect(quotations.cancelActiveForOpportunity).not.toHaveBeenCalled()
        })
    })

    it('exposes stage metadata and lost reasons', () => {
        const meta = service(mockPrisma()).stages()
        expect(meta.stages.find((s) => s.stage === 'PROPOSAL')).toEqual(
            expect.objectContaining({ requiresAmount: true, requiresExpectedClose: true, defaultProbability: 50 }),
        )
        expect(meta.lostReasons).toContain('OTHER')
        expect(meta.lostReasonsRequiringNotes).toEqual(['OTHER'])
    })
})

describe('CrmOpportunitiesController RBAC metadata', () => {
    it.each([
        ['list', 'read'],
        ['stages', 'read'],
        ['pipeline', 'read'],
        ['findOne', 'read'],
        ['create', 'create'],
        ['update', 'update'],
    ])('%s requires crm:%s', (handler, action) => {
        const fn = CrmOpportunitiesController.prototype[handler as keyof CrmOpportunitiesController]
        expect(Reflect.getMetadata(PERMISSION_KEY, fn)).toEqual({ module: 'crm', action })
    })
})
