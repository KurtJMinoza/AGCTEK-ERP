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
                        glAccountId: 'inventory',
                        debitAmount: new Decimal(25),
                        creditAmount: new Decimal(0),
                        description: 'Inventory receipt',
                        materialId: 'material-1',
                        transactionKey: 'INVENTORY',
                        resolutionSource: 'CENTRAL_RULE',
                        accountDeterminationRuleId: 'rule-1',
                    },
                    {
                        glAccountId: 'grir',
                        debitAmount: new Decimal(0),
                        creditAmount: new Decimal(25),
                        description: 'GR/IR clearing',
                        materialId: 'material-1',
                        transactionKey: 'GR_IR',
                        resolutionSource: 'CENTRAL_RULE',
                        accountDeterminationRuleId: 'rule-2',
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

        // Every resolved rule line must reach the posting engine, not just the first pair.
        const postedRequest =
            postingEngine.persistJournalInTransaction.mock.calls[0][1]
        expect(postedRequest.lines).toEqual([
            expect.objectContaining({
                glAccountId: 'inventory',
                debit: new Decimal(25),
                credit: new Decimal(0),
            }),
            expect.objectContaining({
                glAccountId: 'grir',
                debit: new Decimal(0),
                credit: new Decimal(25),
            }),
        ])
        expect(postedRequest.metadata.determinationRuleIds).toEqual([
            'rule-1',
            'rule-2',
        ])
    })
})