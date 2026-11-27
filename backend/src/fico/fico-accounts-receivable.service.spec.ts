import { Decimal } from '@prisma/client/runtime/library'
import { FicoAccountsReceivableService } from './fico-accounts-receivable.service'

describe('FicoAccountsReceivableService', () => {
    it('does not claim AP supplier invoice events', () => {
        const service = new FicoAccountsReceivableService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            { isSdAccountingPayload: () => false, resolveFlatLines: jest.fn() } as never,
            { resolvePaymentAccount: jest.fn() } as never,
        )
        expect(
            service.supportsAccountingPayload({
                eventType: 'SupplierInvoiceMatched',
                sourceModule: 'MM',
            } as never),
        ).toBe(false)
    })

    it('skips subledger for fully settled POS sales', async () => {
        const journal = {
            createFromAccountingEvent: jest.fn().mockResolvedValue({
                created: true,
                duplicate: false,
                journalEntryId: 'j-1',
            }),
        }
        const service = new FicoAccountsReceivableService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            journal as never,
            {
                isSdAccountingPayload: () => true,
                resolveFlatLines: jest.fn(),
            } as never,
            { resolvePaymentAccount: jest.fn() } as never,
        )
        const result = await service.postFromAccountingEvent({
            eventType: 'PosSaleCompleted',
            outstandingBalance: '0',
            companyId: 'c1',
            postingDate: new Date().toISOString(),
            currencyCode: 'PHP',
            documentType: 'SALES_ORDER',
            documentId: 'so-1',
            sourceModule: 'SD',
        } as never)
        expect(journal.createFromAccountingEvent).toHaveBeenCalled()
        expect(result.journalEntryId).toBe('j-1')
    })
})