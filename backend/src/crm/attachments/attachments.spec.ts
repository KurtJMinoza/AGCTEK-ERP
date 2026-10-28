import { BadRequestException, ConflictException, NotFoundException, PayloadTooLargeException } from '@nestjs/common'
import { PERMISSION_KEY } from '../../permissions/permission.guard'
import {
    CrmOpportunityAttachmentsController,
    CrmTicketAttachmentsController,
} from './attachments.controller'

const disk = new Map<string, Buffer>()

jest.mock('../../common/document-storage', () => {
    const actual = jest.requireActual('../../common/document-storage')
    return {
        ...actual,
        createDocumentStorage: () => {
            const real = actual.createDocumentStorage('test')
            return {
                buildKey: real.buildKey,
                save: (key: string, buffer: Buffer) => disk.set(key, buffer),
                read: (key: string) => {
                    if (!disk.has(key)) throw new Error('File not found on disk')
                    return disk.get(key)
                },
                remove: (key: string) => disk.delete(key),
            }
        },
    }
})

// eslint-disable-next-line import/first
import { CrmAttachmentsService } from './attachments.service'

type Row = Record<string, any>

function setup(opts: { ticketStatus?: string | null } = {}) {
    const rows: Row[] = []
    const prisma = {
        crmTicket: {
            findUnique: jest.fn().mockResolvedValue(
                opts.ticketStatus === null ? null : { status: opts.ticketStatus ?? 'OPEN' },
            ),
        },
        crmOpportunity: { findUnique: jest.fn().mockResolvedValue({ id: 'opp-1' }) },
        crmAttachment: {
            aggregate: jest.fn(async ({ where }: { where: Row }) => ({
                _max: {
                    version:
                        Math.max(
                            0,
                            ...rows
                                .filter(
                                    (r) =>
                                        r.fileName === where.fileName &&
                                        (where.ticketId === undefined || r.ticketId === where.ticketId) &&
                                        (where.opportunityId === undefined || r.opportunityId === where.opportunityId),
                                )
                                .map((r) => r.version),
                        ) || null,
                },
            })),
            create: jest.fn(async ({ data }: { data: Row }) => {
                const row = {
                    id: `att-${rows.length + 1}`,
                    ticketId: null,
                    opportunityId: null,
                    createdAt: new Date(),
                    deletedAt: null,
                    deletedBy: null,
                    ...data,
                }
                rows.push(row)
                return row
            }),
            findMany: jest.fn(async ({ where }: { where: Row }) =>
                rows.filter((r) => r.ticketId === where.ticketId && r.deletedAt === null),
            ),
            findFirst: jest.fn(async ({ where }: { where: Row }) =>
                rows.find((r) => r.id === where.id && (r.ticketId === where.ticketId || r.opportunityId === where.opportunityId)) ?? null,
            ),
            updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
                const row = rows.find((r) => r.id === where.id && r.deletedAt === null)
                if (!row) return { count: 0 }
                Object.assign(row, data)
                return { count: 1 }
            }),
        },
        user: { findMany: jest.fn().mockResolvedValue([{ id: 'u-1', userName: 'agent', firstName: 'Ann', lastName: 'Agent' }]) },
        $transaction: jest.fn(),
    }
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma))
    const messages = {
        recordSystemOn: jest.fn().mockResolvedValue({ count: 1 }),
        recordSystem: jest.fn().mockResolvedValue({ count: 1 }),
    }
    const service = new CrmAttachmentsService(prisma as never, messages as never)
    return { prisma, rows, messages, service }
}

const ticket = { kind: 'ticket' as const, id: 't-1' }
const file = (name = 'invoice.pdf', content = 'hello') => ({
    fileName: name,
    mimeType: 'application/pdf',
    contentBase64: Buffer.from(content).toString('base64'),
})

beforeEach(() => disk.clear())

describe('CrmAttachmentsService', () => {
    it('stores the file, versions re-uploads of a name and audits each upload on the ticket', async () => {
        const { messages, service } = setup()

        const first = await service.upload(ticket, file(), 'u-1')
        const second = await service.upload(ticket, file('invoice.pdf', 'v2'), 'u-1')

        expect([first.version, second.version]).toEqual([1, 2])
        expect(first).not.toHaveProperty('storageKey')
        expect(first.uploader).toEqual(expect.objectContaining({ userName: 'agent' }))
        expect(disk.size).toBe(2)
        expect(messages.recordSystemOn).toHaveBeenLastCalledWith(
            expect.anything(),
            { ticketId: 't-1' },
            [expect.objectContaining({ field: 'attachment', summary: 'Attached invoice.pdf (version 2)' })],
            'u-1',
        )
    })

    it('audits opportunity uploads on the opportunity feed', async () => {
        const { messages, service } = setup()
        await service.upload({ kind: 'opportunity', id: 'opp-1' }, file('po.pdf'), 'u-1')
        expect(messages.recordSystem).toHaveBeenCalledWith(
            expect.anything(),
            'opp-1',
            [expect.objectContaining({ summary: 'Attached po.pdf' })],
            'u-1',
        )
    })

    it('rejects closed tickets, empty, oversized and unsupported files before storing anything', async () => {
        await expect(setup({ ticketStatus: 'CLOSED' }).service.upload(ticket, file(), 'u-1')).rejects.toBeInstanceOf(
            ConflictException,
        )
        const { service } = setup()
        await expect(service.upload(ticket, file('a.pdf', ''), 'u-1')).rejects.toBeInstanceOf(BadRequestException)
        await expect(
            service.upload(ticket, { ...file(), contentBase64: Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64') }, 'u-1'),
        ).rejects.toBeInstanceOf(PayloadTooLargeException)
        await expect(service.upload(ticket, file('run.exe'), 'u-1')).rejects.toThrow('Unsupported file type: .exe')
        expect(disk.size).toBe(0)
    })

    it('removes the stored file when the database write fails', async () => {
        const { prisma, service } = setup()
        prisma.crmAttachment.create.mockRejectedValueOnce(new Error('db down'))
        await expect(service.upload(ticket, file(), 'u-1')).rejects.toThrow('db down')
        expect(disk.size).toBe(0)
    })

    it('soft-deletes with who / when, hides it from the list, audits it and refuses its download', async () => {
        const { rows, messages, service } = setup()
        const uploaded = await service.upload(ticket, file(), 'u-1')

        await expect(service.remove(ticket, uploaded.id, 'u-2')).resolves.toEqual({ id: uploaded.id, removed: true })

        expect(rows[0]).toMatchObject({ deletedBy: 'u-2', deletedAt: expect.any(Date) })
        expect(await service.list(ticket)).toEqual([])
        expect(disk.size).toBe(1)
        expect(messages.recordSystemOn).toHaveBeenLastCalledWith(
            expect.anything(),
            { ticketId: 't-1' },
            [expect.objectContaining({ summary: 'Removed attachment invoice.pdf (version 1)' })],
            'u-2',
        )
        await expect(service.download(ticket, uploaded.id)).rejects.toThrow('Attachment was removed')
    })

    it('downloads only through the owning record; 404 for another record or a missing ticket', async () => {
        const { service } = setup()
        const uploaded = await service.upload(ticket, file(), 'u-1')
        const { row } = await service.download(ticket, uploaded.id)
        expect(row.fileName).toBe('invoice.pdf')

        await expect(service.download({ kind: 'ticket', id: 't-2' }, uploaded.id)).rejects.toBeInstanceOf(NotFoundException)
        await expect(setup({ ticketStatus: null }).service.list(ticket)).rejects.toThrow('Ticket not found')
    })
})

describe('Attachment routes RBAC metadata', () => {
    it.each([
        [CrmTicketAttachmentsController, 'crm.tickets'],
        [CrmOpportunityAttachmentsController, 'crm.opportunities'],
    ] as const)('%p uses %s: read to list / download, create to upload, delete to remove', (ctrl, resource) => {
        const meta = (handler: 'list' | 'upload' | 'download' | 'remove') =>
            Reflect.getMetadata(PERMISSION_KEY, ctrl.prototype[handler])
        expect(meta('list')).toEqual({ resource, action: 'read' })
        expect(meta('download')).toEqual({ resource, action: 'read' })
        expect(meta('upload')).toEqual({ resource, action: 'create' })
        expect(meta('remove')).toEqual({ resource, action: 'delete' })
    })
})
