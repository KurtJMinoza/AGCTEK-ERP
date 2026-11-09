import { Decimal } from '@prisma/client/runtime/library'
import { FicoJournalService } from './fico-journal.service'

describe('FicoJournalService', () => {
    it('posts configured MM accounting through draft header, balanced lines, then posted header', async () => {
        const tx = {
            $queryRaw: jest.fn().mockResolvedValue([]),
            ficoFinancialPeriod: {
                findUnique: jest.fn().mockResolvedValue({ status: 'OPEN' }),
            },
            ficoPostingPeriodControl: { findMany: jest.fn().mockResolvedValue([]) },
            ficoJournalEntry: {
                create: jest.fn().mockResolvedValue({ id: 'journal-1' }),
                update: jest.fn().mockResolvedValue({ id: 'journal-1' }),
            },
            ficoJournalEntryLine: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
            ficoAccountingAuditLog: { create: jest.fn().mockResolvedValue({}) },
            mmAccountingEvent: { update: jest.fn().mockResolvedValue({}) },
        }
        const prisma = {
            ficoFinancialPeriod: {
                findFirst: jest
                    .fn()
                    .mockResolvedValue({ id: 'period-1', fiscalYear: 2026 }),
            },
            $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
        }
        const service = new FicoJournalService(
            prisma as never,
            { canPostToPeriod: jest.fn().mockResolvedValue({ allowed: true }) } as never,
            {
                assertAccountPostable: jest.fn().mockResolvedValue({
                    glAccountId: 'inventory',
                    accountCode: '1000',
                    accountName: 'Inventory',
                    accountType: 'ASSET',
                }),
            } as never,
            {
                resolveMmPosting: jest.fn().mockResolvedValue([
                    {
                        debitAccountId: 'inventory',
                        creditAccountId: 'grir',
                        amount: new Decimal(25),
                        materialId: 'material-1',
                        transactionKey: 'GR_IR',
                    },
                ]),
            } as never,
        )

        await expect(
            service.createFromAccountingEvent({
                schemaVersion: 'v2',
                eventType: 'GoodsReceiptPosted',
                companyId: 'company-1',
                postingDate: '2026-09-15T00:00:00.000Z',
                transactionDate: '2026-09-15T00:00:00.000Z',
                currencyCode: 'PHP',
                documentType: 'GOODS_RECEIPT',
                documentId: 'gr-1',
                sourceModule: 'MM',
                accountingEffects: ['INVENTORY_INCREASE', 'GRIR_ACCRUAL'],
                lines: [],
                financiallyRelevant: true,
                mmAccountingEventId: 'event-1',
            }),
        ).resolves.toEqual({
            created: true,
            duplicate: false,
            journalEntryId: 'journal-1',
        })

        expect(tx.ficoJournalEntry.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ status: 'DRAFT' }) }),
        )
        expect(tx.ficoJournalEntryLine.createMany).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.arrayContaining([
                expect.objectContaining({ debitAmount: new Decimal(25), creditAmount: new Decimal(0) }),
                expect.objectContaining({ debitAmount: new Decimal(0), creditAmount: new Decimal(25) }),
            ]) }),
        )
        expect(tx.ficoJournalEntry.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ status: 'POSTED' }) }),
        )
    })
})
