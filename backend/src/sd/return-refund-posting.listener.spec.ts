import { ReturnRefundPostingListener } from './return-refund-posting.listener'
import type { SdSalesReturnRefundPaidPayload } from './return-refund-posting.listener'

describe('ReturnRefundPostingListener', () => {
    const baseEvent: SdSalesReturnRefundPaidPayload = {
        returnRequestId: 'rr-1',
        requestNumber: 'RR-1',
        refundId: 'ref-1',
        refundNumber: 'REF-1',
        creditMemoId: 'cm-1',
        creditMemoNumber: 'CM-1',
        salesOrderId: 'so-1',
        orderNumber: 'SO-1',
        companyId: 'co-1',
        customerId: 'cust-1',
        currency: 'PHP',
        totalAmount: '200.00',
        taxAmount: '0',
        refundMethod: 'CASH_REFUND',
        originalPaymentMethod: 'CASH',
        preferredResolution: 'REFUND',
        refundStatus: 'PAID',
        idempotencyKey: 'sales-return-refund:rr-1:ref-1',
    }

    function build(recordAndDispatch = jest.fn().mockResolvedValue(undefined)) {
        const accounting = { recordAndDispatch }
        const listener = new ReturnRefundPostingListener(accounting as never)
        return { listener, recordAndDispatch }
    }

    it('dispatches SdSalesReturnRefundPaid on PAID refund', async () => {
        const { listener, recordAndDispatch } = build()
        await listener.handleRefundPaid(baseEvent)
        expect(recordAndDispatch).toHaveBeenCalledWith(
            expect.objectContaining({
                eventType: 'SdSalesReturnRefundPaid',
                documentType: 'RETURN_REQUEST',
                documentId: 'rr-1',
                companyId: 'co-1',
                idempotencyKey: 'sales-return-refund:rr-1:ref-1',
                payload: expect.objectContaining({
                    refundId: 'ref-1',
                    totalAmount: '200.00',
                    refundMethod: 'CASH_REFUND',
                }),
            }),
        )
    })

    it('unwraps SD event envelope payload', async () => {
        const { listener, recordAndDispatch } = build()
        await listener.handleRefundPaid({
            eventId: 'e1',
            eventType: 'ReturnRefundPaid',
            eventVersion: 'v1',
            occurredAt: new Date().toISOString(),
            payload: baseEvent,
        } as never)
        expect(recordAndDispatch).toHaveBeenCalledTimes(1)
    })

    it('skips REPLACEMENT resolution (no commercial journal)', async () => {
        const { listener, recordAndDispatch } = build()
        await listener.handleRefundPaid({
            ...baseEvent,
            preferredResolution: 'REPLACEMENT',
        })
        expect(recordAndDispatch).not.toHaveBeenCalled()
    })

    it('skips NOT_REQUIRED refund status', async () => {
        const { listener, recordAndDispatch } = build()
        await listener.handleRefundPaid({
            ...baseEvent,
            refundStatus: 'NOT_REQUIRED',
        })
        expect(recordAndDispatch).not.toHaveBeenCalled()
    })

    it('ignores incomplete events', async () => {
        const { listener, recordAndDispatch } = build()
        await listener.handleRefundPaid({
            ...baseEvent,
            companyId: '',
        })
        expect(recordAndDispatch).not.toHaveBeenCalled()
    })
})
