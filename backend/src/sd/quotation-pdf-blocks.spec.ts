import PDFDocumentImport from 'pdfkit'
import {
    DEFAULT_QUOTATION_PDF_BLOCKS,
    DEFAULT_QUOTATION_PDF_LAYOUT,
    quotationPdfBlocksProblem,
    resolveQuotationPdfLayout,
    type QuotationPdfBlocks,
} from './quotation-pdf-layout'
import { QuotationPdfService } from './quotation-pdf.service'

const blocks = (patch: Partial<QuotationPdfBlocks> = {}): QuotationPdfBlocks => ({
    ...structuredClone(DEFAULT_QUOTATION_PDF_BLOCKS),
    ...patch,
})

const quotationInput = (lineCount = 1, customerName = 'Acme Trading') => ({
    quotationNumber: 'Q-000042',
    revision: 1,
    status: 'SENT',
    currency: 'PHP',
    validUntil: new Date('2026-12-31T15:59:59Z'),
    createdAt: new Date('2026-11-01T00:00:00Z'),
    notes: null,
    subtotal: '100',
    totalAmount: '100',
    lines: Array.from({ length: lineCount }, (_, i) => ({
        lineNumber: i + 1,
        sku: `SKU-${i + 1}`,
        description: `Item ${i + 1}`,
        quantity: '1',
        unitPrice: '100',
        lineTotal: '100',
    })),
    customer: { companyName: customerName, contactName: 'Pat Cruz', email: 'pat@acme.test', phone: '+63 900' },
})

type TextCall = { text: string; x: number; y: number; options: Record<string, unknown> }

/** Every `doc.text(text, x, y, options)` the renderer makes. */
async function textCalls(layout: Record<string, unknown> | null, input = quotationInput()) {
    const proto = (PDFDocumentImport as unknown as { prototype: { text: (...args: unknown[]) => unknown } }).prototype
    const spy = jest.spyOn(proto, 'text')
    try {
        await new QuotationPdfService().render({ ...input, layout })
        return spy.mock.calls.map(([text, x, y, options]) => ({
            text: String(text),
            x: x as number,
            y: y as number,
            options: (options ?? {}) as Record<string, unknown>,
        })) as TextCall[]
    } finally {
        spy.mockRestore()
    }
}

describe('quotation PDF box layout rules', () => {
    it('the starting boxes are valid and resolve unchanged', () => {
        expect(quotationPdfBlocksProblem(DEFAULT_QUOTATION_PDF_BLOCKS, DEFAULT_QUOTATION_PDF_LAYOUT)).toBeNull()
        expect(resolveQuotationPdfLayout({ blocks: DEFAULT_QUOTATION_PDF_BLOCKS }).blocks).toEqual(
            DEFAULT_QUOTATION_PDF_BLOCKS,
        )
        expect(resolveQuotationPdfLayout({}).blocks).toBeNull()
    })

    it.each([
        ['a box ending below the table start', blocks({ customer: { x: 48, y: 132, width: 240, height: 120 } }), /Customer box must end above/],
        ['a box off the page', blocks({ title: { x: 500, y: 48, width: 200, height: 72 } }), /Title box must stay on the page/],
        ['a box too small', blocks({ details: { x: 307, y: 132, width: 30, height: 80 } }), /Details box must be at least/],
        ['a lines table too narrow', blocks({ lines: { x: 48, y: 228, width: 400 } }), /at least 460 pt wide/],
        ['a lines table off the page', blocks({ lines: { x: 200, y: 228, width: 499 } }), /lines table must stay on the page/],
        ['a lines table with no room left on page 1', blocks({ lines: { x: 48, y: 700, width: 499 } }), /must start between/],
    ])('rejects %s', (_label, layoutBlocks, message) => {
        expect(quotationPdfBlocksProblem(layoutBlocks, DEFAULT_QUOTATION_PDF_LAYOUT)).toMatch(message)
        // A stored layout that is not drawable falls back to the classic header instead of breaking PDFs.
        expect(resolveQuotationPdfLayout({ blocks: layoutBlocks }).blocks).toBeNull()
    })

    it('ignores incomplete or malformed stored boxes', () => {
        const { details: _details, ...partial } = blocks()
        expect(resolveQuotationPdfLayout({ blocks: partial }).blocks).toBeNull()
        expect(resolveQuotationPdfLayout({ blocks: { ...blocks(), lines: { x: 'a' } } }).blocks).toBeNull()
    })
})

describe('QuotationPdfService box layout', () => {
    it('draws each block at its box and starts the table at the lines box', async () => {
        const layout = blocks({
            title: { x: 48, y: 48, width: 220, height: 72 },
            letterhead: { x: 300, y: 48, width: 240, height: 72 },
            customer: { x: 60, y: 140, width: 200, height: 90 },
            details: { x: 320, y: 140, width: 220, height: 90 },
            lines: { x: 60, y: 260, width: 480 },
        })
        const calls = await textCalls({ blocks: layout })
        const at = (text: string) => calls.find((call) => call.text === text)!

        expect(at('QUOTATION')).toMatchObject({ x: 48, y: 48, options: { width: 220, align: 'right' } })
        expect(at('CUSTOMER')).toMatchObject({ x: 60, y: 140, options: { width: 200, ellipsis: true } })
        expect(at('DETAILS')).toMatchObject({ x: 320, y: 140 })
        expect(at('AGCTEK')).toMatchObject({ x: 300, y: 48 })
        expect(at('#')).toMatchObject({ x: 60, y: 261 })
        expect(at('SKU')).toMatchObject({ x: 86 })
    })

    it('cuts text to its box: a 30 pt customer box only fits the label and the name', async () => {
        const layout = blocks({ customer: { x: 48, y: 132, width: 240, height: 30 } })
        const texts = (await textCalls({ blocks: layout })).map((call) => call.text)
        expect(texts).toContain('CUSTOMER')
        expect(texts).toContain('Acme Trading')
        expect(texts).not.toContain('pat@acme.test')
    })

    it('keeps the lines box left edge on continuation pages', async () => {
        const layout = blocks({ lines: { x: 70, y: 228, width: 470 } })
        const headers = (await textCalls({ blocks: layout }, quotationInput(60))).filter((call) => call.text === '#')
        expect(headers.length).toBeGreaterThan(1)
        expect(headers.every((call) => call.x === 70)).toBe(true)
    })

    it('hides the letterhead box when the drawn letterhead is off', async () => {
        const texts = (await textCalls({ blocks: blocks(), showLetterhead: false })).map((call) => call.text)
        expect(texts).not.toContain('AGCTEK')
        expect(texts).toContain('QUOTATION')
    })

    it('without boxes the classic header is unchanged', async () => {
        const calls = await textCalls(null)
        expect(calls.find((call) => call.text === 'CUSTOMER')).toMatchObject({ x: 48 })
        expect(calls.find((call) => call.text === 'CUSTOMER')!.options.ellipsis).toBeUndefined()
    })
})
