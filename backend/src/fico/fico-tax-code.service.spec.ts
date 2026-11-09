import { BadRequestException, ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { FicoTaxCalculationService } from './fico-tax-calculation.service'
import { FicoTaxCodeService } from './fico-tax-code.service'

const Decimal = Prisma.Decimal
const user = { id: 'user-1' } as never

function makeTaxCode(overrides: Record<string, unknown> = {}) {
    return {
        id: 'tax-1',
        companyId: 'company-1',
        code: 'VAT12',
        name: 'Standard VAT 12%',
        description: null,
        taxCategory: 'SALES_TAX',
        taxType: 'VAT',
        taxJurisdiction: 'PH',
        countryCode: 'PH',
        calculationMethod: 'TAX_EXCLUSIVE',
        rateUnit: 'PERCENTAGE',
        roundingMethod: 'HALF_UP',
        decimalPrecision: 2,
        roundingLevel: 'PER_LINE_ITEM',
        calculationPriority: 0,
        isSalesApplicable: true,
        isPurchaseApplicable: false,
        isServiceApplicable: false,
        isInventoryApplicable: false,
        isRecoverable: true,
        inputTaxGlAccountId: null,
        outputTaxGlAccountId: null,
        withholdingPayableGlAccountId: null,
        withholdingReceivableGlAccountId: null,
        nonRecoverableTaxGlAccountId: null,
        status: 'DRAFT',
        remarks: null,
        createdBy: 'user-1',
        updatedBy: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        company: { id: 'company-1', code: 'C1', name: 'Company 1' },
        inputTaxGlAccount: null,
        outputTaxGlAccount: null,
        withholdingPayableGlAccount: null,
        withholdingReceivableGlAccount: null,
        nonRecoverableTaxGlAccount: null,
        taxRates: [],
        ...overrides,
    }
}

function makeRate(overrides: Record<string, unknown> = {}) {
    return {
        id: 'rate-1',
        taxCodeId: 'tax-1',
        companyId: 'company-1',
        rate: new Decimal(12),
        rateUnit: 'PERCENTAGE',
        effectiveFrom: new Date('2020-01-01'),
        effectiveTo: null,
        description: null,
        status: 'ACTIVE',
        createdBy: 'user-1',
        createdAt: new Date('2020-01-01'),
        updatedAt: new Date('2020-01-01'),
        ...overrides,
    }
}

function setup() {
    const prisma: Record<string, any> = {
        ficoTaxCode: {
            findUnique: jest.fn(),
            findUniqueOrThrow: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        ficoTaxRate: {
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        ficoTaxCodeAuditLog: {
            create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
            findMany: jest.fn(),
            count: jest.fn(),
        },
        ficoCompanyAccountingSettings: { findUnique: jest.fn() },
        ficoGlAccount: { findMany: jest.fn() },
        user: { findMany: jest.fn() },
    }
    prisma.$transaction = jest.fn(async (callback: (tx: unknown) => unknown) =>
        callback(prisma),
    )

    const access = { assertAccess: jest.fn().mockResolvedValue(undefined) }
    const service = new FicoTaxCodeService(
        prisma as never,
        access as never,
        new FicoTaxCalculationService(),
    )

    return { prisma, access, service }
}

describe('FicoTaxCodeService', () => {
    describe('create', () => {
        it('rejects duplicate tax codes within a company', async () => {
            const { prisma, service } = setup()
            prisma.ficoTaxCode.findUnique.mockResolvedValue(makeTaxCode())

            await expect(
                service.create(
                    {
                        companyId: 'company-1',
                        code: 'vat12',
                        name: 'Duplicate',
                        taxCategory: 'SALES_TAX',
                        taxType: 'VAT',
                    },
                    user,
                ),
            ).rejects.toBeInstanceOf(ConflictException)
        })

        it('normalizes the code and creates a draft with applicability defaults', async () => {
            const { prisma, service } = setup()
            prisma.ficoTaxCode.findUnique.mockResolvedValue(null)
            prisma.ficoTaxCode.create.mockResolvedValue(
                makeTaxCode({ code: 'VAT12' }),
            )

            const result = await service.create(
                {
                    companyId: 'company-1',
                    code: 'vat12',
                    name: 'Standard VAT',
                    taxCategory: 'SALES_TAX',
                    taxType: 'VAT',
                },
                user,
            )

            expect(prisma.ficoTaxCode.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        code: 'VAT12',
                        status: 'DRAFT',
                        isSalesApplicable: true,
                    }),
                }),
            )
            expect(result.code).toBe('VAT12')
            expect(result.effectiveStatus).toBe('DRAFT')
            expect(prisma.ficoTaxCodeAuditLog.create).toHaveBeenCalled()
        })

        it('rejects G/L accounts outside the assigned chart of accounts', async () => {
            const { prisma, service } = setup()
            prisma.ficoTaxCode.findUnique.mockResolvedValue(null)
            prisma.ficoCompanyAccountingSettings.findUnique.mockResolvedValue({
                chartOfAccountsId: 'coa-1',
            })
            prisma.ficoGlAccount.findMany.mockResolvedValue([
                {
                    id: 'gl-1',
                    chartOfAccountsId: 'coa-2',
                    accountCode: '1100',
                    accountName: 'Input VAT',
                    accountType: 'ASSET',
                    isPostingAccount: true,
                    status: 'ACTIVE',
                },
            ])

            await expect(
                service.create(
                    {
                        companyId: 'company-1',
                        code: 'VATIN',
                        name: 'Input VAT',
                        taxCategory: 'INPUT_TAX',
                        taxType: 'VAT',
                        isPurchaseApplicable: true,
                        inputTaxGlAccountId: 'gl-1',
                    },
                    user,
                ),
            ).rejects.toMatchObject({
                response: { message: 'Invalid G/L account mapping.' },
            })
        })
    })

    describe('activation', () => {
        it('requires the mandatory input tax account before activation', async () => {
            const { prisma, service } = setup()
            prisma.ficoTaxCode.findUnique.mockResolvedValue(
                makeTaxCode({
                    id: 'tax-in',
                    code: 'VATIN',
                    taxCategory: 'INPUT_TAX',
                    taxType: 'VAT',
                    isSalesApplicable: false,
                    isPurchaseApplicable: true,
                    inputTaxGlAccountId: null,
                    taxRates: [makeRate()],
                }),
            )

            await expect(
                service.activate(
                    { companyId: 'company-1', taxCodeId: 'tax-in' },
                    user,
                ),
            ).rejects.toMatchObject({
                response: {
                    message: 'Tax code configuration is incomplete.',
                    errors: expect.arrayContaining([
                        expect.objectContaining({
                            field: 'inputTaxGlAccountId',
                        }),
                    ]),
                },
            })
        })

        it('activates once mappings and an effective rate are valid', async () => {
            const { prisma, service } = setup()
            const draft = makeTaxCode({
                id: 'tax-in',
                code: 'VATIN',
                taxCategory: 'INPUT_TAX',
                taxType: 'VAT',
                isSalesApplicable: false,
                isPurchaseApplicable: true,
                inputTaxGlAccountId: 'gl-1',
                taxRates: [makeRate()],
            })
            prisma.ficoTaxCode.findUnique.mockResolvedValue(draft)
            prisma.ficoCompanyAccountingSettings.findUnique.mockResolvedValue({
                chartOfAccountsId: 'coa-1',
            })
            prisma.ficoGlAccount.findMany.mockResolvedValue([
                {
                    id: 'gl-1',
                    chartOfAccountsId: 'coa-1',
                    accountCode: '1100',
                    accountName: 'Input VAT',
                    accountType: 'ASSET',
                    isPostingAccount: true,
                    status: 'ACTIVE',
                },
            ])
            prisma.ficoTaxCode.update.mockResolvedValue({
                ...draft,
                status: 'ACTIVE',
            })

            const result = await service.activate(
                { companyId: 'company-1', taxCodeId: 'tax-in' },
                user,
            )

            expect(result.status).toBe('ACTIVE')
            expect(prisma.ficoTaxCode.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ status: 'ACTIVE' }),
                }),
            )
        })

        it('rejects activation when the only future rate is zero', async () => {
            const { prisma, service } = setup()
            const draft = makeTaxCode({
                id: 'tax-in',
                code: 'VATIN',
                taxCategory: 'INPUT_TAX',
                taxType: 'VAT',
                isSalesApplicable: false,
                isPurchaseApplicable: true,
                inputTaxGlAccountId: 'gl-1',
                taxRates: [
                    makeRate({
                        rate: new Decimal(0),
                        effectiveFrom: new Date('2999-01-01'),
                        effectiveTo: null,
                    }),
                ],
            })
            prisma.ficoTaxCode.findUnique.mockResolvedValue(draft)
            prisma.ficoCompanyAccountingSettings.findUnique.mockResolvedValue({
                chartOfAccountsId: 'coa-1',
            })
            prisma.ficoGlAccount.findMany.mockResolvedValue([
                {
                    id: 'gl-1',
                    chartOfAccountsId: 'coa-1',
                    accountCode: '1100',
                    accountName: 'Input VAT',
                    accountType: 'ASSET',
                    isPostingAccount: true,
                    status: 'ACTIVE',
                },
            ])

            await expect(
                service.activate(
                    { companyId: 'company-1', taxCodeId: 'tax-in' },
                    user,
                ),
            ).rejects.toMatchObject({
                response: {
                    errors: expect.arrayContaining([
                        expect.objectContaining({ field: 'initialRate' }),
                    ]),
                },
            })
        })
    })

    describe('effective-dated rates', () => {
        it('rejects overlapping rate periods', async () => {
            const { prisma, service } = setup()
            prisma.ficoTaxCode.findUnique.mockResolvedValue(makeTaxCode())
            prisma.ficoTaxRate.findFirst
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(
                    makeRate({
                        id: 'rate-existing',
                        effectiveFrom: new Date('2026-01-01'),
                        effectiveTo: null,
                    }),
                )

            await expect(
                service.createRate(
                    'tax-1',
                    {
                        taxCodeId: 'tax-1',
                        companyId: 'company-1',
                        rate: 12,
                        effectiveFrom: '2026-06-01',
                    },
                    user,
                ),
            ).rejects.toThrow('overlaps')
            expect(prisma.ficoTaxRate.create).not.toHaveBeenCalled()
        })

        it('auto-closes the previous open-ended rate when a later rate starts', async () => {
            const { prisma, service } = setup()
            const openEnded = makeRate({
                id: 'rate-old',
                effectiveFrom: new Date('2020-01-01'),
                effectiveTo: null,
            })
            prisma.ficoTaxCode.findUnique.mockResolvedValue(makeTaxCode())
            prisma.ficoTaxRate.findFirst
                .mockResolvedValueOnce(openEnded)
                .mockResolvedValueOnce(null)
            prisma.ficoTaxRate.update.mockResolvedValue({
                ...openEnded,
                effectiveTo: new Date('2025-12-31'),
                status: 'EXPIRED',
            })
            prisma.ficoTaxRate.create.mockResolvedValue(
                makeRate({
                    id: 'rate-new',
                    rate: new Decimal(15),
                    effectiveFrom: new Date('2026-01-01'),
                }),
            )

            await service.createRate(
                'tax-1',
                {
                    taxCodeId: 'tax-1',
                    companyId: 'company-1',
                    rate: 15,
                    effectiveFrom: '2026-01-01',
                },
                user,
            )

            expect(prisma.ficoTaxRate.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'rate-old' },
                    data: expect.objectContaining({
                        effectiveTo: new Date('2025-12-31'),
                    }),
                }),
            )
        })

        it('does not allow rewriting the amount of a rate that has started', async () => {
            const { prisma, service } = setup()
            prisma.ficoTaxRate.findUnique.mockResolvedValue({
                ...makeRate(),
                taxCode: makeTaxCode(),
            })

            await expect(
                service.updateRate('tax-1', 'rate-1', { rate: 15 }, user),
            ).rejects.toThrow('already started')
        })

        it('filters rate lists by date-derived effective status', async () => {
            const { prisma, service } = setup()
            prisma.ficoTaxCode.findUnique.mockResolvedValue({
                id: 'tax-1',
                companyId: 'company-1',
                code: 'VAT12',
                name: 'VAT',
            })
            prisma.ficoTaxRate.findMany.mockResolvedValue([])
            prisma.ficoTaxRate.count.mockResolvedValue(0)

            await service.getRates(
                { taxCodeId: 'tax-1', status: 'SCHEDULED' },
                user,
            )
            const scheduled =
                prisma.ficoTaxRate.findMany.mock.calls[0][0].where
            expect(scheduled.status).toEqual({ not: 'INACTIVE' })
            expect(scheduled.effectiveFrom.gt).toBeInstanceOf(Date)

            prisma.ficoTaxRate.findMany.mockClear()
            await service.getRates(
                { taxCodeId: 'tax-1', status: 'EXPIRED' },
                user,
            )
            const expired = prisma.ficoTaxRate.findMany.mock.calls[0][0].where
            expect(expired.status).toEqual({ not: 'INACTIVE' })
            expect(expired.effectiveTo.lt).toBeInstanceOf(Date)

            prisma.ficoTaxRate.findMany.mockClear()
            await service.getRates(
                { taxCodeId: 'tax-1', status: 'ACTIVE' },
                user,
            )
            const active = prisma.ficoTaxRate.findMany.mock.calls[0][0].where
            expect(active.status).toEqual({ not: 'INACTIVE' })
            expect(active.effectiveFrom.lte).toBeInstanceOf(Date)
            expect(active.OR).toEqual([
                { effectiveTo: null },
                { effectiveTo: { gte: expect.any(Date) } },
            ])
        })
    })

    describe('calculation preview', () => {
        it('calculates with the applicable effective-dated rate', async () => {
            const { prisma, service } = setup()
            prisma.ficoTaxCode.findUnique.mockResolvedValue(
                makeTaxCode({
                    status: 'ACTIVE',
                    taxRates: [makeRate()],
                }),
            )

            const result = await service.calculate(
                {
                    taxCodeId: 'tax-1',
                    companyId: 'company-1',
                    transactionDate: '2026-01-15',
                    transactionType: 'SALES',
                    amount: '1000',
                },
                user,
            )

            expect(result.netAmount).toBe(1000)
            expect(result.taxAmount).toBe(120)
            expect(result.grossAmount).toBe(1120)
            expect(result.classification).toBe('STANDARD')
            expect(result.appliedRateId).toBe('rate-1')
        })

        it('rejects tax codes that belong to another company', async () => {
            const { prisma, service } = setup()
            prisma.ficoTaxCode.findUnique.mockResolvedValue(
                makeTaxCode({ status: 'ACTIVE', taxRates: [makeRate()] }),
            )

            await expect(
                service.calculate(
                    {
                        taxCodeId: 'tax-1',
                        companyId: 'company-2',
                        transactionDate: '2026-01-15',
                        transactionType: 'SALES',
                        amount: '1000',
                    },
                    user,
                ),
            ).rejects.toBeInstanceOf(BadRequestException)
        })

        it('rejects inactive tax codes and non-applicable transaction types', async () => {
            const { prisma, service } = setup()
            prisma.ficoTaxCode.findUnique.mockResolvedValue(
                makeTaxCode({ status: 'INACTIVE' }),
            )
            await expect(
                service.calculate(
                    {
                        taxCodeId: 'tax-1',
                        companyId: 'company-1',
                        transactionDate: '2026-01-15',
                        transactionType: 'SALES',
                        amount: '1000',
                    },
                    user,
                ),
            ).rejects.toThrow('Only active tax codes')

            prisma.ficoTaxCode.findUnique.mockResolvedValue(
                makeTaxCode({
                    status: 'ACTIVE',
                    isSalesApplicable: false,
                    isPurchaseApplicable: true,
                    taxRates: [makeRate()],
                }),
            )
            await expect(
                service.calculate(
                    {
                        taxCodeId: 'tax-1',
                        companyId: 'company-1',
                        transactionDate: '2026-01-15',
                        transactionType: 'SALES',
                        amount: '1000',
                    },
                    user,
                ),
            ).rejects.toThrow('not applicable')
        })
    })

    describe('history and deletion', () => {
        it('resolves audit performer names', async () => {
            const { prisma, service } = setup()
            prisma.ficoTaxCode.findUnique.mockResolvedValue({
                id: 'tax-1',
                code: 'VAT12',
                name: 'VAT',
                companyId: 'company-1',
            })
            prisma.ficoTaxCodeAuditLog.findMany.mockResolvedValue([
                {
                    id: 'log-1',
                    taxCodeId: 'tax-1',
                    companyId: 'company-1',
                    actorId: 'user-1',
                    action: 'TAX_CODE_UPDATE',
                    entityType: 'FicoTaxCode',
                    entityId: 'tax-1',
                    previousValues: null,
                    newValues: { status: 'DRAFT' },
                    reason: null,
                    metadata: null,
                    createdAt: new Date('2026-01-01'),
                },
            ])
            prisma.ficoTaxCodeAuditLog.count.mockResolvedValue(1)
            prisma.user.findMany.mockResolvedValue([
                {
                    id: 'user-1',
                    email: 'jane@example.com',
                    userName: 'jdoe',
                    firstName: 'Jane',
                    lastName: 'Doe',
                },
            ])

            const result = await service.history('tax-1', {}, user)

            expect(result.total).toBe(1)
            expect(result.items[0].performer?.name).toBe('Jane Doe')
        })

        it('blocks deletion and keeps the deactivation path', async () => {
            const { prisma, service } = setup()
            prisma.ficoTaxCode.findUnique.mockResolvedValue(makeTaxCode())

            await expect(service.remove('tax-1', user)).rejects.toThrow(
                'Deactivate the tax code instead',
            )
        })

        it('derives expired status from the rate window', async () => {
            const { prisma, service } = setup()
            prisma.ficoTaxCode.findMany.mockResolvedValue([
                makeTaxCode({
                    status: 'ACTIVE',
                    taxRates: [
                        makeRate({
                            effectiveFrom: new Date('2020-01-01'),
                            effectiveTo: new Date('2020-12-31'),
                            status: 'ACTIVE',
                        }),
                    ],
                }),
            ])
            prisma.ficoTaxCode.count.mockResolvedValue(1)

            const result = await service.list({ companyId: 'company-1' }, user)

            expect(result.items[0].effectiveStatus).toBe('EXPIRED')
            expect(result.items[0].currentRate).toBeNull()
        })

        it('excludes future-only codes from the expired filter', async () => {
            const { prisma, service } = setup()
            prisma.ficoTaxCode.findMany.mockResolvedValue([])
            prisma.ficoTaxCode.count.mockResolvedValue(0)

            await service.list(
                { companyId: 'company-1', status: 'EXPIRED' },
                user,
            )

            const where = prisma.ficoTaxCode.findMany.mock.calls[0][0].where
            const statusFilter = where.AND[0]
            expect(statusFilter.status).toBe('ACTIVE')
            expect(statusFilter.taxRates).toEqual({ some: {} })
            expect(statusFilter.AND).toEqual([
                {
                    taxRates: {
                        none: expect.objectContaining({
                            effectiveFrom: { lte: expect.any(Date) },
                        }),
                    },
                },
                {
                    taxRates: {
                        none: expect.objectContaining({
                            effectiveFrom: { gt: expect.any(Date) },
                        }),
                    },
                },
            ])
        })

        it('combines status and effective-date filters instead of overwriting', async () => {
            const { prisma, service } = setup()
            prisma.ficoTaxCode.findMany.mockResolvedValue([])
            prisma.ficoTaxCode.count.mockResolvedValue(0)

            await service.list(
                {
                    companyId: 'company-1',
                    status: 'ACTIVE',
                    effectiveDate: '2026-06-01',
                },
                user,
            )

            const where = prisma.ficoTaxCode.findMany.mock.calls[0][0].where
            expect(where.AND).toHaveLength(2)
            expect(where.AND[0].status).toBe('ACTIVE')
            expect(where.AND[1].taxRates).toEqual({
                some: expect.objectContaining({
                    status: { not: 'INACTIVE' },
                    effectiveFrom: { lte: new Date('2026-06-01') },
                }),
            })
        })
    })
})
