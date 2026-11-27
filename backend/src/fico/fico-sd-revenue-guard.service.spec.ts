import { FicoSdRevenueGuardService } from './fico-sd-revenue-guard.service'

describe('FicoSdRevenueGuardService', () => {
    it('skips invoice posting for POS channel orders', async () => {
        const prisma = {
            sdSalesOrder: {
                findUnique: jest
                    .fn()
                    .mockResolvedValue({ channel: 'POS', paymentStatus: 'Paid' }),
            },
            ficoJournalEntry: { findFirst: jest.fn() },
        }
        const guard = new FicoSdRevenueGuardService(prisma as never)
        const result = await guard.shouldSkipInvoiceFinancialPosting('so-pos')
        expect(result.skip).toBe(true)
        expect(result.reason).toBe('POS_REVENUE_AT_REGISTER')
    })

    it('lists all posted revenue journals including repost idempotency keys', async () => {
        const findMany = jest.fn().mockResolvedValue([
            { id: 'je-2', documentNumber: 'PS-2026-000002' },
        ])
        const prisma = {
            ficoJournalEntry: { findMany },
        }
        const guard = new FicoSdRevenueGuardService(prisma as never)
        const rows = await guard.listPostedRevenueJournalsForOrder('so-1')
        expect(rows).toHaveLength(1)
        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    status: 'POSTED',
                    OR: expect.arrayContaining([
                        expect.objectContaining({
                            idempotencyKey: { startsWith: 'pos-revenue:so-1' },
                        }),
                    ]),
                }),
            }),
        )
    })

    it('skips invoice posting when revenue journal already exists', async () => {
        const prisma = {
            sdSalesOrder: {
                findUnique: jest
                    .fn()
                    .mockResolvedValue({ channel: 'ECOMMERCE', paymentStatus: 'Unpaid' }),
            },
            ficoJournalEntry: {
                findMany: jest.fn().mockResolvedValue([{ id: 'je-1' }]),
            },
        }
        const guard = new FicoSdRevenueGuardService(prisma as never)
        const result = await guard.shouldSkipInvoiceFinancialPosting('so-1')
        expect(result.skip).toBe(true)
        expect(result.reason).toBe('REVENUE_ALREADY_POSTED')
    })
})