import { BadRequestException, ConflictException } from '@nestjs/common'
import { FicoCompanySettingsService } from './fico-company-settings.service'
import { FICO_DEFAULT_ACCOUNT_SLOTS } from './fico.constants'

const user = { id: 'user-1' } as never

function account(
    id: string,
    code: string,
    accountType: string,
    chartOfAccountsId = 'coa-1',
    status = 'ACTIVE',
    isPostingAccount = true,
) {
    return {
        id,
        accountCode: code,
        accountName: `${code} account`,
        accountType,
        chartOfAccountsId,
        status,
        isPostingAccount,
    }
}

function settings(overrides: Record<string, unknown> = {}) {
    const base: Record<string, unknown> = {
        id: 'settings-1',
        companyId: 'company-1',
        status: 'ACTIVE',
        legalName: 'AGCTEK Test Company',
        baseCurrency: 'PHP',
        groupCurrency: null,
        countryCode: 'PH',
        timezone: 'Asia/Manila',
        accountingMethod: 'ACCRUAL',
        chartOfAccountsId: 'coa-1',
        chartOfAccounts: { id: 'coa-1', code: 'COA', name: 'Chart', status: 'ACTIVE' },
        fiscalYearVariantId: 'fyv-1',
        fiscalYearVariant: { id: 'fyv-1', code: 'CAL', name: 'Calendar', status: 'ACTIVE' },
        postingPeriodVariantId: 'ppv-1',
        postingPeriodVariant: { id: 'ppv-1', code: 'M', name: 'Monthly', status: 'ACTIVE' },
        accountDeterminationProfileId: 'profile-1',
        documentNumberPadding: 6,
        maxBackdatedPostingDays: null,
        backdatedPostingAllowed: true,
        allowNegativePostings: false,
    }
    for (const slot of FICO_DEFAULT_ACCOUNT_SLOTS) {
        base[slot.key] = null
        base[slot.relation] = null
    }
    return { ...base, ...overrides }
}

function setup(overrides: Record<string, unknown> = {}) {
    const prisma = {
        ficoCompanyAccountingSettings: {
            findUnique: jest.fn().mockResolvedValue(settings(overrides)),
            delete: jest.fn().mockResolvedValue({}),
        },
        ficoGlAccount: { count: jest.fn().mockResolvedValue(1) },
        ficoCompanyGlAccount: { count: jest.fn().mockResolvedValue(1) },
        ficoFinancialPeriod: { count: jest.fn().mockResolvedValue(1) },
        ficoJournalEntry: { count: jest.fn().mockResolvedValue(0) },
        $transaction: jest.fn().mockImplementation(async (callback) =>
            callback({
                ficoCompanyAccountingSettings: {
                    delete: jest.fn().mockResolvedValue({}),
                },
            }),
        ),
    }
    const access = { assertAccess: jest.fn().mockResolvedValue(undefined) }
    const audit = { log: jest.fn().mockResolvedValue(undefined) }
    const service = new FicoCompanySettingsService(
        prisma as never,
        access as never,
        audit as never,
    )
    return { service, prisma, access, audit }
}

describe('FicoCompanySettingsService default account validation', () => {
    it('rejects a default account that belongs to another chart of accounts', async () => {
        const { service } = setup({
            defaultCashAccountId: 'gl-cash',
            defaultCashAccount: account('gl-cash', '100000', 'ASSET', 'coa-other'),
        })

        const result = await service.validate('company-1')

        expect(result.valid).toBe(false)
        expect(result.errors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: 'DEFAULT_ACCOUNT_WRONG_CHART',
                    field: 'defaultCashAccountId',
                }),
            ]),
        )
    })

    it('rejects an inactive or non-posting default account', async () => {
        const { service } = setup({
            defaultSalesRevenueAccountId: 'gl-revenue',
            defaultSalesRevenueAccount: account(
                'gl-revenue',
                '400000',
                'REVENUE',
                'coa-1',
                'INACTIVE',
                false,
            ),
        })

        const result = await service.validate('company-1')

        expect(result.valid).toBe(false)
        expect(result.errors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ code: 'DEFAULT_ACCOUNT_INACTIVE' }),
                expect.objectContaining({
                    code: 'DEFAULT_ACCOUNT_NOT_POSTING',
                }),
            ]),
        )
    })

    it('treats missing default accounts as warnings, not activation blockers', async () => {
        const { service } = setup()

        const result = await service.validate('company-1')

        expect(result.valid).toBe(true)
        expect(result.warnings).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ code: 'DEFAULT_ACCOUNT_MISSING' }),
            ]),
        )
    })
})

describe('FicoCompanySettingsService delete guards', () => {
    it('refuses to delete a configuration referenced by accounting documents', async () => {
        const { service, prisma } = setup({ status: 'INACTIVE' })
        prisma.ficoJournalEntry.count.mockResolvedValue(2)

        await expect(
            service.remove('company-1', user, 'cleanup'),
        ).rejects.toBeInstanceOf(ConflictException)
        expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('refuses to delete a configuration with generated periods', async () => {
        const { service, prisma } = setup({ status: 'INACTIVE' })
        prisma.ficoFinancialPeriod.count.mockResolvedValue(12)

        await expect(
            service.remove('company-1', user),
        ).rejects.toBeInstanceOf(ConflictException)
    })

    it('refuses to delete an active configuration', async () => {
        const { service } = setup({ status: 'ACTIVE' })

        await expect(
            service.remove('company-1', user),
        ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('deletes an unused inactive configuration inside a transaction', async () => {
        const { service, prisma, audit } = setup({ status: 'INACTIVE' })
        prisma.ficoFinancialPeriod.count.mockResolvedValue(0)

        await expect(service.remove('company-1', user, 'cleanup')).resolves.toEqual({
            companyId: 'company-1',
            deleted: true,
        })
        expect(prisma.$transaction).toHaveBeenCalledTimes(1)
        expect(audit.log).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'COMPANY_SETTINGS_DELETE',
                reason: 'cleanup',
            }),
            expect.anything(),
        )
    })
})
