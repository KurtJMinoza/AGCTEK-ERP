import 'reflect-metadata'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { PERMISSION_KEY } from '../permissions/permission.guard'
import { QuotationController } from './quotation.controller'
import type { QuotationService } from './quotation.service'
import type { QuotationPdfService } from './quotation-pdf.service'

describe('QuotationController', () => {
    const proto = QuotationController.prototype

    it.each([
        ['list', 'read'],
        ['findOne', 'read'],
        ['downloadPdf', 'read'],
        ['updateDraft', 'update'],
        ['send', 'update'],
        ['revise', 'update'],
        ['accept', 'update'],
        ['reject', 'update'],
        ['cancel', 'update'],
    ] as const)('%s requires sd.quotations:%s', (handler, action) => {
        expect(Reflect.getMetadata(PERMISSION_KEY, proto[handler])).toEqual({ resource: 'sd.quotations', action })
    })

    it('has no create endpoint (quotations start from a CRM opportunity)', () => {
        expect(Object.getOwnPropertyNames(proto)).not.toContain('create')
    })

    it('passes the authenticated user as the actor', async () => {
        const quotations = {
            updateDraft: jest.fn(),
            send: jest.fn(),
            revise: jest.fn(),
            accept: jest.fn(),
            reject: jest.fn(),
            cancel: jest.fn(),
        }
        const controller = new QuotationController(
            quotations as unknown as QuotationService,
            {} as QuotationPdfService,
        )
        const user = { id: 'user-7' } as never

        await controller.updateDraft('q-1', { notes: 'x' }, user)
        await controller.send('q-1', { validUntil: '2026-12-01' }, user)
        await controller.revise('q-1', { reason: 'CUSTOMER_REQUEST' }, user)
        await controller.accept('q-1', {}, user)
        await controller.reject('q-1', { reason: 'price' }, user)
        await controller.cancel('q-1', {}, user)

        expect(quotations.updateDraft).toHaveBeenCalledWith('q-1', { notes: 'x' }, 'user-7')
        expect(quotations.send).toHaveBeenCalledWith('q-1', { validUntil: '2026-12-01' }, 'user-7')
        expect(quotations.revise).toHaveBeenCalledWith('q-1', { reason: 'CUSTOMER_REQUEST' }, 'user-7')
        expect(quotations.accept).toHaveBeenCalledWith('q-1', {}, 'user-7')
        expect(quotations.reject).toHaveBeenCalledWith('q-1', { reason: 'price' }, 'user-7')
        expect(quotations.cancel).toHaveBeenCalledWith('q-1', {}, 'user-7')
    })
})

describe('QuotationController.downloadPdf', () => {
    function setup() {
        const input = { quotationNumber: 'Q-000012', revision: 3 }
        const quotations = {
            pdfInput: jest.fn().mockResolvedValue(input),
            // Mutation / handoff surfaces that must never be touched by a download.
            updateDraft: jest.fn(),
            send: jest.fn(),
            revise: jest.fn(),
            accept: jest.fn(),
            reject: jest.fn(),
            cancel: jest.fn(),
            claimForConversion: jest.fn(),
        }
        const doc = { end: jest.fn() }
        const pdf = { createDocument: jest.fn(() => doc) }
        const controller = new QuotationController(
            quotations as unknown as QuotationService,
            pdf as unknown as QuotationPdfService,
        )
        const headers: Record<string, string> = {}
        const res: { header: (key: string, value: string) => void; send: (body: unknown) => unknown } = {
            header: jest.fn((key: string, value: string) => {
                headers[key] = value
            }),
            send: jest.fn((body: unknown) => body),
        }
        return { input, quotations, doc, pdf, controller, res, headers }
    }

    it('streams an attachment PDF named after the quotation number and revision', async () => {
        const { input, quotations, doc, pdf, controller, res, headers } = setup()
        await controller.downloadPdf('q-1', undefined, res as never)

        expect(quotations.pdfInput).toHaveBeenCalledWith('q-1')
        expect(pdf.createDocument).toHaveBeenCalledWith(input)
        expect(headers['Content-Type']).toBe('application/pdf')
        expect(headers['Content-Disposition']).toBe('attachment; filename="Q-000012_rev3.pdf"')
        expect(doc.end).toHaveBeenCalledTimes(1)
        expect(res.send).toHaveBeenCalledWith(doc)
    })

    it('serves inline when ?inline=1', async () => {
        const { controller, res, headers } = setup()
        await controller.downloadPdf('q-1', '1', res as never)
        expect(headers['Content-Disposition']).toBe('inline; filename="Q-000012_rev3.pdf"')
    })

    it('propagates 400 (no lines) from the generator', async () => {
        const { pdf, controller, res } = setup()
        pdf.createDocument.mockImplementationOnce(() => {
            throw new BadRequestException('A quotation without lines cannot be turned into a PDF')
        })
        await expect(controller.downloadPdf('q-1', undefined, res as never)).rejects.toBeInstanceOf(
            BadRequestException,
        )
        expect(res.send).not.toHaveBeenCalled()
    })

    it('propagates 404 when the quotation does not exist', async () => {
        const { quotations, controller, res } = setup()
        quotations.pdfInput.mockRejectedValueOnce(new NotFoundException('Quotation not found'))
        await expect(controller.downloadPdf('missing', undefined, res as never)).rejects.toBeInstanceOf(
            NotFoundException,
        )
        expect(res.send).not.toHaveBeenCalled()
    })

    it('never mutates the quotation (no status/send/revise/conversion calls)', async () => {
        const { quotations, controller, res } = setup()
        await controller.downloadPdf('q-1', undefined, res as never)
        for (const method of [
            'updateDraft',
            'send',
            'revise',
            'accept',
            'reject',
            'cancel',
            'claimForConversion',
        ] as const) {
            expect(quotations[method]).not.toHaveBeenCalled()
        }
    })
})
