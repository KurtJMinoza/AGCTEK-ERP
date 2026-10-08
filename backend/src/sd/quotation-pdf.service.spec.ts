import 'reflect-metadata'
import { BadRequestException } from '@nestjs/common'
import { QuotationPdfService } from './quotation-pdf.service'
import {
    buildQuotationPdfModel,
    formatQuotationMoney,
    QUOTATION_PDF_DEFAULT_COMPANY,
    type QuotationPdfInput,
} from './quotation-pdf.model'

const baseInput = (overrides: Partial<QuotationPdfInput> = {}): QuotationPdfInput => ({
    quotationNumber: 'Q-000012',
    revision: 1,
    status: 'DRAFT',
    currency: 'PHP',
    validUntil: null,
    createdAt: new Date('2026-10-17T00:00:00.000Z'),
    notes: 'Delivery within 30 days.',
    subtotal: '1234.50',
    totalAmount: '1234.50',
    lines: [
        {
            lineNumber: 1,
            sku: 'SKU-1',
            description: 'A long product description that must wrap across several lines in the PDF table.',
            quantity: '2.000',
            unitPrice: '617.25',
            lineTotal: '1234.50',
        },
    ],
    customer: {
        companyName: 'Acme Corp',
        contactName: 'John Doe',
        email: 'john@acme.test',
        phone: '0917',
    },
    opportunityName: 'Big Deal',
    company: { name: 'AGCTEK', address: 'Manila', tin: '000-000-000' },
    ...overrides,
})

describe('buildQuotationPdfModel', () => {
    it('maps SD quotation data into display-ready values', () => {
        const model = buildQuotationPdfModel(baseInput())
        expect(model.quotation).toMatchObject({
            number: 'Q-000012',
            revision: 1,
            status: 'DRAFT',
            statusLabel: 'Draft',
            date: '2026-10-17',
            validUntil: null,
        })
        expect(model.lines[0]).toEqual({
            lineNumber: 1,
            sku: 'SKU-1',
            description: 'A long product description that must wrap across several lines in the PDF table.',
            quantity: '2',
            unitPrice: 617.25,
            lineTotal: 1234.5,
        })
        expect(model.totals).toEqual({ subtotal: 1234.5, total: 1234.5 })
        expect(model.isDraft).toBe(true)
        expect(model.hasLines).toBe(true)
        expect(model.customer.companyName).toBe('Acme Corp')
        expect(model.opportunityName).toBe('Big Deal')
    })

    it('falls back to the default company and nulls blank fields', () => {
        const model = buildQuotationPdfModel(
            baseInput({ company: null, notes: '   ', opportunityName: null, validUntil: new Date('2026-11-01T00:00:00.000Z') }),
        )
        expect(model.company.name).toBe(QUOTATION_PDF_DEFAULT_COMPANY)
        expect(model.company.address).toBe('')
        expect(model.notes).toBeNull()
        expect(model.opportunityName).toBeNull()
        expect(model.quotation.validUntil).toBe('2026-11-01')
    })

    it('reports no lines', () => {
        const model = buildQuotationPdfModel(baseInput({ lines: [] }))
        expect(model.hasLines).toBe(false)
        expect(model.totals.total).toBe(1234.5)
    })
})

describe('formatQuotationMoney', () => {
    it('renders ASCII-safe PHP with thousands separators and 2 decimals', () => {
        expect(formatQuotationMoney(2350, 'PHP')).toBe('PHP 2,350.00')
        expect(formatQuotationMoney(94000, 'PHP')).toBe('PHP 94,000.00')
        expect(formatQuotationMoney(0, 'PHP')).toBe('PHP 0.00')
    })

    it('never emits a peso sign or a broken glyph', () => {
        expect(formatQuotationMoney(2350, 'PHP')).not.toMatch(/[₱±\u00b1]/)
    })

    it('falls back to PHP for a blank currency and uppercases the code', () => {
        expect(formatQuotationMoney(1000, '')).toBe('PHP 1,000.00')
        expect(formatQuotationMoney(1000, 'usd')).toBe('USD 1,000.00')
    })
})

describe('QuotationPdfService', () => {
    const service = new QuotationPdfService()

    it('streams valid PDF bytes from SD quotation data', async () => {
        const buffer = await service.render(baseInput())
        expect(Buffer.isBuffer(buffer)).toBe(true)
        expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-')
        expect(buffer.length).toBeGreaterThan(400)
    })

    it('rejects a quotation with no lines with a 400', async () => {
        await expect(service.render(baseInput({ lines: [] }))).rejects.toBeInstanceOf(BadRequestException)
    })

    it('does not require the DRAFT status to render', async () => {
        const buffer = await service.render(baseInput({ status: 'SENT', validUntil: new Date('2026-11-01') }))
        expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    })

    const pageCount = (buffer: Buffer) =>
        (buffer.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length

    it('renders a single page for a short quotation (no phantom footer pages)', async () => {
        expect(pageCount(await service.render(baseInput()))).toBe(1)
    })

    it('paginates when there are many lines', async () => {
        const lines = Array.from({ length: 90 }, (_, i) => ({
            lineNumber: i + 1,
            sku: `SKU-${String(i + 1).padStart(3, '0')}`,
            description: 'A recurring product line used to force pagination across several pages.',
            quantity: '1',
            unitPrice: '10.00',
            lineTotal: '10.00',
        }))
        expect(pageCount(await service.render(baseInput({ lines })))).toBeGreaterThan(1)
    })
})