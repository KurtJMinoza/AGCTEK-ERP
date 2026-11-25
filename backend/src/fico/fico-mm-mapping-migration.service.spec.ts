import { FicoMmMappingMigrationService } from './fico-mm-mapping-migration.service'

describe('FicoMmMappingMigrationService', () => {
    it('builds a dry-run report with required sections', async () => {
        const prisma = {
            ficoCompanyAccountingSettings: {
                findUnique: jest.fn().mockResolvedValue({
                    chartOfAccountsId: 'coa-1',
                    baseCurrency: 'PHP',
                    accountDeterminationProfileId: 'profile-1',
                }),
            },
            ficoMmAccountMapping: {
                findMany: jest.fn().mockResolvedValue([
                    {
                        id: 'map-1',
                        companyId: 'co-1',
                        status: 'ACTIVE',
                        transactionKeyCode: 'GR_IR',
                        valuationClassId: 'vc-1',
                        valuationScopeKey: 'RAW',
                        debitAccountId: 'debit-1',
                        creditAccountId: 'credit-1',
                        effectiveFrom: null,
                        effectiveTo: null,
                        transactionKey: { code: 'GR_IR', name: 'GR/IR' },
                        valuationClass: { id: 'vc-1', code: 'RAW', name: 'Raw materials' },
                        debitAccount: {
                            id: 'debit-1',
                            accountCode: '120100',
                            accountName: 'Raw Inv',
                            accountType: 'ASSET',
                            status: 'ACTIVE',
                        },
                        creditAccount: {
                            id: 'credit-1',
                            accountCode: '210200',
                            accountName: 'GR/IR',
                            accountType: 'LIABILITY',
                            status: 'ACTIVE',
                        },
                    },
                ]),
            },
            ficoAccountDeterminationRule: {
                findMany: jest.fn().mockResolvedValue([]),
            },
        }
        const resolution = {
            resolve: jest.fn().mockRejectedValue(new Error('No approved, active and effective')),
        }
        const validation = {
            assertAccountPostable: jest.fn().mockResolvedValue({}),
        }
        const service = new FicoMmMappingMigrationService(
            prisma as never,
            { assertAccess: jest.fn() } as never,
            resolution as never,
            { create: jest.fn() } as never,
            validation as never,
        )

        const report = await service.dryRunReport('co-1', { id: 'user' } as never)

        expect(report.totalLegacyMappings).toBe(1)
        expect(report.successfullyTransformed).toBe(1)
        expect(report.proposedRules).toHaveLength(1)
        expect(report.rulesReadyForActivation).toHaveLength(1)
        expect(report.dryRun).toBe(true)
    })
})