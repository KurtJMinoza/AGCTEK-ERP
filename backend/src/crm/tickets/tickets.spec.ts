import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common'
import { PERMISSION_KEY } from '../../permissions/permission.guard'
import type { PrismaService } from '../../prisma/prisma.service'
import { CrmActivitiesService } from '../activities/activities.service'
import { CrmTicketsController } from './tickets.controller'
import { CrmTicketsService, TICKET_TRANSITIONS } from './tickets.service'

const updatedAt = new Date('2026-10-01T00:00:00Z')

function ticket(overrides: Record<string, unknown> = {}) {
    return {
        id: 'tkt-1',
        customerId: 'cust-1',
        subject: 'Late delivery',
        status: 'OPEN',
        priority: 'MEDIUM',
        category: 'DELIVERY',
        rmaReference: null,
        updatedAt,
        customer: { id: 'cust-1' },
        _count: { comments: 0 },
        ...overrides,
    }
}

function mockPrisma(opts: { ticket?: ReturnType<typeof ticket> | null; customer?: boolean } = {}) {
    return {
        sdCustomer: {
            findUnique: jest.fn().mockResolvedValue(opts.customer === false ? null : { id: 'cust-1' }),
        },
        user: {
            findUnique: jest.fn().mockResolvedValue({ id: 'user-2' }),
            findMany: jest.fn().mockResolvedValue([
                { id: 'user-1', userName: 'agent', firstName: 'Ann', lastName: 'Agent' },
            ]),
        },
        crmTicket: {
            findUnique: jest.fn().mockResolvedValue(opts.ticket === undefined ? ticket() : opts.ticket),
            create: jest.fn((args: { data: Record<string, unknown> }) =>
                Promise.resolve({ ...ticket(), ...args.data }),
            ),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findMany: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(0),
            groupBy: jest.fn().mockResolvedValue([]),
        },
        crmActivity: {
            groupBy: jest.fn().mockResolvedValue([]),
        },
        crmTicketComment: {
            findMany: jest.fn().mockResolvedValue([
                { id: 'c-1', ticketId: 'tkt-1', body: 'Hi', authorId: 'user-1' },
                { id: 'c-2', ticketId: 'tkt-1', body: 'System note', authorId: null },
            ]),
            create: jest.fn((args: { data: Record<string, unknown> }) =>
                Promise.resolve({ id: 'c-new', ...args.data }),
            ),
        },
        $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    }
}

const service = (prisma: ReturnType<typeof mockPrisma>) => {
    const p = prisma as unknown as PrismaService
    return new CrmTicketsService(p, new CrmActivitiesService(p))
}

const groups = (counts: Record<string, number>) =>
    Object.entries(counts).map(([priority, n]) => ({ priority, _count: { _all: n } }))

describe('CrmTicketsService.list queue', () => {
    it('defaults to OPEN + WAITING_CUSTOMER sorted URGENT → LOW, oldest first', async () => {
        const prisma = mockPrisma()
        prisma.crmTicket.groupBy.mockResolvedValue(groups({ LOW: 1, URGENT: 1, MEDIUM: 2 }))
        prisma.crmTicket.findMany.mockImplementation((args: { where: { priority: string } }) =>
            Promise.resolve(
                args.where.priority === 'MEDIUM'
                    ? [ticket({ id: 'm1' }), ticket({ id: 'm2' })]
                    : [ticket({ id: args.where.priority.toLowerCase(), priority: args.where.priority })],
            ),
        )

        const result = await service(prisma).list({})

        const where = prisma.crmTicket.groupBy.mock.calls[0][0].where
        expect(where.status).toEqual({ in: ['OPEN', 'WAITING_CUSTOMER'] })
        expect(result.data.map((t) => t.id)).toEqual(['urgent', 'm1', 'm2', 'low'])
        expect(result.total).toBe(4)
        expect(prisma.crmTicket.findMany.mock.calls[0][0]).toEqual(
            expect.objectContaining({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: 0 }),
        )
        expect(result.data[0]).toEqual(expect.objectContaining({ nextActivityStatus: 'NONE' }))
    })

    it('pages across priority buckets without reading skipped ones', async () => {
        const prisma = mockPrisma()
        prisma.crmTicket.groupBy.mockResolvedValue(groups({ URGENT: 3, HIGH: 4, LOW: 5 }))
        prisma.crmTicket.findMany.mockResolvedValue([])

        await service(prisma).list({ page: 2, pageSize: 5 })

        const calls = prisma.crmTicket.findMany.mock.calls.map((c) => c[0])
        expect(calls[0]).toEqual(
            expect.objectContaining({ where: expect.objectContaining({ priority: 'HIGH' }), skip: 2, take: 5 }),
        )
        expect(calls.some((c) => c.where.priority === 'URGENT')).toBe(false)
    })

    it('an explicit status overrides the queue; queue=ALL drops the status filter', async () => {
        const prisma = mockPrisma()
        await service(prisma).list({ status: 'RESOLVED' })
        await service(prisma).list({ queue: 'ALL' })
        expect(prisma.crmTicket.groupBy.mock.calls[0][0].where.status).toBe('RESOLVED')
        expect(prisma.crmTicket.groupBy.mock.calls[1][0].where).not.toHaveProperty('status')
    })

    it('sort=newest keeps created-desc paging', async () => {
        const prisma = mockPrisma()
        await service(prisma).list({ sort: 'newest', queue: 'ALL' })
        expect(prisma.crmTicket.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ orderBy: { createdAt: 'desc' }, skip: 0, take: 20 }),
        )
        expect(prisma.crmTicket.groupBy).not.toHaveBeenCalled()
    })

    it('activity=OVERDUE keeps non-terminal tickets with a past-due open activity', async () => {
        const prisma = mockPrisma()
        await service(prisma).list({ queue: 'ALL', activity: 'OVERDUE' })
        const where = prisma.crmTicket.groupBy.mock.calls[0][0].where
        expect(where).not.toHaveProperty('status')
        expect(where.AND).toEqual([
            {
                status: { notIn: ['CLOSED', 'CANCELLED'] },
                activities: { some: { doneAt: null, dueAt: { lt: expect.any(Date) } } },
            },
        ])
    })
})

describe('CrmTicketsService', () => {
    it('requires an existing SdCustomer and never creates one', async () => {
        const prisma = mockPrisma({ customer: false })
        await expect(
            service(prisma).create({ customerId: 'missing', subject: 'X' }, 'user-1'),
        ).rejects.toBeInstanceOf(NotFoundException)
        expect(prisma.crmTicket.create).not.toHaveBeenCalled()
    })

    it('creates with defaults and stores rmaReference as a plain field', async () => {
        const prisma = mockPrisma()
        await service(prisma).create(
            { customerId: 'cust-1', subject: 'Broken unit', rmaReference: 'RMA-42' },
            'user-1',
        )
        expect(prisma.crmTicket.create.mock.calls[0][0].data).toEqual(
            expect.objectContaining({
                priority: 'MEDIUM',
                category: 'GENERAL',
                rmaReference: 'RMA-42',
                createdBy: 'user-1',
            }),
        )
    })

    it('allows OPEN -> RESOLVED -> CLOSED and blocks OPEN -> CLOSED', async () => {
        expect(TICKET_TRANSITIONS.OPEN).toContain('RESOLVED')
        expect(TICKET_TRANSITIONS.RESOLVED).toContain('CLOSED')

        const prisma = mockPrisma()
        await expect(
            service(prisma).update('tkt-1', { status: 'CLOSED' }, 'user-1'),
        ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('reopens a resolved ticket', async () => {
        const prisma = mockPrisma({ ticket: ticket({ status: 'RESOLVED' }) })
        await service(prisma).update('tkt-1', { status: 'IN_PROGRESS' }, 'user-1')
        expect(prisma.crmTicket.updateMany).toHaveBeenCalledWith({
            where: { id: 'tkt-1', status: 'RESOLVED', updatedAt },
            data: { updatedBy: 'user-1', status: 'IN_PROGRESS' },
        })
    })

    it.each(['CLOSED', 'CANCELLED'])('treats %s tickets as read-only', async (status) => {
        const prisma = mockPrisma({ ticket: ticket({ status }) })
        await expect(
            service(prisma).update('tkt-1', { subject: 'Renamed' }, 'user-1'),
        ).rejects.toBeInstanceOf(ConflictException)
    })

    it('reports a concurrent modification as a conflict', async () => {
        const prisma = mockPrisma()
        prisma.crmTicket.updateMany.mockResolvedValue({ count: 0 })
        await expect(
            service(prisma).update('tkt-1', { priority: 'HIGH' }, 'user-1'),
        ).rejects.toBeInstanceOf(ConflictException)
    })

    it('lists comments oldest first with author summaries', async () => {
        const prisma = mockPrisma()
        const comments = await service(prisma).listComments('tkt-1')
        expect(prisma.crmTicketComment.findMany).toHaveBeenCalledWith({
            where: { ticketId: 'tkt-1' },
            orderBy: { createdAt: 'asc' },
        })
        expect(prisma.user.findMany).toHaveBeenCalledTimes(1)
        expect(comments[0].author).toEqual(expect.objectContaining({ userName: 'agent' }))
        expect(comments[1].author).toBeNull()
    })

    it('returns 404 for comments on a missing ticket', async () => {
        const prisma = mockPrisma({ ticket: null })
        await expect(service(prisma).listComments('nope')).rejects.toBeInstanceOf(NotFoundException)
    })

    it('adds a comment authored by the acting user', async () => {
        const prisma = mockPrisma()
        const comment = await service(prisma).addComment('tkt-1', { body: 'On it' }, 'user-1')
        expect(prisma.crmTicketComment.create).toHaveBeenCalledWith({
            data: { ticketId: 'tkt-1', body: 'On it', authorId: 'user-1' },
        })
        expect(comment.author).toEqual(expect.objectContaining({ id: 'user-1' }))
    })

    it('blocks comments on closed tickets', async () => {
        const prisma = mockPrisma({ ticket: ticket({ status: 'CLOSED' }) })
        await expect(
            service(prisma).addComment('tkt-1', { body: 'late' }, 'user-1'),
        ).rejects.toBeInstanceOf(ConflictException)
    })
})

describe('CrmTicketsController RBAC metadata', () => {
    it.each([
        ['list', 'read'],
        ['findOne', 'read'],
        ['create', 'create'],
        ['update', 'update'],
        ['listComments', 'read'],
        ['addComment', 'create'],
    ])('%s requires crm:%s', (handler, action) => {
        const fn = CrmTicketsController.prototype[handler as keyof CrmTicketsController]
        expect(Reflect.getMetadata(PERMISSION_KEY, fn)).toEqual({ module: 'crm', action })
    })
})
