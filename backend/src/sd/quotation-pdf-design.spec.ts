import { BadRequestException, PayloadTooLargeException } from '@nestjs/common'
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream } from 'pdf-lib'
import {
    assertQuotationPdfDesign,
    composeOverPdfDesign,
    QUOTATION_PDF_DESIGN_MAX_BYTES,
} from './quotation-pdf-design'
import { quotationPdfTopMargin, resolveQuotationPdfLayout } from './quotation-pdf-layout'
import { QuotationPdfService } from './quotation-pdf.service'

/** A design needs artwork: pdf-lib cannot embed a page without a content stream. */
async function pdfWithPages(count: number) {
    const doc = await PDFDocument.create()
    for (let i = 0; i < count; i++) {
        doc.addPage([595.28, 841.89]).drawRectangle({ x: 0, y: 800, width: 595.28, height: 41.89 })
    }
    return Buffer.from(await doc.save())
}

/** Decoded content stream(s) of the first page. */
async function pageContent(pdf: Buffer) {
    const doc = await PDFDocument.load(pdf)
    const node = doc.getPage(0).node
    const contents = node.Contents()
    const refs = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : []
    return refs
        .map((ref) => doc.context.lookup(ref))
        .filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream)
        .map((stream) => Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1'))
        .join('\n')
}

const quotationInput = (lineCount = 1) => ({
    quotationNumber: 'Q-000042',
    revision: 1,
    status: 'SENT',
    currency: 'PHP',
    validUntil: new Date('2026-12-31T15:59:59Z'),
    createdAt: new Date('2026-11-01T00:00:00Z'),
    notes: null,
    paymentTerms: '50% on order, 50% on delivery',
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
    customer: { companyName: 'Acme Trading' },
})

describe('assertQuotationPdfDesign', () => {
    it('accepts a real single-page PDF', async () => {
        await expect(assertQuotationPdfDesign(await pdfWithPages(1))).resolves.toBeUndefined()
    })

    it.each([
        ['empty', Buffer.alloc(0), /empty/],
        ['not a PDF', Buffer.from('<svg/>'), /must be a PDF/],
        ['a corrupt PDF', Buffer.from('%PDF-1.7 garbage'), /could not be read/],
    ])('rejects %s', async (_label, bytes, message) => {
        await expect(assertQuotationPdfDesign(bytes)).rejects.toThrow(message)
    })

    it('rejects multi-page designs and files over 5 MB', async () => {
        await expect(assertQuotationPdfDesign(await pdfWithPages(2))).rejects.toThrow(
            'The design must be a single page (this PDF has 2)',
        )
        const huge = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(QUOTATION_PDF_DESIGN_MAX_BYTES)])
        await expect(assertQuotationPdfDesign(huge)).rejects.toBeInstanceOf(PayloadTooLargeException)
        await expect(assertQuotationPdfDesign(Buffer.from('nope'))).rejects.toBeInstanceOf(BadRequestException)
    })
})

describe('composeOverPdfDesign (design under, data over)', () => {
    const service = new QuotationPdfService()

    it('puts every quotation page on top of the design page and keeps the page count', async () => {
        const plain = await service.render(quotationInput(60))
        const plainPages = (await PDFDocument.load(plain)).getPageCount()
        expect(plainPages).toBeGreaterThan(1)

        const composed = await service.render({ ...quotationInput(60), design: await pdfWithPages(1) })
        const doc = await PDFDocument.load(composed)

        expect(composed.equals(plain)).toBe(false)
        expect((await pageContent(composed)).match(/ Do/g)).toHaveLength(2)
        expect(doc.getPageCount()).toBe(plainPages)
        expect(doc.getTitle()).toBe('Q-000042 rev 1')
    })

    it('fails soft: a broken design returns the plain quotation unchanged', async () => {
        const plain = await service.render(quotationInput())
        const layout = resolveQuotationPdfLayout(null)
        await expect(composeOverPdfDesign(plain, Buffer.from('%PDF-1.7 broken'), layout)).resolves.toBe(plain)
        await expect(composeOverPdfDesign(plain, null, layout)).resolves.toBe(plain)
    })

    it('starts content below the artwork when contentStartY is set; drawn letterhead can be hidden', () => {
        const layout = resolveQuotationPdfLayout({ contentStartY: 150, showLetterhead: false })
        expect(quotationPdfTopMargin(layout)).toBe(150)
        expect(layout.showLetterhead).toBe(false)
        expect(quotationPdfTopMargin(resolveQuotationPdfLayout({ contentStartY: 900 }))).toBe(400)
        expect(quotationPdfTopMargin(resolveQuotationPdfLayout({}))).toBe(48)
    })
})
