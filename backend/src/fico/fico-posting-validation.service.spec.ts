import { FicoPostingValidationService } from './fico-posting-validation.service'

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
