import { Prisma } from '@prisma/client'
import { MM_ACCOUNTING_EFFECT_HINTS } from '../mm/common/mm-accounting-event.types'
import {
    ficoMmTransactionTypeForKey,
    ficoResolveMmTransactionKey,
} from './fico-mm-inventory-determination.policy'
import {
    FICO_RESOLVED_TRANSACTION_KEYS,
    FicoAccountDeterminationService,
} from './fico-account-determination.service'

const Decimal = Prisma.Decimal

describe('FICO MM sales return determination', () => {
    const basePayload = {
        schemaVersion: 'v2' as const,
        companyId: 'co-1',
        postingDate: '2026-11-01T00:00:00.000Z',
        transactionDate: '2026-11-01T00:00:00.000Z',
        currencyCode: 'PHP',
        documentType: 'CUSTOMER_RETURN',
        documentId: 'cr-1',
        sourceModule: 'RETURNS_DISPOSAL',
        accountingEffects: [
            MM_ACCOUNTING_EFFECT_HINTS.INVENTORY_INCREASE,
            MM_ACCOUNTING_EFFECT_HINTS.COGS_EXPENSE,
        ],
        lines: [
            {
                materialId: 'mat-1',
                movementType: 'RETURN_IN',
                quantity: 2,
                unitCost: 5,
                totalCost: 10,
            },
        ],
        financiallyRelevant: true,
    }

    it('resolves CustomerReturnRestocked to SALES_RETURN', () => {
        expect(
            ficoResolveMmTransactionKey({
                ...basePayload,
                eventType: 'CustomerReturnRestocked',
            }),
        ).toBe('SALES_RETURN')
    })

    it('resolves legacy CustomerReturnPosted to SALES_RETURN', () => {
        expect(
            ficoResolveMmTransactionKey({
                ...basePayload,
                eventType: 'CustomerReturnPosted',
            }),
        ).toBe('SALES_RETURN')
    })

    it('keeps GI_COGS for sales goods issue', () => {
        expect(
            ficoResolveMmTransactionKey({
                ...basePayload,
                eventType: 'GoodsIssuePosted',
                documentType: 'GOODS_ISSUE',
                sourceModule: 'STOCK_OPS',
                issuePurpose: 'SALES',
                accountingEffects: [
                    MM_ACCOUNTING_EFFECT_HINTS.INVENTORY_DECREASE,
                    MM_ACCOUNTING_EFFECT_HINTS.COGS_EXPENSE,
                ],
            }),
        ).toBe('GI_COGS')
    })

    it('exposes SALES_RETURN in resolved MM keys and maps transaction type', () => {
        expect(FICO_RESOLVED_TRANSACTION_KEYS).toContain('SALES_RETURN')
        expect(ficoMmTransactionTypeForKey('SALES_RETURN')).toBe('SALES_RETURN')
    })

    it('resolveMmPosting builds Dr Inventory / Cr COGS at cost for SALES_RETURN', async () => {
        const prisma = {
            ficoCompanyAccountingSettings: {
                findUnique: jest.fn().mockResolvedValue({
                    companyId: 'co-1',
                    status: 'ACTIVE',
                    chartOfAccountsId: 'coa-1',
                    chartOfAccounts: { id: 'coa-1', status: 'ACTIVE' },
                    accountDeterminationProfileId: 'prof-1',
                    accountDeterminationProfile: {
                        id: 'prof-1',
                        status: 'ACTIVE',
                    },
                    mmResolutionMode: 'CENTRAL_WITH_LEGACY_FALLBACK',
                    mmLegacyFallbackUntil: null,
                }),
            },
            ficoMmAccountMapping: {
                findMany: jest.fn().mockResolvedValue([
                    {
                        id: 'map-sr',
                        valuationClassId: null,
                        valuationScopeKey: '*',
                        // Mirrored from GI_COGS: inventory debit, COGS credit
                        debitAccountId: 'inv-1200',
                        creditAccountId: 'cogs-5000',
                    },
                ]),
            },
        }
        const postingValidation = {
            validate: jest.fn().mockResolvedValue(undefined),
        }
        const service = new FicoAccountDeterminationService(
            prisma as never,
            postingValidation as never,
        )

        const lines = await service.resolveMmPosting({
            ...basePayload,
            eventType: 'CustomerReturnRestocked',
            idempotencyKey: 'CustomerReturnRestocked:CUSTOMER_RETURN:cr-1',
        })

        const debit = lines.reduce(
            (s, l) => s.plus(l.debitAmount),
            new Decimal(0),
        )
        const credit = lines.reduce(
            (s, l) => s.plus(l.creditAmount),
            new Decimal(0),
        )
        expect(debit.toString()).toBe('10')
        expect(credit.toString()).toBe('10')
        expect(lines).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    glAccountId: 'inv-1200',
                    debitAmount: expect.any(Decimal),
                    creditAmount: expect.any(Decimal),
                    transactionKey: 'SALES_RETURN',
                }),
                expect.objectContaining({
                    glAccountId: 'cogs-5000',
                    transactionKey: 'SALES_RETURN',
                }),
            ]),
        )
        const inv = lines.find((l) => l.glAccountId === 'inv-1200')!
        const cogs = lines.find((l) => l.glAccountId === 'cogs-5000')!
        expect(inv.debitAmount.toString()).toBe('10')
        expect(inv.creditAmount.toString()).toBe('0')
        expect(cogs.debitAmount.toString()).toBe('0')
        expect(cogs.creditAmount.toString()).toBe('10')
    })

    it('resolveMmPosting still resolves GI_COGS as Dr COGS / Cr Inventory', async () => {
        const prisma = {
            ficoCompanyAccountingSettings: {
                findUnique: jest.fn().mockResolvedValue({
                    companyId: 'co-1',
                    status: 'ACTIVE',
                    chartOfAccountsId: 'coa-1',
                    chartOfAccounts: { id: 'coa-1', status: 'ACTIVE' },
                    accountDeterminationProfileId: 'prof-1',
                    accountDeterminationProfile: {
                        id: 'prof-1',
                        status: 'ACTIVE',
                    },
                    mmResolutionMode: 'CENTRAL_WITH_LEGACY_FALLBACK',
                    mmLegacyFallbackUntil: null,
                }),
            },
            ficoMmAccountMapping: {
                findMany: jest.fn().mockResolvedValue([
                    {
                        id: 'map-gi',
                        valuationClassId: null,
                        valuationScopeKey: '*',
                        debitAccountId: 'cogs-5000',
                        creditAccountId: 'inv-1200',
                    },
                ]),
            },
        }
        const postingValidation = {
            validate: jest.fn().mockResolvedValue(undefined),
        }
        const service = new FicoAccountDeterminationService(
            prisma as never,
            postingValidation as never,
        )

        const lines = await service.resolveMmPosting({
            ...basePayload,
            eventType: 'GoodsIssuePosted',
            documentType: 'GOODS_ISSUE',
            sourceModule: 'STOCK_OPS',
            issuePurpose: 'SALES',
            accountingEffects: [
                MM_ACCOUNTING_EFFECT_HINTS.INVENTORY_DECREASE,
                MM_ACCOUNTING_EFFECT_HINTS.COGS_EXPENSE,
            ],
            idempotencyKey: 'GoodsIssuePosted:GOODS_ISSUE:gi-1',
        })

        const cogs = lines.find((l) => l.glAccountId === 'cogs-5000')!
        const inv = lines.find((l) => l.glAccountId === 'inv-1200')!
        expect(cogs.debitAmount.toString()).toBe('10')
        expect(inv.creditAmount.toString()).toBe('10')
        expect(cogs.transactionKey).toBe('GI_COGS')
    })
})
