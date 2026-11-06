import { FicoPostingValidationService } from './fico-posting-validation.service'

function postingSettings(overrides: Record<string, unknown> = {}) {
    return {
        id: 'settings-1',
        companyId: 'company-1',
        status: 'ACTIVE',
        baseCurrency: 'PHP',
        chartOfAccountsId: 'coa-1',
        chartOfAccounts: { id: 'coa-1', code: 'COA', status: 'ACTIVE' },
        company: { id: 'company-1', name: 'AGCTEK' },
        backdatedPostingAllowed: true,
        maxBackdatedPostingDays: null,
        allowNegativePostings: false,
        ...overrides,
    }
}

function validationService(settings: Record<string, unknown>) {
    const prisma = {
        ficoCompanyAccountingSettings: {
            findUnique: jest.fn().mockResolvedValue(settings),
        },
    }
    const periods = {
        assertPostingAllowed: jest.fn().mockResolvedValue({
            id: 'period-1',
            fiscalYear: 2026,
            periodNumber: 11,
            status: 'OPEN',
        }),
    }
    return {
        service: new FicoPostingValidationService(
            prisma as never,
            periods as never,
        ),
        periods,
    }
}

function daysAgo(days: number) {
    const date = new Date()
    date.setUTCDate(date.getUTCDate() - days)
    return date.toISOString().slice(0, 10)
}

describe('FicoPostingValidationService posting controls', () => {
    it('rejects backdated postings when the company disallows them', async () => {
        const { service, periods } = validationService(
            postingSettings({ backdatedPostingAllowed: false }),
        )

        await expect(
            service.validate({
                companyId: 'company-1',
                postingDate: daysAgo(1),
            }),
        ).rejects.toThrow(/Backdated accounting postings are not allowed/)
        expect(periods.assertPostingAllowed).not.toHaveBeenCalled()
    })

    it('rejects postings older than the configured backdated window', async () => {
        const { service } = validationService(
            postingSettings({ maxBackdatedPostingDays: 3 }),
        )

        await expect(
            service.validate({
                companyId: 'company-1',
                postingDate: daysAgo(10),
            }),
        ).rejects.toThrow(/more than 3 day/)
    })

    it('rejects negative amounts unless the company allows them', async () => {
        const { service } = validationService(postingSettings())

        await expect(
            service.validate({
                companyId: 'company-1',
                postingDate: daysAgo(0),
                lines: [
                    {
                        glAccountId: 'gl-1',
                        debitAmount: -100,
                    },
                ],
            }),
        ).rejects.toThrow(/Negative posting amounts are not allowed/)
    })

    it('accepts a current posting when backdating and negatives are allowed', async () => {
        const { service } = validationService(
            postingSettings({
                backdatedPostingAllowed: true,
                allowNegativePostings: true,
                maxBackdatedPostingDays: null,
            }),
        )

        await expect(
            service.validate({
                companyId: 'company-1',
                postingDate: daysAgo(0),
                currencyCode: 'PHP',
            }),
        ).resolves.toMatchObject({
            valid: true,
            periodKey: '2026-11',
        })
    })
})

describe('FicoPostingValidationService', () => {
    it('uses the requested posting date for company-account effective dates', async () => {
        const service = new FicoPostingValidationService(
            {
                ficoGlAccount: {
                    findUnique: jest.fn().mockResolvedValue({
                        id: 'gl-1',
                        chartOfAccountsId: 'coa-1',
                        accountCode: '100000',
                        accountName: 'Cash',
                        accountType: 'ASSET',
                        status: 'ACTIVE',
                        isPostingAccount: true,
                        allowManualPosting: true,
                        allowAutomaticPosting: true,
                        currencyRestriction: null,
                        companyAssignments: [
                            {
                                postingEnabled: true,
                                manualPostingBlocked: false,
                                effectiveFrom: new Date('2025-01-01T00:00:00.000Z'),
                                effectiveTo: new Date('2025-12-31T00:00:00.000Z'),
                            },
                        ],
                    }),
                },
            } as never,
            {} as never,
        )

        await expect(
            service.assertAccountPostable(
                'company-1',
                'gl-1',
                'MANUAL',
                'PHP',
                'coa-1',
                new Date('2025-06-30T00:00:00.000Z'),
            ),
        ).resolves.toMatchObject({ glAccountId: 'gl-1', accountCode: '100000' })
    })
})
