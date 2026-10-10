import 'reflect-metadata'
import { PERMISSION_KEY } from '../permissions/permission.guard'
import { QuotationController } from './quotation.controller'
import type { QuotationService } from './quotation.service'

describe('QuotationController', () => {
    const proto = QuotationController.prototype

    it.each([
        ['list', 'read'],
        ['findOne', 'read'],
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
        const controller = new QuotationController(quotations as unknown as QuotationService)
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
