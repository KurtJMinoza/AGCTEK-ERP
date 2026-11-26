import { Decimal } from '@prisma/client/runtime/library'
import { FicoGrIrOpenItemService } from './fico-grir-open-item.service'

describe('FicoGrIrOpenItemService', () => {
    it('clears open item when invoice allocation fully covers receipt valuation', async () => {
        const openItem = {
            id: 'grir-1',
            status: 'OPEN',
            receivedQuantity: new Decimal(10),
            invoicedQuantity: new Decimal(0),
            returnedQuantity: new Decimal(0),
            receiptValuation: new Decimal(100),
            invoiceValuation: new Decimal(0),
            clearedAmount: new Decimal(0),
            outstandingAmount: new Decimal(100),
        }
        const tx = {
            ficoGrIrOpenItem: {
                findUnique: jest
                    .fn()
                    .mockResolvedValueOnce(openItem)
                    .mockResolvedValue(openItem),
                update: jest.fn().mockResolvedValue({}),
            },
        }
        const prisma: any = {}
        const service = new FicoGrIrOpenItemService(prisma)
        await service.applyInvoiceAllocations(tx as any, {
            journalEntryId: 'je-1',
            allocations: [
                {
                    goodsReceiptLineId: 'gr-line-1',
                    allocatedQuantity: new Decimal(10),
                    allocatedAmount: new Decimal(100),
                },
            ],
        })
        expect(tx.ficoGrIrOpenItem.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    status: 'CLEARED',
                    reconciliationStatus: 'FULLY_MATCHED',
                    clearedAmount: new Decimal(100),
                    outstandingAmount: new Decimal(0),
                    lastInvoiceJournalEntryId: 'je-1',
                }),
            }),
        )
    })
})