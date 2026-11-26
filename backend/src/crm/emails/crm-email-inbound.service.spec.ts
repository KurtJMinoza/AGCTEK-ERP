import {
    CrmEmailInboundService,
    isOurOutboundFrom,
    looksLikeSpam,
} from './crm-email-inbound.service'
import type { CrmMaildevClient } from './crm-maildev.client'

describe('CrmEmailInboundService helpers', () => {
    const prev = { ...process.env }

    afterEach(() => {
        process.env = { ...prev }
    })

    it('detects spam keywords', () => {
        expect(looksLikeSpam('You are a lottery winner', 'claim now')).toBe(true)
        expect(looksLikeSpam('Quote follow-up', 'Please review')).toBe(false)
    })

    it('recognizes our outbound from addresses', () => {
        process.env.QUOTATION_MAIL_FROM_ADDRESS = 'quotes@localhost'
        expect(isOurOutboundFrom('quotes@localhost')).toBe(true)
        expect(isOurOutboundFrom('customer@acme.test')).toBe(false)
    })
})

describe('CrmEmailInboundService.importOne', () => {
    function setup() {
        const created: Record<string, unknown>[] = []
        const prisma = {
            crmEmailMessage: {
                findUnique: jest.fn().mockResolvedValue(null),
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockImplementation(async ({ data }) => {
                    created.push(data)
                    return { id: 'in-1', ...data }
                }),
            },
            sdCustomer: {
                findFirst: jest.fn().mockResolvedValue({ id: 'cust-1' }),
            },
        }
        const maildev = { listEmails: jest.fn(), baseUrl: () => 'http://127.0.0.1:8025' }
        const service = new CrmEmailInboundService(
            prisma as never,
            maildev as unknown as CrmMaildevClient,
        )
        return { service, prisma, created }
    }

    it('imports a MailDev message into Inbox', async () => {
        const { service, prisma, created } = setup()
        const result = await service.importOne({
            id: 'md-1',
            from: [{ address: 'buyer@acme.test', name: 'Buyer' }],
            to: [{ address: 'sales@localhost' }],
            subject: 'Need a quote',
            text: 'Can you send pricing?',
            time: '2026-11-17T02:00:00.000Z',
        })
        expect(result).toBe('imported')
        expect(prisma.crmEmailMessage.create).toHaveBeenCalled()
        expect(created[0]).toMatchObject({
            direction: 'INBOUND',
            status: 'RECEIVED',
            isSpam: false,
            provider: 'MAILDEV',
            providerMessageId: 'md-1',
            fromEmail: 'buyer@acme.test',
            customerId: 'cust-1',
        })
    })

    it('skips duplicate providerMessageId', async () => {
        const { service, prisma } = setup()
        prisma.crmEmailMessage.findUnique.mockResolvedValue({ id: 'existing' })
        const result = await service.importOne({
            id: 'md-1',
            from: [{ address: 'buyer@acme.test' }],
            to: [{ address: 'sales@localhost' }],
            subject: 'Hi',
            text: 'Hello',
        })
        expect(result).toBe('skipped')
        expect(prisma.crmEmailMessage.create).not.toHaveBeenCalled()
    })

    it('skips our own outbound from address', async () => {
        process.env.QUOTATION_MAIL_FROM_ADDRESS = 'quotes@localhost'
        const { service, prisma } = setup()
        const result = await service.importOne({
            id: 'md-out',
            from: [{ address: 'quotes@localhost' }],
            to: [{ address: 'ann@acme.test' }],
            subject: 'Quotation',
            text: 'Attached',
        })
        expect(result).toBe('skipped')
        expect(prisma.crmEmailMessage.create).not.toHaveBeenCalled()
    })

    it('marks keyword matches as spam', async () => {
        const { service, created } = setup()
        await service.importOne({
            id: 'md-spam',
            from: [{ address: 'spam@evil.test' }],
            to: [{ address: 'sales@localhost' }],
            subject: 'Lottery winner claim',
            text: 'You won',
        })
        expect(created[0]).toMatchObject({ isSpam: true })
    })
})
