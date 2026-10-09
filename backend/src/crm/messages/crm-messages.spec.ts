import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PERMISSION_KEY } from '../../permissions/permission.guard'
import type { PrismaService } from '../../prisma/prisma.service'
import {
    formatSystemLabel,
    NOTE_EDIT_WINDOW_MS,
    CrmMessagesService,
    systemSummary,
} from './crm-messages.service'
import { CrmMessagesController } from './messages.controller'

const USERS = [{ id: 'user-1', userName: 'jdoe', firstName: 'Jane', lastName: 'Doe' }]

function message(overrides: Record<string, unknown> = {}) {
    return {
        id: 'm-1',
        opportunityId: 'opp-1',
        leadId: null as string | null,
        kind: 'NOTE',
        body: 'Called the buyer',
        metadata: null,
        authorId: 'user-1',
        createdAt: new Date('2026-10-01T08:00:00Z'),
        updatedAt: null as Date | null,
        deletedAt: null as Date | null,
        ...overrides,
    }
}

function activity(overrides: Record<string, unknown> = {}) {
    return {
        id: 'a-1',
        opportunityId: 'opp-1',
        leadId: null,
        ticketId: null,
        type: 'CALL',
        summary: 'Call buyer',
        dueAt: new Date('2026-10-02T00:00:00Z'),
        assignedTo: 'user-1',
        assignee: USERS[0],
        doneAt: null,
        dueStatus: 'UPCOMING',
        createdBy: 'user-1',
        updatedBy: 'user-1',
        createdAt: new Date('2026-10-01T07:00:00Z'),
        updatedAt: new Date('2026-10-01T07:00:00Z'),
        ...overrides,
    }
}

function quotation(overrides: Record<string, unknown> = {}) {
    return {
        id: 'q-1',
        quotationNumber: 'Q-000042',
        revision: 1,
        status: 'DRAFT',
        effectiveStatus: 'DRAFT',
        validUntil: null as Date | null,
        createdAt: new Date('2026-10-01T06:00:00Z'),
        sentBy: null as string | null,
        sentAt: null as Date | null,
        decidedBy: null as string | null,
        decidedAt: null as Date | null,
        decisionReason: null as string | null,
        ...overrides,
    }
}

function mockPrisma() {
    return {
        crmOpportunity: {
            findUnique: jest.fn().mockResolvedValue({ id: 'opp-1', sdSalesOrderId: null }),
        },
        crmMessage: {
            findMany: jest.fn().mockResolvedValue([]),
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
                Promise.resolve(message({ id: 'm-new', ...data })),
            ),
            createMany: jest.fn().mockResolvedValue({ count: 0 }),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
                Promise.resolve(message({ ...data })),
            ),
        },
        user: { findMany: jest.fn().mockResolvedValue(USERS) },
    }
}

type MockPrisma = ReturnType<typeof mockPrisma>

function service(
    prisma: MockPrisma,
    opts: {
        activities?: unknown[]
        quotations?: unknown[]
        order?: Record<string, unknown> | null
    } = {},
) {
    prisma.crmOpportunity.findUnique = jest.fn().mockResolvedValue({
        id: 'opp-1',
        sdSalesOrderId: opts.order ? 'so-1' : null,
    })
    const activities = { listForOpportunity: jest.fn().mockResolvedValue(opts.activities ?? []) }
    const quotations = { listForOpportunity: jest.fn().mockResolvedValue(opts.quotations ?? []) }
    const salesOrders = { findOne: jest.fn().mockResolvedValue(opts.order ?? null) }
    return new CrmMessagesService(
        prisma as unknown as PrismaService,
        activities as never,
        quotations as never,
        salesOrders as never,
    )
}

describe('CrmMessagesService.addNote', () => {
    it('creates a NOTE owned by the current user and returns its author', async () => {
        const prisma = mockPrisma()
        const note = await service(prisma).addNote('opp-1', 'Called the buyer', 'user-1')

        expect(prisma.crmMessage.create.mock.calls[0][0].data).toEqual(
            expect.objectContaining({
                opportunityId: 'opp-1',
                kind: 'NOTE',
                body: 'Called the buyer',
                authorId: 'user-1',
            }),
        )
        expect(note.id).toBe('m-new')
        expect(note.author?.userName).toBe('jdoe')
    })

    it('404s for a missing opportunity', async () => {
        const prisma = mockPrisma()
        const svc = service(prisma)
        prisma.crmOpportunity.findUnique = jest.fn().mockResolvedValue(null)
        await expect(svc.addNote('nope', 'x', 'user-1')).rejects.toBeInstanceOf(
            NotFoundException,
        )
    })
})

describe('CrmMessagesService.listFeed', () => {
    it('merges messages, activities, quotations and the sales order newest first', async () => {
        const prisma = mockPrisma()
        prisma.crmMessage.findMany = jest.fn().mockResolvedValue([
            message({ id: 'm-note', kind: 'NOTE', body: 'Note at 09:00', createdAt: new Date('2026-10-01T09:00:00Z') }),
            message({ id: 'm-system', kind: 'SYSTEM', body: 'Stage changed', authorId: 'user-2', createdAt: new Date('2026-10-01T06:00:00Z') }),
        ])
        const activities = [activity({ id: 'a-1', doneAt: new Date('2026-10-01T10:00:00Z') })]
        const quotations = [
            quotation({ status: 'SENT', sentAt: new Date('2026-10-01T08:30:00Z'), sentBy: 'user-2' }),
        ]
        const order = { id: 'so-1', orderNumber: 'SO-000010', status: 'DRAFT', createdAt: new Date('2026-10-01T05:00:00Z') }

        const page = await service(prisma, { activities, quotations, order }).listFeed('opp-1', {
            limit: 5,
        })

        expect(page.data.map((i) => i.id)).toEqual([
            'activity:a-1:done',
            'message:m-note',
            'quotation:q-1:sent',
            'activity:a-1:scheduled',
            'message:m-system',
        ])
        expect(page.nextCursor).toBe(page.data[4].at)
        expect(page.data[0]).toMatchObject({
            type: 'ACTIVITY',
            summary: 'Completed Call: Call buyer',
            actor: USERS[0],
        })
        expect(page.data[1]).toEqual(
            expect.objectContaining({ type: 'NOTE', summary: 'Note at 09:00', actor: USERS[0] }),
        )
        expect(page.data[2]).toEqual(
            expect.objectContaining({
                type: 'QUOTATION',
                summary: 'Quotation Q-000042 rev 1 sent',
            }),
        )
    })

    it('adds the sales order link item when one is linked', async () => {
        const prisma = mockPrisma()
        prisma.crmMessage.findMany = jest.fn().mockResolvedValue([])
        const order = { id: 'so-1', orderNumber: 'SO-000010', status: 'DRAFT', createdAt: new Date('2026-10-01T05:00:00Z') }

        const page = await service(prisma, { order }).listFeed('opp-1', { limit: 10 })

        expect(page.data).toHaveLength(1)
        expect(page.data[0]).toMatchObject({
            type: 'SALES_ORDER',
            summary: 'SD sales order SO-000010 created (Draft)',
            metadata: { salesOrderId: 'so-1', orderNumber: 'SO-000010' },
        })
    })

    it('pages by cursor and hides soft-deleted notes', async () => {
        const prisma = mockPrisma()
        const cursor = new Date('2026-10-01T00:00:00Z')
        prisma.crmMessage.findMany = jest.fn().mockResolvedValue([
            message({ id: 'm-old', createdAt: new Date('2026-09-30T00:00:00Z') }),
        ])

        const page = await service(prisma).listFeed('opp-1', {
            cursor: cursor.toISOString(),
            limit: 1,
        })

        expect(page.data.map((i) => i.id)).toEqual(['message:m-old'])
        expect(page.nextCursor).toBeNull()
        expect(prisma.crmMessage.findMany.mock.calls[0][0]).toEqual(
            expect.objectContaining({
                where: expect.objectContaining({
                    opportunityId: 'opp-1',
                    deletedAt: null,
                    createdAt: { lt: cursor },
                }),
            }),
        )
    })

    it('reports quotation sent / accepted / rejected / expired events', async () => {
        const prisma = mockPrisma()
        const quotations = [
            quotation({ status: 'SENT', sentAt: new Date('2026-10-01T08:00:00Z') }),
            quotation({ id: 'q2', status: 'ACCEPTED', decidedAt: new Date('2026-10-02T08:00:00Z') }),
            quotation({ id: 'q3', status: 'REJECTED', decidedAt: new Date('2026-10-03T08:00:00Z'), decisionReason: 'Too expensive' }),
            quotation({ id: 'q4', status: 'EXPIRED', validUntil: new Date('2026-10-04T00:00:00Z') }),
        ]

        const page = await service(prisma, { quotations }).listFeed('opp-1', { limit: 10 })

        const events = page.data.filter((i) => i.type === 'QUOTATION')
        expect(events.map((i) => i.id)).toEqual([
            'quotation:q4:expired',
            'quotation:q3:rejected',
            'quotation:q2:accepted',
            'quotation:q-1:sent',
        ])
        expect(events[1].summary).toBe('Customer rejected quotation Q-000042 rev 1 (Too expensive)')
        expect(events[2].metadata).toEqual(
            expect.objectContaining({ status: 'ACCEPTED', quotationId: 'q2' }),
        )
    })

    it('loads no sales order when none is linked', async () => {
        const prisma = mockPrisma()
        const svc = service(prisma)
        const findOne = (svc as unknown as { salesOrders: { findOne: jest.Mock } }).salesOrders.findOne
        await svc.listFeed('opp-1', { limit: 5 })
        expect(findOne).not.toHaveBeenCalled()
    })
})

describe('CrmMessagesService note lifecycle', () => {
    it('edits only the author inside the 15-minute window', async () => {
        const prisma = mockPrisma()
        prisma.crmMessage.findFirst = jest.fn().mockResolvedValue(
            message({ kind: 'NOTE', authorId: 'user-1', createdAt: new Date(Date.now() - 5 * 60 * 1000) }),
        )
        prisma.crmMessage.update = jest.fn(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve(message({ ...data })),
        )

        const note = await service(prisma).editNote('opp-1', 'm-1', 'Edited body', 'user-1')

        expect(note.body).toBe('Edited body')
        expect(prisma.crmMessage.update.mock.calls[0][0].data).toEqual({
            body: 'Edited body',
            updatedAt: expect.any(Date),
        })
    })

    it('rejects a non-author edit', async () => {
        const prisma = mockPrisma()
        prisma.crmMessage.findFirst = jest
            .fn()
            .mockResolvedValue(message({ kind: 'NOTE', authorId: 'user-1' }))

        await expect(service(prisma).editNote('opp-1', 'm-1', 'x', 'user-2')).rejects.toBeInstanceOf(
            ForbiddenException,
        )
    })

    it('rejects an edit after the 15-minute window', async () => {
        const prisma = mockPrisma()
        prisma.crmMessage.findFirst = jest.fn().mockResolvedValue(
            message({
                kind: 'NOTE',
                authorId: 'user-1',
                createdAt: new Date(Date.now() - (NOTE_EDIT_WINDOW_MS + 1000)),
            }),
        )

        await expect(service(prisma).editNote('opp-1', 'm-1', 'x', 'user-1')).rejects.toThrow(
            /15 minutes/,
        )
    })

    it('does not allow editing SYSTEM entries', async () => {
        const prisma = mockPrisma()
        prisma.crmMessage.findFirst = jest
            .fn()
            .mockResolvedValue(message({ kind: 'SYSTEM', authorId: 'user-1' }))

        await expect(service(prisma).editNote('opp-1', 'm-1', 'x', 'user-1')).rejects.toBeInstanceOf(
            ConflictException,
        )
    })

    it('soft-deletes a note only by its author and never hard-deletes', async () => {
        const prisma = mockPrisma()
        prisma.crmMessage.findFirst = jest
            .fn()
            .mockResolvedValue(message({ kind: 'NOTE', authorId: 'user-1' }))

        const result = await service(prisma).softDeleteNote('opp-1', 'm-1', 'user-1')

        expect(prisma.crmMessage.updateMany.mock.calls[0][0]).toEqual(
            expect.objectContaining({
                where: {
                    id: 'm-1',
                    opportunityId: 'opp-1',
                    kind: 'NOTE',
                    authorId: 'user-1',
                    deletedAt: null,
                },
                data: { deletedAt: expect.any(Date) },
            }),
        )
        expect(prisma.crmMessage).not.toHaveProperty('delete')
        expect(result.deletedAt).toBeInstanceOf(Date)
    })

    it('rejects a non-author soft delete', async () => {
        const prisma = mockPrisma()
        prisma.crmMessage.findFirst = jest
            .fn()
            .mockResolvedValue(message({ kind: 'NOTE', authorId: 'user-1' }))

        await expect(service(prisma).softDeleteNote('opp-1', 'm-1', 'user-2')).rejects.toBeInstanceOf(
            ForbiddenException,
        )
        expect(prisma.crmMessage.updateMany).not.toHaveBeenCalled()
    })

    it('does not allow deleting SYSTEM entries', async () => {
        const prisma = mockPrisma()
        prisma.crmMessage.findFirst = jest
            .fn()
            .mockResolvedValue(message({ kind: 'SYSTEM', authorId: 'user-1' }))

        await expect(service(prisma).softDeleteNote('opp-1', 'm-1', 'user-1')).rejects.toBeInstanceOf(
            ConflictException,
        )
    })
})

describe('CrmMessagesService.recordSystem', () => {
    it('writes one SYSTEM row per change with JSON-safe metadata and summaries', async () => {
        const prisma = mockPrisma()
        const messages = new CrmMessagesService(
            prisma as unknown as PrismaService,
            {} as never,
            {} as never,
            {} as never,
        )

        await messages.recordSystem(
            prisma as never,
            'opp-1',
            [
                { field: 'stage', from: 'NEGOTIATION', to: 'CLOSED_LOST' },
                { field: 'amount', from: new Decimal('1000'), to: new Decimal('2500') },
            ],
            'user-1',
        )

        const data = prisma.crmMessage.createMany.mock.calls[0][0].data
        expect(data).toHaveLength(2)
        expect(data[0]).toEqual(
            expect.objectContaining({
                opportunityId: 'opp-1',
                kind: 'SYSTEM',
                authorId: 'user-1',
                body: 'Stage changed from Negotiation to Closed Lost',
                metadata: { field: 'stage', from: 'NEGOTIATION', to: 'CLOSED_LOST' },
            }),
        )
        expect(data[1].metadata).toEqual({ field: 'amount', from: '1000.00', to: '2500.00' })
        expect(data[0].createdAt).toBeInstanceOf(Date)
    })

    it('is a no-op for an empty change set', async () => {
        const prisma = mockPrisma()
        const messages = new CrmMessagesService(
            prisma as unknown as PrismaService,
            {} as never,
            {} as never,
            {} as never,
        )
        await messages.recordSystem(prisma as never, 'opp-1', [], 'user-1')
        expect(prisma.crmMessage.createMany).not.toHaveBeenCalled()
    })
})

describe('SYSTEM message summaries', () => {
    it('renders stage, reopen, owner and lost-reason changes readably', () => {
        expect(systemSummary({ field: 'stage', from: 'PROPOSAL', to: 'QUALIFICATION' })).toBe(
            'Stage changed from Proposal to Qualification',
        )
        expect(
            systemSummary({
                field: 'stage',
                from: 'CLOSED_LOST',
                to: 'PROSPECTING',
                summary: 'Opportunity reopened to Prospecting',
            }),
        ).toBe('Opportunity reopened to Prospecting')
        expect(systemSummary({ field: 'assignedTo', from: null, to: 'user-2' })).toBe(
            'Assigned to user-2',
        )
        expect(systemSummary({ field: 'lostReason', from: null, to: 'PRICE' })).toBe(
            'Lost reason set to Price',
        )
    })

    it('labels stage metadata consistently', () => {
        expect(formatSystemLabel('CLOSED_WON')).toBe('Closed Won')
        expect(formatSystemLabel('NEGOTIATION')).toBe('Negotiation')
    })
})

describe('CrmMessagesController RBAC metadata', () => {
    it.each([
        ['feed', 'read'],
        ['createNote', 'create'],
        ['updateNote', 'update'],
        ['deleteNote', 'delete'],
    ] as const)('%s requires crm.opportunities:%s', (handler, action) => {
        const fn = CrmMessagesController.prototype[
            handler as 'feed' | 'createNote' | 'updateNote' | 'deleteNote'
        ]
        expect(Reflect.getMetadata(PERMISSION_KEY, fn)).toEqual({
            resource: 'crm.opportunities',
            action,
        })
    })
})