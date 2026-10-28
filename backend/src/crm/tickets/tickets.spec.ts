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
import type { ReturnRequestService } from '../../sd/return-request.service'
import { returnSettlement } from './return-settlement'

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

const sdReturn = (overrides: Record<string, unknown> = {}) => ({
    status: 'RESTOCKED',
    preferredResolution: 'REFUND',
    refundStatus: 'PAID',
    ...overrides,
})

const service = (
    prisma: ReturnType<typeof mockPrisma>,
    returnRequests = { findForCase: jest.fn().mockResolvedValue(sdReturn()) },
) => {
    const p = prisma as unknown as PrismaService
    return new CrmTicketsService(
        p,
        new CrmActivitiesService(p),
        returnRequests as unknown as ReturnRequestService,
    )
}

const returnTicket = (overrides: Record<string, unknown> = {}) =>
    ticket({
        category: 'RETURN',
        sdReturnRequestId: 'rr-1',
        returnRequestNumber: 'RET-0001',
        ...overrides,
    })

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

    it('link=RETURN keeps return cases; search also matches the return number', async () => {
        const prisma = mockPrisma()
        await service(prisma).list({ link: 'RETURN', search: 'RET-2026' })
        const where = prisma.crmTicket.groupBy.mock.calls[0][0].where
        expect(where.sdReturnRequestId).toEqual({ not: null })
        expect(where.OR).toContainEqual({ returnRequestNumber: { contains: 'RET-2026', mode: 'insensitive' } })
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

describe('returnSettlement (RMA close gate)', () => {
    it.each([
        [{ status: 'REQUESTED' }, 'the return is still waiting for a decision'],
        [{ status: 'AWAITING_RETURN' }, 'the returned goods have not been received yet'],
        [{ status: 'UNDER_INSPECTION' }, 'the returned goods are still being inspected'],
        [{ status: 'RESTOCKED', refundStatus: 'NONE' }, 'the refund has not been recorded in SD yet'],
        [{ status: 'RESTOCKED', refundStatus: 'APPROVED' }, 'the refund is approved and waiting for payment by finance'],
        [{ status: 'SCRAPPED', refundStatus: 'FAILED' }, 'the refund payment failed and needs finance follow-up'],
    ])('blocks %o', (overrides, blocker) => {
        expect(returnSettlement(sdReturn(overrides))).toEqual({ settled: false, blocker })
    })

    it.each([
        sdReturn({ status: 'REJECTED', refundStatus: 'NONE' }),
        sdReturn({ status: 'CLOSED' }),
        sdReturn({ status: 'REFUNDED', refundStatus: 'PAID' }),
        sdReturn({ status: 'MARKED_DAMAGED', refundStatus: 'NOT_REQUIRED' }),
        sdReturn({ status: 'RESTOCKED', preferredResolution: 'REPLACEMENT', refundStatus: 'NONE' }),
    ])('settles %o', (request) => {
        expect(returnSettlement(request)).toEqual({ settled: true, blocker: null })
    })
})

describe('CrmTicketsService return case gate', () => {
    it.each(['RESOLVED', 'CANCELLED'] as const)(
        'refuses %s while the linked return is not settled',
        async (status) => {
            const prisma = mockPrisma({ ticket: returnTicket() })
            const returnRequests = {
                findForCase: jest.fn().mockResolvedValue(sdReturn({ status: 'AWAITING_RETURN' })),
            }
            await expect(
                service(prisma, returnRequests).update('tkt-1', { status }, 'user-1'),
            ).rejects.toThrow(/RET-0001 is not settled: the returned goods have not been received yet/)
            expect(returnRequests.findForCase).toHaveBeenCalledWith('rr-1')
            expect(prisma.crmTicket.updateMany).not.toHaveBeenCalled()
        },
    )

    it('re-checks the return when closing a resolved case', async () => {
        const prisma = mockPrisma({ ticket: returnTicket({ status: 'RESOLVED' }) })
        const returnRequests = {
            findForCase: jest.fn().mockResolvedValue(sdReturn({ refundStatus: 'APPROVED' })),
        }
        await expect(
            service(prisma, returnRequests).update('tkt-1', { status: 'CLOSED' }, 'user-1'),
        ).rejects.toBeInstanceOf(ConflictException)
    })

    it('resolves once the return is settled; other status moves never read SD', async () => {
        const prisma = mockPrisma({ ticket: returnTicket() })
        const returnRequests = { findForCase: jest.fn().mockResolvedValue(sdReturn()) }
        await service(prisma, returnRequests).update('tkt-1', { status: 'RESOLVED' }, 'user-1')
        expect(prisma.crmTicket.updateMany).toHaveBeenCalledTimes(1)

        returnRequests.findForCase.mockClear()
        await service(prisma, returnRequests).update('tkt-1', { status: 'IN_PROGRESS' }, 'user-1')
        expect(returnRequests.findForCase).not.toHaveBeenCalled()
    })

    it('never gates tickets without a linked return', async () => {
        const prisma = mockPrisma()
        const returnRequests = { findForCase: jest.fn() }
        await service(prisma, returnRequests).update('tkt-1', { status: 'RESOLVED' }, 'user-1')
        expect(returnRequests.findForCase).not.toHaveBeenCalled()
    })

    it('override ends an unsettled case and records reason + open step on the case', async () => {
        const prisma = mockPrisma({ ticket: returnTicket() })
        prisma.$transaction.mockImplementation(((fn: (tx: unknown) => unknown) => fn(prisma)) as never)
        const returnRequests = {
            findForCase: jest.fn().mockResolvedValue(sdReturn({ refundStatus: 'APPROVED' })),
        }

        await service(prisma, returnRequests).overrideStatus(
            'tkt-1',
            { status: 'RESOLVED', reason: 'Customer accepted store voucher' },
            'lead-1',
        )

        expect(prisma.crmTicket.updateMany).toHaveBeenCalledWith({
            where: { id: 'tkt-1', status: 'OPEN', updatedAt },
            data: { status: 'RESOLVED', updatedBy: 'lead-1' },
        })
        expect(prisma.crmTicketComment.create).toHaveBeenCalledWith({
            data: {
                ticketId: 'tkt-1',
                authorId: 'lead-1',
                body:
                    'Status override OPEN → RESOLVED. Return RET-0001 was not settled: ' +
                    'the refund is approved and waiting for payment by finance. Reason: Customer accepted store voucher',
            },
        })
    })

    it('override is refused when not needed, invalid, or not a return case', async () => {
        const settled = mockPrisma({ ticket: returnTicket() })
        await expect(
            service(settled).overrideStatus('tkt-1', { status: 'RESOLVED', reason: 'x' }, 'u'),
        ).rejects.toThrow(/is settled; change the status normally/)

        const open = mockPrisma({ ticket: returnTicket() })
        await expect(
            service(open).overrideStatus('tkt-1', { status: 'CLOSED', reason: 'x' }, 'u'),
        ).rejects.toThrow(/Cannot move ticket from OPEN to CLOSED/)

        const plain = mockPrisma()
        await expect(
            service(plain).overrideStatus('tkt-1', { status: 'RESOLVED', reason: 'x' }, 'u'),
        ).rejects.toThrow(/only to return cases/)
        expect(plain.crmTicket.updateMany).not.toHaveBeenCalled()
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
    ])('%s requires crm.tickets:%s', (handler, action) => {
        const fn = CrmTicketsController.prototype[handler as keyof CrmTicketsController]
        expect(Reflect.getMetadata(PERMISSION_KEY, fn)).toEqual({ resource: 'crm.tickets', action })
    })

    it('status override requires crm.ticket-overrides:update', () => {
        const fn = CrmTicketsController.prototype.overrideStatus
        expect(Reflect.getMetadata(PERMISSION_KEY, fn)).toEqual({
            resource: 'crm.ticket-overrides',
            action: 'update',
        })
    })
})
