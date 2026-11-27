import { BadRequestException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { FicoSdPostingService } from './fico-sd-posting.service'

describe('FicoSdPostingService split POS tender', () => {
    it('debits cash and card clearing accounts separately (never double cash)', async () => {
        const prisma = {
            ficoCompanyAccountingSettings: {
                findFirst: jest.fn().mockResolvedValue({
                    chartOfAccountsId: 'coa-1',
                    defaultSalesRevenueAccountId: 'rev-food',
                    defaultTaxOutputAccountId: 'tax-gl',
                    defaultReceivableAccountId: 'ar-gl',
                    defaultCashAccountId: 'cash-gl',
                }),
            },
            sdSalesOrder: {
                findUnique: jest.fn().mockResolvedValue({
                    branchId: 'br-1',
                    lines: [
                        {
                            taxAmount: new Prisma.Decimal(0),
                            lineTotal: new Prisma.Decimal(820),
                            materialId: 'mat-1',
                            material: { valuationClassId: 'vc-perfume' },
                        },
                    ],
                }),
            },
            sdPaymentMethod: {
                findUnique: jest.fn().mockResolvedValue(null),
            },
        }
        const accountResolution = {
            resolveDetermination: jest
                .fn()
                .mockImplementation(
                    async ({
                        transactionKey,
                        dimensions,
                    }: {
                        transactionKey: string
                        dimensions?: { valuationClassId?: string }
                    }) => {
                        const base = {
                            glAccountId: 'rev-food',
                            resolution: {
                                creditLines: [{ glAccountId: 'rev-food' }],
                                debitLines: [],
                            },
                        }
                        if (
                            transactionKey === 'SALES_REVENUE' &&
                            dimensions?.valuationClassId === 'vc-perfume'
                        ) {
                            return {
                                glAccountId: 'rev-perfume',
                                resolution: {
                                    creditLines: [{ glAccountId: 'rev-perfume' }],
                                    debitLines: [],
                                },
                            }
                        }
                        if (transactionKey === 'SALES_REVENUE') {
                            return base
                        }
                        return base
                    },
                ),
        }
        const treasuryPayment = {
            resolvePaymentAccount: jest
                .fn()
                .mockImplementation(
                    async (input: { paymentMethodCode: string }) => {
                        if (input.paymentMethodCode === 'CASH') {
                            return { glAccountId: 'cash-gl' }
                        }
                        if (input.paymentMethodCode === 'CARD') {
                            return { glAccountId: 'card-clearing-gl' }
                        }
                        throw new BadRequestException('no treasury')
                    },
                ),
        }
        const service = new FicoSdPostingService(
            prisma as never,
            accountResolution as never,
            treasuryPayment as never,
        )
        const lines = await service.resolveFlatLines({
            sourceModule: 'SD',
            eventType: 'PosSaleCompleted',
            companyId: 'co-1',
            postingDate: '2026-11-27T00:00:00.000Z',
            currencyCode: 'PHP',
            documentType: 'SALES_ORDER',
            documentId: 'so-1',
            salesOrderId: 'so-1',
            orderNumber: 'POS-000001',
            totalAmount: '820.00',
            outstandingBalance: '0',
            tenders: [
                { method: 'CASH', amount: '410.00', status: 'Paid' },
                { method: 'CARD', amount: '410.00', status: 'Paid' },
            ],
        } as never)

        const cashDebit = lines
            .filter((l) => l.glAccountId === 'cash-gl')
            .reduce((s, l) => s.plus(l.debit), new Prisma.Decimal(0))
        const cardDebit = lines
            .filter((l) => l.glAccountId === 'card-clearing-gl')
            .reduce((s, l) => s.plus(l.debit), new Prisma.Decimal(0))
        const perfumeCredit = lines
            .filter((l) => l.glAccountId === 'rev-perfume')
            .reduce((s, l) => s.plus(l.credit), new Prisma.Decimal(0))
        const foodCredit = lines
            .filter((l) => l.glAccountId === 'rev-food')
            .reduce((s, l) => s.plus(l.credit), new Prisma.Decimal(0))
        expect(cashDebit.toString()).toBe('410')
        expect(cardDebit.toString()).toBe('410')
        expect(perfumeCredit.toString()).toBe('820')
        expect(foodCredit.toString()).toBe('0')
    })
})