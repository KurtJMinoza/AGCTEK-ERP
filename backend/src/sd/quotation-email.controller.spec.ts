import 'reflect-metadata'
import { PERMISSION_KEY } from '../permissions/permission.guard'
import { QuotationEmailController, QuotationEmailTemplateController } from './quotation-email.controller'
import type { QuotationEmailService } from './quotation-email.service'

describe('QuotationEmailController', () => {
    const proto = QuotationEmailController.prototype

    it.each([
        ['send', 'update'],
        ['resend', 'update'],
        ['preview', 'read'],
        ['saveTemplate', 'update'],
        ['downloadStoredPdf', 'read'],
    ] as const)('%s requires sd.quotations:%s', (handler, action) => {
        expect(Reflect.getMetadata(PERMISSION_KEY, proto[handler])).toEqual({
            resource: 'sd.quotations',
            action,
        })
    })

    it('passes the authenticated user as the email actor', async () => {
        const email = { send: jest.fn().mockResolvedValue({ sent: true }) }
        const controller = new QuotationEmailController(email as unknown as QuotationEmailService)
        const user = { id: 'user-7' } as never
        const dto = { subject: 'Your quote', bodyText: 'Hello' }

        await controller.send('q-1', dto, user)
        await controller.resend('q-1', user)

        expect(email.send).toHaveBeenNthCalledWith(1, 'q-1', dto, 'user-7')
        expect(email.send).toHaveBeenNthCalledWith(2, 'q-1', { isResend: true }, 'user-7')
    })

    it('saves the composer copy as a template for the quotation', async () => {
        const email = { createTemplateFromQuotation: jest.fn().mockResolvedValue({ key: 'custom_x' }) }
        const controller = new QuotationEmailController(email as unknown as QuotationEmailService)
        const dto = { name: 'Follow up', subject: 'Your quote', bodyText: 'Hello' }

        await controller.saveTemplate('q-1', dto)

        expect(email.createTemplateFromQuotation).toHaveBeenCalledWith('q-1', dto)
    })

    it('streams the stored PDF privately, named after the revision', async () => {
        const buffer = Buffer.from('%PDF-1.4 stored')
        const email = {
            storedDocument: jest.fn().mockResolvedValue({ buffer, filename: 'Q-000012_rev2.pdf' }),
        }
        const controller = new QuotationEmailController(email as unknown as QuotationEmailService)
        const headers: Record<string, string> = {}
        const res = {
            header: jest.fn((key: string, value: string) => {
                headers[key] = value
            }),
            send: jest.fn((body: unknown) => body),
        }

        await controller.downloadStoredPdf('q-1', undefined, res as never)

        expect(headers['Content-Type']).toBe('application/pdf')
        expect(headers['Content-Disposition']).toBe('attachment; filename="Q-000012_rev2.pdf"')
        expect(headers['Cache-Control']).toBe('private, no-store')
        expect(res.send).toHaveBeenCalledWith(buffer)
    })

    it('serves the stored PDF inline when ?inline=1', async () => {
        const email = {
            storedDocument: jest.fn().mockResolvedValue({ buffer: Buffer.from('%PDF'), filename: 'Q_rev1.pdf' }),
        }
        const controller = new QuotationEmailController(email as unknown as QuotationEmailService)
        const headers: Record<string, string> = {}
        const res = {
            header: jest.fn((key: string, value: string) => {
                headers[key] = value
            }),
            send: jest.fn(),
        }

        await controller.downloadStoredPdf('q-1', '1', res as never)
        expect(headers['Content-Disposition']).toBe('inline; filename="Q_rev1.pdf"')
    })
})

describe('QuotationEmailTemplateController', () => {
    const proto = QuotationEmailTemplateController.prototype

    it.each([
        ['list', 'read'],
        ['findOne', 'read'],
        ['update', 'update'],
    ] as const)('%s requires emails.templates:%s', (handler, action) => {
        expect(Reflect.getMetadata(PERMISSION_KEY, proto[handler])).toEqual({
            resource: 'emails.templates',
            action,
        })
    })
})
