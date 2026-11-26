import { PayloadTooLargeException } from '@nestjs/common'
import { assertQuotationPdfLogo, QUOTATION_PDF_LOGO_MAX_BYTES, quotationPdfLogoSize } from './quotation-pdf-logo'
import { QuotationPdfService } from './quotation-pdf.service'

// 1×1 PNG and 1×1 (progressive) JPEG.
const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
)
const JPEG = Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
    'base64',
)

const quotationInput = {
    quotationNumber: 'Q-000042',
    revision: 1,
    status: 'SENT',
    currency: 'PHP',
    validUntil: new Date('2026-12-31T15:59:59Z'),
    createdAt: new Date('2026-11-01T00:00:00Z'),
    notes: null,
    subtotal: '100',
    totalAmount: '100',
    lines: [{ lineNumber: 1, sku: 'SKU-1', description: 'Item', quantity: '1', unitPrice: '100', lineTotal: '100' }],
    customer: { companyName: 'Acme Trading' },
}

const hasImage = (pdf: Buffer) => pdf.toString('latin1').includes('/Subtype /Image')

describe('quotation PDF logo validation', () => {
    it('accepts PNG and JPEG and reads their pixel size', () => {
        expect(assertQuotationPdfLogo(PNG)).toBe('image/png')
        expect(assertQuotationPdfLogo(JPEG)).toBe('image/jpeg')
        expect(quotationPdfLogoSize(PNG)).toEqual({ width: 1, height: 1 })
        expect(quotationPdfLogoSize(JPEG)).toEqual({ width: 1, height: 1 })
    })

    it.each([
        ['empty', Buffer.alloc(0), /empty/],
        ['an SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), /PNG or JPEG/],
        ['a GIF', Buffer.from('GIF89a......'), /PNG or JPEG/],
        ['a corrupt PNG', Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(24)]), /could not be read/],
    ])('rejects %s', (_label, bytes, message) => {
        expect(() => assertQuotationPdfLogo(bytes)).toThrow(message)
    })

    it('rejects files over 1 MB', () => {
        const huge = Buffer.concat([PNG, Buffer.alloc(QUOTATION_PDF_LOGO_MAX_BYTES)])
        expect(() => assertQuotationPdfLogo(huge)).toThrow(PayloadTooLargeException)
    })
})

describe('QuotationPdfService letterhead logo', () => {
    const service = new QuotationPdfService()

    it('draws the logo instead of the company name, and only when the letterhead is shown', async () => {
        expect(hasImage(await service.render(quotationInput))).toBe(false)
        expect(hasImage(await service.render({ ...quotationInput, logo: PNG }))).toBe(true)
        expect(hasImage(await service.render({ ...quotationInput, logo: JPEG }))).toBe(true)
        expect(
            hasImage(await service.render({ ...quotationInput, logo: PNG, layout: { showLetterhead: false } })),
        ).toBe(false)
    })

    it('falls back to the company name when the stored logo cannot be read', async () => {
        const broken = Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(24)])
        const pdf = await service.render({ ...quotationInput, logo: broken })
        expect(hasImage(pdf)).toBe(false)
    })
})
