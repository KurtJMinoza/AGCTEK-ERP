import { NotFoundException } from '@nestjs/common'
import { PERMISSION_KEY } from '../permissions/permission.guard'
import { PdfLayoutProfileService } from './pdf-layout-profile.service'
import { PdfLayoutProfileController } from './quotation-email.controller'
import { buildQuotationPdfModel } from './quotation-pdf.model'
import {
    DEFAULT_QUOTATION_PDF_LAYOUT,
    QUOTATION_PDF_DISCLAIMER,
    resolveQuotationPdfLayout,
} from './quotation-pdf-layout'

describe('resolveQuotationPdfLayout', () => {
    it('reproduces the original PDF when there is no profile', () => {
        expect(resolveQuotationPdfLayout(null)).toEqual(DEFAULT_QUOTATION_PDF_LAYOUT)
        expect(resolveQuotationPdfLayout(undefined).disclaimer).toBe(QUOTATION_PDF_DISCLAIMER)
    })

    it('keeps valid keys, clamps margins and ignores wrong types or unknown keys', () => {
        expect(
            resolveQuotationPdfLayout({
                showTin: false,
                showOpportunity: 'no',
                marginTop: 10,
                marginSide: 120.4,
                disclaimer: '  Prices exclude VAT.  ',
                margins: { top: 50 },
            }),
        ).toEqual({
            ...DEFAULT_QUOTATION_PDF_LAYOUT,
            showTin: false,
            marginTop: 24,
            marginSide: 96,
            disclaimer: 'Prices exclude VAT.',
        })
    })

    it('feeds the PDF model (flags and disclaimer) without touching quotation data', () => {
        const model = buildQuotationPdfModel({
            quotationNumber: 'Q-1',
            revision: 1,
            status: 'SENT',
            currency: 'PHP',
            validUntil: null,
            createdAt: new Date('2026-11-01T00:00:00Z'),
            notes: null,
            subtotal: '100',
            totalAmount: '100',
            lines: [{ lineNumber: 1, sku: 'A', description: 'Item', quantity: '1', unitPrice: '100', lineTotal: '100' }],
            customer: { companyName: 'Acme' },
            layout: { showPaymentTerms: false, disclaimer: 'Custom footer' },
        })
        expect(model.layout.showPaymentTerms).toBe(false)
        expect(model.disclaimer).toBe('Custom footer')
        expect(model.totals.total).toBe(100)
    })
})

describe('PdfLayoutProfileService', () => {
    const row = (config: Record<string, unknown> | null) => ({
        id: 'pdf_layout_default',
        key: 'default',
        name: 'Default quotation',
        config,
        isDefault: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    })

    function setup(config: Record<string, unknown> | null = { showTin: true, disclaimer: 'Old' }) {
        const prisma = {
            sdPdfLayoutProfile: {
                findMany: jest.fn().mockResolvedValue([row(config)]),
                findUnique: jest.fn().mockResolvedValue(row(config)),
                update: jest.fn(async ({ data }: { data: { config?: Record<string, unknown>; name?: string } }) =>
                    ({ ...row(data.config ?? config), name: data.name ?? 'Default quotation' })),
            },
        }
        return { prisma, service: new PdfLayoutProfileService(prisma as never) }
    }

    it('lists profiles with the resolved layout the next PDF will use', async () => {
        const [profile] = await setup(null).service.list()
        expect(profile).toMatchObject({ key: 'default', isDefault: true, layout: DEFAULT_QUOTATION_PDF_LAYOUT })
    })

    it('merges layout keys over the stored config; an empty disclaimer restores the default', async () => {
        const { prisma, service } = setup()

        const updated = await service.update('default', { config: { showTin: false, disclaimer: '' } })

        expect(prisma.sdPdfLayoutProfile.update).toHaveBeenCalledWith({
            where: { id: 'pdf_layout_default' },
            data: { config: { showTin: false } },
        })
        expect(updated.layout).toMatchObject({ showTin: false, disclaimer: QUOTATION_PDF_DISCLAIMER })
    })

    it('404s for an unknown profile', async () => {
        const { prisma, service } = setup()
        prisma.sdPdfLayoutProfile.findUnique.mockResolvedValue(null)
        await expect(service.update('nope', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException)
    })

    it('reads with sd.quotations:read and edits with sd.quotations:update', () => {
        const meta = (handler: 'list' | 'update') =>
            Reflect.getMetadata(PERMISSION_KEY, PdfLayoutProfileController.prototype[handler])
        expect(meta('list')).toEqual({ resource: 'sd.quotations', action: 'read' })
        expect(meta('update')).toEqual({ resource: 'sd.quotations', action: 'update' })
    })
})
