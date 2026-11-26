import { FicoTreasuryPaymentResolutionService } from './fico-treasury-payment-resolution.service'

describe('FicoTreasuryPaymentResolutionService', () => {
    it('prefers an explicit active treasury account', async () => {
        const prisma = {
            ficoTreasuryAccount: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'ta-1',
                    glAccountId: 'gl-bank',
                    glAccount: { accountCode: '1010' },
                }),
            },
            sdPaymentMethod: { findUnique: jest.fn() },
            ficoCompanyAccountingSettings: { findFirst: jest.fn() },
            ficoGlAccount: { findFirst: jest.fn() },
        }
        const accountResolution = { resolveDetermination: jest.fn() }
        const service = new FicoTreasuryPaymentResolutionService(
            prisma as never,
            accountResolution as never,
        )
        const result = await service.resolvePaymentAccount({
            companyId: 'co-1',
            paymentMethodCode: 'CARD',
            currencyCode: 'PHP',
            postingDate: new Date('2026-01-15'),
            treasuryAccountId: 'ta-1',
            side: 'DEBIT',
        })
        expect(result.source).toBe('TREASURY_ACCOUNT')
        expect(result.glAccountId).toBe('gl-bank')
        expect(prisma.ficoTreasuryAccount.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ id: 'ta-1' }),
            }),
        )
    })
})