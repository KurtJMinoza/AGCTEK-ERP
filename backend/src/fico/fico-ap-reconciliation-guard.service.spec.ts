import { BadRequestException } from '@nestjs/common'
import { FicoApReconciliationGuardService } from './fico-ap-reconciliation-guard.service'

describe('FicoApReconciliationGuardService', () => {
    it('rejects direct postings to an AP reconciliation account', async () => {
        const service = new FicoApReconciliationGuardService({
            ficoGlAccount: {
                findMany: jest.fn().mockResolvedValue([
                    { accountCode: '210000', accountName: 'Trade payables' },
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

    it('allows AR subledger postings to protected receivable accounts', async () => {
        const findMany = jest.fn()
        const service = new FicoApReconciliationGuardService({
            ficoGlAccount: { findMany },
        } as any)

        await expect(
            service.assertPostingAllowed({
                glAccountIds: ['ar-recon'],
                subledgerPosting: 'AR',
            }),
        ).resolves.toBeUndefined()
        expect(findMany).not.toHaveBeenCalled()
    })
})
