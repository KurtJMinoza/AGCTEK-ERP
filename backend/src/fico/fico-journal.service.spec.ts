import { Decimal } from '@prisma/client/runtime/library'
import { FicoJournalService } from './fico-journal.service'

describe('FicoJournalService', () => {
    it('posts configured MM accounting through the centralized automatic posting path', async () => {
        const prisma = {
            ficoJournalEntry: {
                findUnique: jest.fn().mockResolvedValue(null),
            },
            ficoFinancialPeriod: {
                findFirst: jest
                    .fn()
                    .mockResolvedValue({
                        id: 'period-1',
                        fiscalYear: 2026,
                        status: 'OPEN',
                    }),
            },
            $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
                callback({
                    $queryRaw: jest.fn(),
                    ficoFinancialPeriod: {
                        findUnique: jest.fn().mockResolvedValue({ status: 'OPEN' }),
                    },
                    ficoJournalEntry: {
                        create: jest.fn().mockResolvedValue({
                            id: 'journal-1',
                            documentNumber: 'JE000001',
                            postedAt: new Date(),
                        }),
                    },
                    ficoAccountingAuditLog: { create: jest.fn() },
                    mmAccountingEvent: { update: jest.fn() },
                }),
            ),
        }
        const postingEngine = {
            allocateDocumentNumber: jest.fn().mockResolvedValue('JE-2026-000001'),
            persistJournalInTransaction: jest.fn().mockResolvedValue({
                id: 'journal-1',
                documentNumber: 'JE000001',
                postedAt: new Date(),
            }),
            assertBalancedLines: jest.fn().mockReturnValue({
                totalDebit: new Decimal(25),
                totalCredit: new Decimal(25),
            }),
        }
        const service = new FicoJournalService(
            prisma as never,
            { canPostToPeriod: jest.fn().mockResolvedValue({ allowed: true }) } as never,
            { validate: jest.fn().mockResolvedValue({ ok: true }) } as never,
            postingEngine as never,
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
    })
})