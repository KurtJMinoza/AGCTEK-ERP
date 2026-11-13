import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { QuotationEmailService } from './quotation-email.service'
import type { QuotationMailService } from './mail.service'
import type { QuotationPdfService } from './quotation-pdf.service'
import type { QuotationService } from './quotation.service'
import {
    readQuotationDocumentPdf,
    saveQuotationDocumentPdf,
} from './quotation-document-storage'

jest.mock('./quotation-document-storage', () => {
    const actual = jest.requireActual('./quotation-document-storage')
    return {
        ...actual,
        saveQuotationDocumentPdf: jest.fn(),
        readQuotationDocumentPdf: jest.fn(),
        rewriteQuotationDocumentPdf: jest.fn(),
    }
})

const saveStored = saveQuotationDocumentPdf as jest.Mock
const readStored = readQuotationDocumentPdf as jest.Mock

const PDF_BYTES = Buffer.from('%PDF-1.4 quotation')
const STORED_DOCUMENT = {
    id: 'doc-1',
    quotationId: 'q-1',
    revision: 2,
    storageKey: '11111111-1111-1111-1111-111111111111.pdf',
    contentType: 'application/pdf',
    byteSize: PDF_BYTES.length,
    checksum: 'abc123',
    createdBy: 'user-1',
    createdAt: new Date('2026-11-13T00:00:00Z'),
}

function quotation(overrides: Record<string, unknown> = {}) {
    return {
        id: 'q-1',
        quotationNumber: 'Q-000012',
        revision: 2,
        status: 'SENT',
        effectiveStatus: 'SENT',
        crmOpportunityId: 'opp-1',
        customerId: 'cust-1',
        currency: 'PHP',
        subtotal: new Prisma.Decimal('2350.00'),
        totalAmount: new Prisma.Decimal('2350.00'),
        validUntil: new Date('2026-12-15T15:59:59.999Z'),
        lastEmailedAt: null,
        sentBy: 'user-1',
        createdBy: 'user-1',
        lines: [],
        sections: [],
        lineIssues: [],
        isExpired: false,
        ...overrides,
    }
}

type PrismaMock = {
    sdCustomer: { findUnique: jest.Mock }
    crmOpportunity: { findUnique: jest.Mock }
    user: { findUnique: jest.Mock }
    company: { findFirst: jest.Mock }
    sdEmailTemplate: {
        findUnique: jest.Mock
        findMany: jest.Mock
        findFirst: jest.Mock
        updateMany: jest.Mock
        update: jest.Mock
        create: jest.Mock
    }
    sdQuotationDocument: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock }
    sdQuotation: { update: jest.Mock; updateMany: jest.Mock }
    sdQuotationEvent: { create: jest.Mock }
    $transaction: jest.Mock
}

function setup(options: { quote?: Record<string, unknown>; customer?: Record<string, unknown> | null } = {}) {
    const quote = quotation(options.quote)
    const prisma = {
        sdCustomer: {
            findUnique: jest.fn().mockResolvedValue(
                options.customer === undefined
                    ? { companyName: 'Acme Trading', contactName: 'Ann Cruz', email: 'ann@acme.test' }
                    : options.customer,
            ),
        },
        crmOpportunity: { findUnique: jest.fn().mockResolvedValue({ name: 'Icebox rollout' }) },
        user: {
            findUnique: jest.fn().mockResolvedValue({
                userName: 'rep1',
                firstName: 'Rita',
                lastName: 'Rep',
            }),
        },
        company: { findFirst: jest.fn().mockResolvedValue({ name: 'AGCTEK' }) },
        sdEmailTemplate: {
            findUnique: jest.fn().mockResolvedValue(null),
            findMany: jest.fn().mockResolvedValue([]),
            findFirst: jest.fn(),
            updateMany: jest.fn(),
            update: jest.fn(),
            create: jest.fn(),
        },
        sdQuotationDocument: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
                Promise.resolve({ id: 'doc-1', createdAt: new Date(), ...data }),
            ),
            update: jest.fn(),
        },
        sdQuotation: {
            update: jest.fn().mockResolvedValue({}),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        sdQuotationEvent: { create: jest.fn().mockResolvedValue({}) },
        $transaction: jest.fn(),
    } as PrismaMock
    prisma.$transaction.mockImplementation((cb: (tx: PrismaMock) => unknown) => cb(prisma))

    const sentAt = new Date('2026-11-13T09:00:00Z')
    const quotations = {
        findOne: jest.fn().mockResolvedValue(quote),
        // Canonical DRAFT → SENT freeze (QuotationService.send).
        send: jest.fn().mockResolvedValue(
            quotation({
                ...options.quote,
                status: 'SENT',
                effectiveStatus: 'SENT',
                sentBy: 'user-1',
                sentAt,
                validUntil: new Date('2026-12-13T15:59:59.999Z'),
            }),
        ),
        pdfInput: jest.fn().mockResolvedValue({ quotationNumber: 'Q-000012', revision: 2 }),
    }
    const pdf = { render: jest.fn().mockResolvedValue(PDF_BYTES) }
    const mail = {
        sendQuotationEmail: jest.fn().mockResolvedValue({ sent: true, messageId: 'message-1' }),
    }

    const service = new QuotationEmailService(
        prisma as unknown as never,
        quotations as unknown as QuotationService,
        pdf as unknown as QuotationPdfService,
        mail as unknown as QuotationMailService,
    )
    return { quote, prisma, quotations, pdf, mail, service }
}

type EventCreateCall = [{ data: { action: string } }]

const eventActions = (prisma: Pick<PrismaMock, 'sdQuotationEvent'>) =>
    (prisma.sdQuotationEvent.create.mock.calls as EventCreateCall[]).map(([call]) => call.data.action)

beforeEach(() => {
    saveStored.mockReturnValue({
        storageKey: STORED_DOCUMENT.storageKey,
        contentType: 'application/pdf',
        byteSize: PDF_BYTES.length,
        checksum: 'abc123',
    })
    readStored.mockReturnValue(null)
})

describe('QuotationEmailService.send', () => {
    it('refuses a DRAFT: Send (DRAFT → SENT) stays its own step, nothing is rendered or mailed', async () => {
        const { service, mail, quotations, pdf } = setup({
            quote: { status: 'DRAFT', effectiveStatus: 'DRAFT', validUntil: null },
        })

        await expect(service.send('q-1', {}, 'user-1')).rejects.toMatchObject({
            response: { code: 'QUOTATION_NOT_EMAILABLE', message: expect.stringMatching(/^Send the quotation first/) },
        })
        expect(quotations.send).not.toHaveBeenCalled()
        expect(pdf.render).not.toHaveBeenCalled()
        expect(mail.sendQuotationEmail).not.toHaveBeenCalled()
    })

    it('records a failed delivery without touching the quotation status', async () => {
        const { service, prisma, mail } = setup()
        mail.sendQuotationEmail.mockResolvedValue({ sent: false, error: 'Quotation email delivery failed' })

        const result = await service.send('q-1', {}, 'user-1')

        expect(result.sent).toBe(false)
        expect(prisma.sdQuotation.updateMany).not.toHaveBeenCalled()
        expect(prisma.sdQuotation.update).not.toHaveBeenCalled()
        expect(eventActions(prisma)).toEqual(['PDF_STORED', 'EMAIL_FAILED'])
    })

    it('records a transport exception as EMAIL_FAILED and rethrows it', async () => {
        const { service, prisma, mail } = setup()
        mail.sendQuotationEmail.mockRejectedValue(new Error('SMTP connection refused'))

        await expect(service.send('q-1', {}, 'user-1')).rejects.toThrow('SMTP connection refused')
        expect(prisma.sdQuotation.updateMany).not.toHaveBeenCalled()
        expect(eventActions(prisma)).toEqual(['PDF_STORED', 'EMAIL_FAILED'])
    })

    it('fails predictably when the customer has no email address', async () => {
        const { service, mail } = setup({
            customer: { companyName: 'Acme Trading', contactName: 'Ann Cruz', email: null },
        })

        await expect(service.send('q-1', {}, 'user-1')).rejects.toBeInstanceOf(BadRequestException)
        await expect(service.send('q-1', {}, 'user-1')).rejects.toMatchObject({
            response: { code: 'QUOTATION_NO_CUSTOMER_EMAIL' },
        })
        expect(mail.sendQuotationEmail).not.toHaveBeenCalled()
    })

    it('stores the PDF on first email and sends the default template as the attachment', async () => {
        const { service, prisma, pdf, mail } = setup()

        const result = await service.send('q-1', {}, 'user-1')

        expect(result).toMatchObject({
            sent: true,
            to: 'ann@acme.test',
            attachmentFilename: 'Q-000012_rev2.pdf',
            lastEmailedAt: expect.any(Date),
        })
        expect(pdf.render).toHaveBeenCalledTimes(1)
        expect(prisma.sdQuotationDocument.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                quotationId: 'q-1',
                revision: 2,
                createdBy: 'user-1',
                storageKey: STORED_DOCUMENT.storageKey,
            }),
        })
        expect(mail.sendQuotationEmail).toHaveBeenCalledWith({
            to: 'ann@acme.test',
            subject: 'Quotation Q-000012 rev 2 from AGCTEK',
            text: expect.stringContaining('Dear Acme Trading,'),
            html: expect.stringContaining('<p>Dear Acme Trading,'),
            attachments: [
                {
                    filename: 'Q-000012_rev2.pdf',
                    content: PDF_BYTES,
                    contentType: 'application/pdf',
                },
            ],
        })
        expect(mail.sendQuotationEmail.mock.calls[0][0].text).toContain('Total: 2,350.00 PHP')
        expect(mail.sendQuotationEmail.mock.calls[0][0].text).toContain('Rita Rep')
        expect(prisma.sdQuotation.update).toHaveBeenCalledWith({
            where: { id: 'q-1' },
            data: { lastEmailedAt: expect.any(Date) },
        })
        expect(eventActions(prisma)).toEqual(['PDF_STORED', 'EMAIL_SENT'])
    })

    it('lets the composer override the subject and body for that send only', async () => {
        const { service, mail } = setup()

        await service.send('q-1', { subject: '  Your quote  ', bodyText: 'Custom note' }, 'user-1')

        expect(mail.sendQuotationEmail).toHaveBeenCalledWith(
            expect.objectContaining({
                subject: 'Your quote',
                text: 'Custom note',
                html: '<p>Custom note</p>',
            }),
        )
    })

    it('reuses the stored PDF for a resend and records EMAIL_RESENT', async () => {
        const { service, prisma, pdf, mail } = setup({
            quote: { lastEmailedAt: new Date('2026-11-12T08:00:00Z') },
        })
        prisma.sdQuotationDocument.findUnique.mockResolvedValue(STORED_DOCUMENT)
        readStored.mockReturnValue(PDF_BYTES)

        const result = await service.send('q-1', {}, 'user-1')

        expect(result.sent).toBe(true)
        expect(pdf.render).not.toHaveBeenCalled()
        expect(prisma.sdQuotationDocument.create).not.toHaveBeenCalled()
        expect(mail.sendQuotationEmail.mock.calls[0][0].text).toContain('we are resending')
        expect(eventActions(prisma)).toEqual(['EMAIL_RESENT'])
    })

    it('records a transport failure without changing the quotation or claiming it was emailed', async () => {
        const { service, prisma, mail } = setup()
        mail.sendQuotationEmail.mockResolvedValue({ sent: false, error: 'Quotation email delivery failed' })

        const result = await service.send('q-1', {}, 'user-1')

        expect(result).toMatchObject({ sent: false, error: 'Quotation email delivery failed' })
        expect(prisma.sdQuotation.update).not.toHaveBeenCalled()
        expect(eventActions(prisma)).toEqual(['PDF_STORED', 'EMAIL_FAILED'])
    })

    it('records a skipped send (mail disabled / no transport)', async () => {
        const { service, prisma, mail } = setup()
        mail.sendQuotationEmail.mockResolvedValue({ sent: false, skippedReason: 'MAIL_ENABLED=false' })

        const result = await service.send('q-1', {}, 'user-1')

        expect(result).toMatchObject({ sent: false, skippedReason: 'MAIL_ENABLED=false' })
        expect(eventActions(prisma)).toEqual(['PDF_STORED', 'EMAIL_SKIPPED'])
    })

    it('rejects statuses that can no longer be emailed', async () => {
        const { service } = setup({ quote: { status: 'EXPIRED', effectiveStatus: 'EXPIRED' } })
        await expect(service.send('q-1', {}, 'user-1')).rejects.toBeInstanceOf(ConflictException)
    })
})

describe('QuotationEmailService.preview', () => {
    it('renders the recipient, default template and attachment name without writing', async () => {
        const { service, prisma } = setup()

        const preview = await service.preview('q-1')

        expect(preview).toMatchObject({
            to: 'ann@acme.test',
            customerName: 'Acme Trading',
            templateKey: 'quotation_sent',
            attachmentFilename: 'Q-000012_rev2.pdf',
            hasStoredPdf: false,
        })
        expect(preview.subject).toBe('Quotation Q-000012 rev 2 from AGCTEK')
        expect(preview.bodyText).toContain('Dear Acme Trading,')
        expect(prisma.sdQuotationDocument.create).not.toHaveBeenCalled()
        expect(prisma.sdQuotation.update).not.toHaveBeenCalled()
    })
})

describe('QuotationEmailService.createTemplateFromQuotation', () => {
    it('saves the edited copy with this quotation\'s values restored to placeholders', async () => {
        const { service, prisma } = setup()
        prisma.sdEmailTemplate.create.mockImplementation(
            ({ data }: { data: Record<string, unknown> }) =>
                Promise.resolve({
                    id: 'tpl-1',
                    bodyHtml: null,
                    isDefault: false,
                    isActive: true,
                    updatedAt: new Date(),
                    ...data,
                }),
        )

        const template = await service.createTemplateFromQuotation('q-1', {
            name: 'Pricing follow-up',
            subject: 'Quotation Q-000012 rev 2 from AGCTEK',
            bodyText: 'Dear Acme Trading,\n\nTotal 2,350.00 PHP.',
        })

        expect(template).toMatchObject({
            key: 'custom_pricing_follow_up',
            name: 'Pricing follow-up',
            isDefault: false,
            isActive: true,
        })
        expect(prisma.sdEmailTemplate.create).toHaveBeenCalledWith({
            data: {
                key: 'custom_pricing_follow_up',
                name: 'Pricing follow-up',
                module: 'QUOTATION',
                subject: 'Quotation {{quotationNumber}} rev {{revision}} from {{companyName}}',
                bodyText: 'Dear {{customerName}},\n\nTotal {{amount}} {{currency}}.',
            },
        })
    })

    it('adds a suffix when the generated key is already taken', async () => {
        const { service, prisma } = setup()
        prisma.sdEmailTemplate.create
            .mockRejectedValueOnce({ code: 'P2002' })
            .mockImplementationOnce(({ data }: { data: Record<string, unknown> }) =>
                Promise.resolve({ id: 'tpl-2', bodyHtml: null, isDefault: false, isActive: true, updatedAt: new Date(), ...data }),
            )

        const template = await service.createTemplateFromQuotation('q-1', {
            name: 'Follow up',
            subject: 'Your quotation',
            bodyText: 'Hello',
        })

        expect(template.key).toBe('custom_follow_up_2')
    })

    it('refuses to save an empty subject', async () => {
        const { service } = setup()

        await expect(
            service.createTemplateFromQuotation('q-1', { name: 'Empty', subject: '  ', bodyText: 'Hello' }),
        ).rejects.toMatchObject({ response: { code: 'QUOTATION_EMAIL_TEMPLATE_SUBJECT_REQUIRED' } })
    })
})

describe('QuotationEmailService.storedDocument', () => {
    it('404s until the quotation has been emailed', async () => {
        const { service } = setup()
        await expect(service.storedDocument('q-1')).rejects.toBeInstanceOf(NotFoundException)
    })

    it('returns the stored bytes for the revision', async () => {
        const { service, prisma } = setup()
        prisma.sdQuotationDocument.findUnique.mockResolvedValue(STORED_DOCUMENT)
        readStored.mockReturnValue(PDF_BYTES)

        await expect(service.storedDocument('q-1')).resolves.toEqual({
            buffer: PDF_BYTES,
            filename: 'Q-000012_rev2.pdf',
        })
    })
})
