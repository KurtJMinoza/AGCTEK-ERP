import { Prisma } from '@prisma/client'
import { FicoSdPostingService } from './fico-sd-posting.service'

describe('FicoSdPostingService merchant fees', () => {
    it('splits tender into net clearing and bank charges', async () => {
        const prisma = {
            ficoCompanyAccountingSettings: {
                findFirst: jest.fn().mockResolvedValue({
                    chartOfAccountsId: 'coa-1',
                    defaultSalesRevenueAccountId: 'rev',
                    defaultTaxOutputAccountId: 'tax',
                    defaultReceivableAccountId: 'ar',
                    defaultCashAccountId: 'cash',
                }),
            },
            sdPaymentMethod: {
                findUnique: jest.fn().mockResolvedValue({
                    merchantFeeRate: new Prisma.Decimal('2.5'),
                    merchantFeeFlat: null,
                }),
            },
            sdSalesOrder: { findUnique: jest.fn() },
            ficoGlAccount: { findFirst: jest.fn().mockResolvedValue({ id: 'gl-card' }) },
        }
        const accountResolution = {
            resolveDetermination: jest
                .fn()
                .mockImplementation(
                    async ({
                        transactionKey,
                    }: {
                        transactionKey: string
                        dimensions?: { side?: string }
                    }) => {
                        if (transactionKey === 'BANK_CHARGES') {
                            return {
                                glAccountId: 'gl-fee',
                                resolution: { debitLines: [{ glAccountId: 'gl-fee' }] },
                            }
                        }
                        if (transactionKey === 'CUSTOMER_ADVANCE') {
                            return {
                                glAccountId: 'gl-adv',
                                resolution: { creditLines: [{ glAccountId: 'gl-adv' }] },
                            }
                        }
                        return {
                            glAccountId: 'gl-x',
                            resolution: { debitLines: [{ glAccountId: 'gl-x' }] },
                        }
                    },
                ),
        }
        const treasuryPayment = {
            resolvePaymentAccount: jest
                .fn()
                .mockResolvedValue({ glAccountId: 'gl-card', source: 'PAYMENT_METHOD_GL' }),
        }
        const salesRevenueResolution = {
            resolveSalesRevenueGlAccountId: jest.fn(),
        }
        const service = new FicoSdPostingService(
            prisma as never,
            accountResolution as never,
            treasuryPayment as never,
            salesRevenueResolution as never,
        )
        const lines = await service.resolveFlatLines({
            sourceModule: 'SD',
            eventType: 'PosCustomerDepositCompleted',
            companyId: 'c1',
            postingDate: new Date().toISOString(),
            currencyCode: 'PHP',
            documentType: 'CUSTOMER_DEPOSIT',
            documentId: 'dep-1',
            depositAmount: '1000',
            reference: 'DEP-1',
            customerId: 'cust',
            tenders: [{ method: 'CARD', amount: '1000' }],
        } as never)
        const debit = (lines as Array<{ debit: Prisma.Decimal; credit: Prisma.Decimal }>).reduce(
            (s, l) => s.plus(l.debit),
            new Prisma.Decimal(0),
        )
        const credit = (lines as Array<{ debit: Prisma.Decimal; credit: Prisma.Decimal }>).reduce(
            (s, l) => s.plus(l.credit),
            new Prisma.Decimal(0),
        )
        expect(debit.eq(credit)).toBe(true)
        expect(
            (lines as Array<{ description: string }>).some((l) =>
                l.description.includes('Merchant fee'),
            ),
        ).toBe(true)
    })
})