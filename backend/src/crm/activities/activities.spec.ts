import { ConflictException, NotFoundException } from '@nestjs/common'
import { PERMISSION_KEY } from '../../permissions/permission.guard'
import type { PrismaService } from '../../prisma/prisma.service'
import { CrmActivitiesController, CrmTicketActivitiesController } from './activities.controller'
import { CrmActivitiesService } from './activities.service'
import { activityDueStatus, classifyDueAt, summarizeNextActivity } from './activity-status'

// 2026-10-06 10:00 in Asia/Manila (UTC+8)
const NOW = new Date('2026-10-06T02:00:00Z')
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 60 * 60 * 1000)

describe('next-activity badge', () => {
    it('classifies a past due instant as overdue, even earlier today', () => {
        expect(classifyDueAt(hoursFromNow(-1), NOW)).toBe('OVERDUE')
        expect(classifyDueAt(hoursFromNow(-48), NOW)).toBe('OVERDUE')
    })

    it('classifies later today as due today and later days as upcoming', () => {
        expect(classifyDueAt(hoursFromNow(5), NOW)).toBe('DUE_TODAY')
        expect(classifyDueAt(hoursFromNow(24), NOW)).toBe('UPCOMING')
    })

    it('judges "today" on the Manila business day, not UTC', () => {
        const lateEvening = new Date('2026-10-06T15:30:00Z') // 23:30 Manila
        expect(classifyDueAt(new Date('2026-10-06T15:45:00Z'), lateEvening)).toBe('DUE_TODAY')
        // Same UTC date, but already tomorrow (00:30) in Manila.
        expect(classifyDueAt(new Date('2026-10-06T16:30:00Z'), lateEvening)).toBe('UPCOMING')
    })

    it.each([
        ['overdue beats due today and upcoming', [hoursFromNow(24), hoursFromNow(3), hoursFromNow(-2)], 'OVERDUE', -2],
        ['due today beats upcoming', [hoursFromNow(72), hoursFromNow(4)], 'DUE_TODAY', 4],
        ['upcoming when nothing is due today', [hoursFromNow(48), hoursFromNow(30)], 'UPCOMING', 30],
    ] as const)('%s', (_label, dates, status, dueOffset) => {
        const summary = summarizeNextActivity([...dates], NOW)
        expect(summary.nextActivityStatus).toBe(status)
        expect(summary.nextActivityDueAt).toEqual(hoursFromNow(dueOffset))
    })

    it('is NONE without open activities', () => {
        expect(summarizeNextActivity([], NOW)).toEqual({
            nextActivityStatus: 'NONE',
            nextActivityDueAt: null,
        })
    })

    it('reports completed activities as DONE regardless of due date', () => {
        expect(activityDueStatus({ dueAt: hoursFromNow(-5), doneAt: NOW }, NOW)).toBe('DONE')
        expect(activityDueStatus({ dueAt: hoursFromNow(-5), doneAt: null }, NOW)).toBe('OVERDUE')
    })
})

function activity(overrides: Record<string, unknown> = {}) {
    return {
        id: 'act-1',
        opportunityId: 'opp-1',
        leadId: null,
        ticketId: null,
        type: 'CALL',
        summary: 'Call buyer',
        dueAt: hoursFromNow(2),
        assignedTo: 'user-1',
        doneAt: null,
        createdBy: 'user-1',
        updatedBy: 'user-1',
        createdAt: NOW,
        updatedAt: NOW,
        ...overrides,
    }
}

function mockPrisma(opts: { stage?: string | null } = {}) {
    const prisma = {
        crmOpportunity: {
            findUnique: jest
                .fn()
                .mockResolvedValue(
                    opts.stage === null ? null : { id: 'opp-1', stage: opts.stage ?? 'PROPOSAL' },
                ),
        },
        crmActivity: {
            findMany: jest.fn().mockResolvedValue([activity()]),
            create: jest.fn((args: { data: Record<string, unknown> }) =>
                Promise.resolve(activity({ id: 'act-new', ...args.data })),
            ),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findFirst: jest.fn().mockResolvedValue({ id: 'act-1' }),
            findUniqueOrThrow: jest.fn().mockResolvedValue(activity({ doneAt: NOW })),
            groupBy: jest.fn().mockResolvedValue([]),
        },
        user: {
            findUnique: jest.fn().mockResolvedValue({ id: 'user-2' }),
            findMany: jest.fn().mockResolvedValue([
                { id: 'user-1', userName: 'aci.admin', firstName: 'Aci', lastName: 'Admin' },
            ]),
        },
        $transaction: jest.fn(),
    }
    prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma))
    return prisma
}

const service = (prisma: ReturnType<typeof mockPrisma>) =>
    new CrmActivitiesService(prisma as unknown as PrismaService)

const dto = { type: 'CALL' as const, summary: 'Call buyer', dueAt: hoursFromNow(2) }

describe('CrmActivitiesService', () => {
    it('creates an activity on an open opportunity, assigned to the creator by default', async () => {
        const prisma = mockPrisma()
        const created = await service(prisma).createForOpportunity('opp-1', dto, 'user-1')
        expect(prisma.crmActivity.create.mock.calls[0][0].data).toEqual(
            expect.objectContaining({
                opportunityId: 'opp-1',
                type: 'CALL',
                assignedTo: 'user-1',
                createdBy: 'user-1',
            }),
        )
        expect(created.assignee?.userName).toBe('aci.admin')
        expect(created.dueStatus).toBeDefined()
    })

    it('rejects an unknown assignee', async () => {
        const prisma = mockPrisma()
        prisma.user.findUnique.mockResolvedValue(null)
        await expect(
            service(prisma).createForOpportunity('opp-1', { ...dto, assignedTo: 'ghost' }, 'user-1'),
        ).rejects.toBeInstanceOf(NotFoundException)
        expect(prisma.crmActivity.create).not.toHaveBeenCalled()
    })

    it.each(['CLOSED_WON', 'CLOSED_LOST'])('refuses to schedule on a %s opportunity', async (stage) => {
        const prisma = mockPrisma({ stage })
        await expect(
            service(prisma).createForOpportunity('opp-1', dto, 'user-1'),
        ).rejects.toBeInstanceOf(ConflictException)
    })

    it('404s for a missing opportunity', async () => {
        const prisma = mockPrisma({ stage: null })
        await expect(service(prisma).listForOpportunity('missing')).rejects.toBeInstanceOf(
            NotFoundException,
        )
    })

    it('completes only an open activity of that opportunity', async () => {
        const prisma = mockPrisma()
        const result = await service(prisma).complete('opp-1', 'act-1', {}, 'user-1')
        expect(prisma.crmActivity.updateMany.mock.calls[0][0]).toEqual({
            where: { id: 'act-1', opportunityId: 'opp-1', doneAt: null },
            data: { doneAt: expect.any(Date), updatedBy: 'user-1' },
        })
        expect(result.completed.dueStatus).toBe('DONE')
        expect(result.next).toBeNull()
    })

    it('reports a second completion as a conflict', async () => {
        const prisma = mockPrisma()
        prisma.crmActivity.updateMany.mockResolvedValue({ count: 0 })
        await expect(
            service(prisma).complete('opp-1', 'act-1', {}, 'user-1'),
        ).rejects.toBeInstanceOf(ConflictException)
    })

    it('404s when completing an activity of another opportunity', async () => {
        const prisma = mockPrisma()
        prisma.crmActivity.updateMany.mockResolvedValue({ count: 0 })
        prisma.crmActivity.findFirst.mockResolvedValue(null)
        await expect(
            service(prisma).complete('opp-1', 'act-other', {}, 'user-1'),
        ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('completes and schedules the next activity in one transaction', async () => {
        const prisma = mockPrisma()
        const next = { type: 'MEETING' as const, summary: 'Demo', dueAt: hoursFromNow(26) }
        const result = await service(prisma).complete('opp-1', 'act-1', { next }, 'user-1')
        expect(prisma.$transaction).toHaveBeenCalledTimes(1)
        expect(prisma.crmActivity.create.mock.calls[0][0].data).toEqual(
            expect.objectContaining({ opportunityId: 'opp-1', type: 'MEETING', summary: 'Demo' }),
        )
        expect(result.next?.type).toBe('MEETING')
    })

    it('does not complete anything when the next activity cannot be scheduled', async () => {
        const prisma = mockPrisma({ stage: 'CLOSED_LOST' })
        const next = { type: 'TODO' as const, summary: 'x', dueAt: hoursFromNow(1) }
        await expect(
            service(prisma).complete('opp-1', 'act-1', { next }, 'user-1'),
        ).rejects.toBeInstanceOf(ConflictException)
        expect(prisma.crmActivity.updateMany).not.toHaveBeenCalled()
    })

    it('relinks lead activities to the opportunity, keeping leadId and history', async () => {
        const prisma = mockPrisma()
        prisma.crmActivity.updateMany.mockResolvedValue({ count: 3 })
        const moved = await service(prisma).reparentLeadActivities('lead-1', 'opp-1')
        expect(moved).toBe(3)
        expect(prisma.crmActivity.updateMany).toHaveBeenCalledWith({
            where: { leadId: 'lead-1', opportunityId: null },
            data: { opportunityId: 'opp-1' },
        })
    })

    it('re-parents through a caller-supplied transaction client', async () => {
        const prisma = mockPrisma()
        const tx = { crmActivity: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } }
        await service(prisma).reparentLeadActivities('lead-1', 'opp-1', tx as never)
        expect(tx.crmActivity.updateMany).toHaveBeenCalled()
        expect(prisma.crmActivity.updateMany).not.toHaveBeenCalled()
    })

    it('builds board summaries from one grouped query', async () => {
        const prisma = mockPrisma()
        prisma.crmActivity.groupBy.mockResolvedValue([
            { opportunityId: 'opp-1', _min: { dueAt: hoursFromNow(4) } },
        ])
        const map = await service(prisma).nextActivityByOpportunity(['opp-1', 'opp-2'], NOW)
        expect(prisma.crmActivity.groupBy).toHaveBeenCalledTimes(1)
        expect(map.get('opp-1')).toEqual({
            nextActivityStatus: 'DUE_TODAY',
            nextActivityDueAt: hoursFromNow(4),
        })
        expect(map.has('opp-2')).toBe(false)
    })

    it('skips the query when there are no opportunities', async () => {
        const prisma = mockPrisma()
        await service(prisma).nextActivityByOpportunity([])
        expect(prisma.crmActivity.groupBy).not.toHaveBeenCalled()
    })
})

describe('CrmActivitiesService on tickets', () => {
    const withTicket = (status: string | null) => {
        const prisma = mockPrisma()
        return Object.assign(prisma, {
            crmTicket: {
                findUnique: jest
                    .fn()
                    .mockResolvedValue(status === null ? null : { id: 'tkt-1', status }),
            },
        })
    }

    it('creates on the ticket parent only', async () => {
        const prisma = withTicket('OPEN')
        await service(prisma).createForTicket('tkt-1', dto, 'user-1')
        const data = prisma.crmActivity.create.mock.calls[0][0].data
        expect(data).toEqual(expect.objectContaining({ ticketId: 'tkt-1', type: 'CALL' }))
        expect(data).not.toHaveProperty('opportunityId')
        expect(prisma.crmOpportunity.findUnique).not.toHaveBeenCalled()
    })

    it.each(['WAITING_CUSTOMER', 'RESOLVED'])('allows follow-ups on a %s ticket', async (status) => {
        const prisma = withTicket(status)
        await expect(service(prisma).createForTicket('tkt-1', dto, 'user-1')).resolves.toBeDefined()
    })

    it.each(['CLOSED', 'CANCELLED'])('refuses to schedule on a %s ticket', async (status) => {
        const prisma = withTicket(status)
        await expect(service(prisma).createForTicket('tkt-1', dto, 'user-1')).rejects.toThrow(
            `Cannot schedule activities on a ${status} ticket`,
        )
    })

    it('lists and completes scoped to the ticket; 404 for a missing ticket', async () => {
        const prisma = withTicket('IN_PROGRESS')
        await service(prisma).listForTicket('tkt-1')
        expect(prisma.crmActivity.findMany.mock.calls[0][0].where).toEqual({ ticketId: 'tkt-1' })
        await service(prisma).completeForTicket('tkt-1', 'act-1', {}, 'user-1')
        expect(prisma.crmActivity.updateMany.mock.calls[0][0].where).toEqual({
            id: 'act-1',
            ticketId: 'tkt-1',
            doneAt: null,
        })
        await expect(service(withTicket(null)).listForTicket('nope')).rejects.toBeInstanceOf(
            NotFoundException,
        )
    })

    it('summarizes ticket badges from one grouped query on ticketId', async () => {
        const prisma = withTicket('OPEN')
        prisma.crmActivity.groupBy.mockResolvedValue([
            { ticketId: 'tkt-1', _min: { dueAt: hoursFromNow(-3) } },
        ] as never)
        const rows = await service(prisma).withNextActivityFor('ticket', [{ id: 'tkt-1' }, { id: 'tkt-2' }], NOW)
        expect(prisma.crmActivity.groupBy.mock.calls[0][0]).toEqual(
            expect.objectContaining({ by: ['ticketId'] }),
        )
        expect(rows[0].nextActivityStatus).toBe('OVERDUE')
        expect(rows[1].nextActivityStatus).toBe('NONE')
    })
})

describe('Activities controllers RBAC metadata', () => {
    it.each([
        ['list', 'read'],
        ['create', 'create'],
        ['complete', 'update'],
    ])('%s requires crm.activities:%s on opportunities and tickets', (handler, action) => {
        for (const ctrl of [CrmActivitiesController, CrmTicketActivitiesController]) {
            const fn = ctrl.prototype[handler as 'list' | 'create' | 'complete']
            expect(Reflect.getMetadata(PERMISSION_KEY, fn)).toEqual({ resource: 'crm.activities', action })
        }
    })
})
