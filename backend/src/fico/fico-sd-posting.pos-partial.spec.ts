import { BadRequestException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { FicoSdPostingService } from './fico-sd-posting.service'

describe('FicoSdPostingService partial POS sale', () => {
    it('uses company default receivable when determination rules are missing', async () => {
        const prisma = {
            ficoCompanyAccountingSettings: {
                findFirst: jest.fn().mockResolvedValue({
                    chartOfAccountsId: 'coa-1',
                    defaultSalesRevenueAccountId: 'rev-gl',
                    defaultTaxOutputAccountId: 'tax-gl',
                    defaultReceivableAccountId: 'ar-gl',
                    defaultCashAccountId: 'cash-gl',
                }),
            },
            sdSalesOrder: {
                findUnique: jest.fn().mockResolvedValue({
                    branchId: null,
                    lines: [
                        {
                            taxAmount: new Prisma.Decimal('739.29'),
                            lineTotal: new Prisma.Decimal('6900'),
                            materialId: null,
                            material: {
                                materialCode: null,
                                valuationClassId: null,
                                materialType: null,
                                materialCategory: null,
                            },
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
                .mockRejectedValue(
                    new BadRequestException(
                        'No approved, active and effective SD account determination rule matches ACCOUNTS_RECEIVABLE on 2026-11-26.',
                    ),
                ),
        }
        const treasuryPayment = {
            resolvePaymentAccount: jest
                .fn()
                .mockResolvedValue({ glAccountId: 'cash-gl' }),
        }
        const salesRevenueResolution = {
            resolveSalesRevenueGlAccountId: jest
                .fn()
                .mockResolvedValue('rev-gl'),
        }
        const service = new FicoSdPostingService(
            prisma as never,
            accountResolution as never,
            treasuryPayment as never,
            salesRevenueResolution as never,
        )
        const lines = await service.resolveFlatLines({
            sourceModule: 'SD',
            eventType: 'PosSaleCompleted',
            companyId: 'co-1',
            postingDate: '2026-11-26T00:00:00.000Z',
            currencyCode: 'PHP',
            documentType: 'SALES_ORDER',
            documentId: 'so-1',
            salesOrderId: 'so-1',
            orderNumber: 'POS-000099',
            totalAmount: '6900.00',
            outstandingBalance: '3450.00',
            tenders: [{ method: 'CASH', amount: '3450.00' }],
        } as never)

        const arLine = lines.find((line) => line.glAccountId === 'ar-gl')
        expect(arLine).toBeDefined()
        expect(arLine?.debit.toString()).toBe('3450')
        const debit = lines.reduce(
            (sum, line) => sum.plus(line.debit),
            new Prisma.Decimal(0),
        )
        const credit = lines.reduce(
            (sum, line) => sum.plus(line.credit),
            new Prisma.Decimal(0),
        )
        expect(debit.toString()).toBe(credit.toString())
        expect(debit.toString()).toBe('6900')
    })
})