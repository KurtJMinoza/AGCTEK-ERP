import { Decimal } from '@prisma/client/runtime/library'
import { FicoSalesReturnRefundService } from './fico-sales-return-refund.service'

describe('FicoSalesReturnRefundService', () => {
    it('posts Dr Revenue + Dr VAT / Cr Cash for a paid refund', async () => {
        const journal = {
            createAutomatedEntry: jest.fn().mockResolvedValue({
                created: true,
                duplicate: false,
                journalEntryId: 'je-1',
            }),
        }
        const prisma = {
            ficoCompanyAccountingSettings: {
                findFirst: jest.fn().mockResolvedValue({
                    chartOfAccountsId: 'coa-1',
                }),
            },
            ficoGlAccount: {
                findMany: jest.fn().mockResolvedValue([
                    { id: 'gl-cash', accountCode: '1000' },
                    { id: 'gl-ar', accountCode: '1100' },
                    { id: 'gl-vat', accountCode: '2040' },
                    { id: 'gl-rev', accountCode: '4000' },
                ]),
            },
        }
        const service = new FicoSalesReturnRefundService(
            prisma as never,
            journal as never,
        )

        const result = await service.postFromRefundPaid({
            companyId: 'comp-1',
            returnRequestId: 'rr-1',
            requestNumber: 'RET-1',
            refundId: 'refund-1',
            refundNumber: 'REF-1',
            salesOrderId: 'so-1',
            orderNumber: 'POS-000003',
            invoiceNumber: null,
            customerId: 'cust-1',
            currency: 'PHP',
            refundAmount: '1120.00',
            taxAmount: '120.00',
            refundMethod: 'CASH_REFUND',
            paymentMethod: 'CASH',
            paidAt: '2026-11-25T05:00:00.000Z',
            paidBy: 'cashier',
            idempotencyKey: 'sd-return-refund:refund-1',
        })

        expect(result).toEqual({
            created: true,
            duplicate: false,
            journalEntryId: 'je-1',
        })
        expect(journal.createAutomatedEntry).toHaveBeenCalledWith(
            expect.objectContaining({
                idempotencyKey: 'sd-return-refund:refund-1',
                documentType: 'SD_REVERSAL',
                sourceModule: 'SD',
                sourceDocumentType: 'SD_REFUND',
                sourceDocumentId: 'refund-1',
                reference: 'POS-000003',
                headerText:
                    'Sales return refund · REF-1 · POS-000003',
                lines: expect.arrayContaining([
                    expect.objectContaining({
                        glAccountId: 'gl-rev',
                        debitAmount: 1000,
                        creditAmount: 0,
                    }),
                    expect.objectContaining({
                        glAccountId: 'gl-vat',
                        debitAmount: 120,
                        creditAmount: 0,
                    }),
                    expect.objectContaining({
                        glAccountId: 'gl-cash',
                        debitAmount: 0,
                        creditAmount: 1120,
                    }),
                ]),
            }),
        )
        // Keep Decimal import referenced for future amount assertions.
        expect(new Decimal(1120).toString()).toBe('1120')
    })

    it('skips when company accounting is inactive', async () => {
        const journal = { createAutomatedEntry: jest.fn() }
        const prisma = {
            ficoCompanyAccountingSettings: {
                findFirst: jest.fn().mockResolvedValue(null),
            },
            ficoGlAccount: { findMany: jest.fn() },
        }
        const service = new FicoSalesReturnRefundService(
            prisma as never,
            journal as never,
        )
        const result = await service.postFromRefundPaid({
            companyId: 'comp-1',
            returnRequestId: 'rr-1',
            requestNumber: 'RET-1',
            refundId: 'refund-1',
            refundNumber: 'REF-1',
            salesOrderId: 'so-1',
            orderNumber: 'POS-000003',
            customerId: 'cust-1',
            currency: 'PHP',
            refundAmount: '100.00',
            paidAt: '2026-11-25T05:00:00.000Z',
            idempotencyKey: 'sd-return-refund:refund-1',
        })
        expect(result).toEqual({ created: false, duplicate: false })
        expect(journal.createAutomatedEntry).not.toHaveBeenCalled()
    })
})
