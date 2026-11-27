import { BadRequestException } from '@nestjs/common'
import { FicoApReconciliationGuardService } from './fico-ap-reconciliation-guard.service'

describe('FicoApReconciliationGuardService', () => {
    it('rejects direct postings to an AP reconciliation account', async () => {
        const service = new FicoApReconciliationGuardService({
            ficoGlAccount: {
                findMany: jest.fn().mockResolvedValue([
                    {
                        accountCode: '210000',
                        accountName: 'Trade payables',
                        reconciliationType: 'AP',
                    },
                ]),
            },
        } as any)

        await expect(
            service.assertPostingAllowed({ glAccountIds: ['ap-recon'] }),
        ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('allows AP subledger postings to the protected account', async () => {
        const findMany = jest.fn()
        const service = new FicoApReconciliationGuardService({
            ficoGlAccount: { findMany },
        } as any)

        await expect(
            service.assertPostingAllowed({
                glAccountIds: ['ap-recon'],
                subledgerPosting: 'AP',
            }),
        ).resolves.toBeUndefined()
        expect(findMany).not.toHaveBeenCalled()
    })

    it('rejects manual posting to AR reconciliation accounts', async () => {
        const service = new FicoApReconciliationGuardService({
            ficoGlAccount: {
                findMany: jest.fn().mockResolvedValue([
                    {
                        accountCode: '120000',
                        accountName: 'Trade receivables',
                        reconciliationType: 'AR',
                    },
                ]),
            },
        } as any)

        await expect(
            service.assertPostingAllowed({ glAccountIds: ['ar-recon'] }),
        ).rejects.toThrow(/reconciliation accounts is restricted/)
    })

    it('allows manual posting only when the company policy opts in', async () => {
        const service = new FicoApReconciliationGuardService({
            ficoGlAccount: {
                findMany: jest.fn().mockResolvedValue([
                    {
                        accountCode: '120000',
                        accountName: 'Trade receivables',
                        reconciliationType: 'AR',
                    },
                ]),
            },
        } as any)

        await expect(
            service.assertPostingAllowed({
                glAccountIds: ['ar-recon'],
                reconciliationPolicy: 'ALLOW_MANUAL',
            }),
        ).resolves.toBeUndefined()
    })

    it('allows automatic AR subledger posting', async () => {
        const service = new FicoApReconciliationGuardService({
            ficoGlAccount: { findMany: jest.fn().mockResolvedValue([]) },
        } as any)

        await expect(
            service.assertPostingAllowed({
                glAccountIds: ['ar-recon'],
                source: 'AUTOMATIC',
            }),
        ).resolves.toBeUndefined()
    })
})
