import { BadRequestException, ConflictException } from '@nestjs/common'
import { CrmEmailService } from './crm-email.service'

describe('CrmEmailService', () => {
    const message = {
        id: 'm-1',
        direction: 'OUTBOUND',
        status: 'DRAFT',
        toEmail: 'ann@acme.test',
        toName: 'Ann',
        fromEmail: null,
        subject: 'Hello',
        bodyText: 'Body',
        bodyHtml: null,
        customerId: null,
        opportunityId: null,
        quotationId: null,
        quotationRevision: null,
        templateKey: null,
        starred: false,
        isSpam: false,
        provider: null,
        providerMessageId: null,
        smtpMessageId: null,
        receivedAt: null,
        sentAt: null,
        lastError: null,
        createdBy: 'u-1',
        updatedBy: 'u-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        attachments: [],
        customer: null,
        opportunity: null,
        quotation: null,
    }

    function setup(overrides: { message?: Record<string, unknown> } = {}) {
        const current = { ...message, ...overrides.message, attachments: [] as any[] }
        const prisma = {
            crmEmailMessage: {
                findMany: jest.fn().mockResolvedValue([current]),
                findUnique: jest.fn().mockResolvedValue(current),
                create: jest.fn().mockImplementation(async ({ data }) => {
                    Object.assign(current, data, { id: 'm-1' })
                    return current
                }),
                update: jest.fn().mockImplementation(async ({ data }) => {
                    Object.assign(current, data)
                    return current
                }),
            },
            crmEmailAttachment: {
                create: jest.fn(),
                deleteMany: jest.fn(),
                delete: jest.fn(),
            },
            sdQuotation: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
            sdQuotationDocument: { findUnique: jest.fn() },
            sdCustomer: { findUnique: jest.fn() },
            crmOpportunity: { findUnique: jest.fn() },
        }
        const mail = {
            sendQuotationEmail: jest.fn().mockResolvedValue({ sent: true, messageId: 'mid' }),
        }
        const quotationEmail = { send: jest.fn() }
        const service = new CrmEmailService(prisma as never, mail as never, quotationEmail as never)
        return { service, prisma, mail, current }
    }

    it('lists sent folder rows', async () => {
        const { service, prisma } = setup()
        const rows = await service.list({ folder: 'sent' })
        expect(prisma.crmEmailMessage.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { status: { in: ['SENT', 'FAILED'] }, direction: 'OUTBOUND' },
            }),
        )
        expect(rows).toHaveLength(1)
    })

    it('queries inbox and spam as inbound folders', async () => {
        const { service, prisma } = setup({
            message: { direction: 'INBOUND', status: 'RECEIVED', isSpam: false },
        })
        await service.list({ folder: 'inbox' })
        expect(prisma.crmEmailMessage.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { direction: 'INBOUND', isSpam: false, status: 'RECEIVED' },
            }),
        )
    })

    it('rejects invalid recipient on draft create', async () => {
        const { service } = setup()
        await expect(
            service.upsertDraft({ toEmail: 'not-an-email' }, 'u-1'),
        ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('sends an ad-hoc draft and marks SENT', async () => {
        const { service, mail, prisma, current } = setup()
        const result = await service.send('m-1', 'u-1')
        expect(mail.sendQuotationEmail).toHaveBeenCalledWith(
            expect.objectContaining({
                to: 'ann@acme.test',
                subject: 'Hello',
                text: 'Body',
            }),
        )
        expect(prisma.crmEmailMessage.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: 'SENT' }),
            }),
        )
        expect(result.status).toBe('SENT')
        expect(current.status).toBe('SENT')
    })

    it('refuses to edit a sent message', async () => {
        const { service } = setup({ message: { status: 'SENT' } })
        await expect(
            service.updateDraft('m-1', { subject: 'X' }, 'u-1'),
        ).rejects.toBeInstanceOf(ConflictException)
    })

    it('lists starred folder with starred filter', async () => {
        const { service, prisma } = setup({ message: { starred: true, status: 'SENT' } })
        await service.list({ folder: 'starred' })
        expect(prisma.crmEmailMessage.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { starred: true },
            }),
        )
    })

    it('applies search q within folder as OR contains filters', async () => {
        const { service, prisma } = setup()
        await service.list({ folder: 'sent', q: 'acme' })
        expect(prisma.crmEmailMessage.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    AND: [
                        { status: { in: ['SENT', 'FAILED'] }, direction: 'OUTBOUND' },
                        {
                            OR: [
                                { toEmail: { contains: 'acme', mode: 'insensitive' } },
                                { toName: { contains: 'acme', mode: 'insensitive' } },
                                { fromEmail: { contains: 'acme', mode: 'insensitive' } },
                                { subject: { contains: 'acme', mode: 'insensitive' } },
                                { bodyText: { contains: 'acme', mode: 'insensitive' } },
                            ],
                        },
                    ],
                },
            }),
        )
    })

    it('toggles starred on a sent message', async () => {
        const { service, prisma, current } = setup({ message: { status: 'SENT' } })
        const result = await service.setStarred('m-1', { starred: true }, 'u-1')
        expect(prisma.crmEmailMessage.update).toHaveBeenCalledWith({
            where: { id: 'm-1' },
            data: { starred: true, updatedBy: 'u-1' },
        })
        expect(result.starred).toBe(true)
        expect(current.starred).toBe(true)
    })

    it('lists inbox and spam inbound folders', async () => {
        const { service, prisma } = setup({
            message: { direction: 'INBOUND', status: 'RECEIVED', isSpam: false },
        })
        await service.list({ folder: 'inbox' })
        expect(prisma.crmEmailMessage.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { direction: 'INBOUND', isSpam: false, status: 'RECEIVED' },
            }),
        )
        await service.list({ folder: 'spam' })
        expect(prisma.crmEmailMessage.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { direction: 'INBOUND', isSpam: true, status: 'RECEIVED' },
            }),
        )
    })

    it('moves an inbound message to spam', async () => {
        const { service, prisma, current } = setup({
            message: { direction: 'INBOUND', status: 'RECEIVED', isSpam: false },
        })
        const result = await service.setSpam('m-1', { isSpam: true }, 'u-1')
        expect(prisma.crmEmailMessage.update).toHaveBeenCalledWith({
            where: { id: 'm-1' },
            data: { isSpam: true, updatedBy: 'u-1' },
        })
        expect(result.isSpam).toBe(true)
        expect(current.isSpam).toBe(true)
    })

    it('lists starred across directions', async () => {
        const { service, prisma } = setup({ message: { starred: true } })
        await service.list({ folder: 'starred' })
        expect(prisma.crmEmailMessage.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { starred: true },
            }),
        )
    })
})
