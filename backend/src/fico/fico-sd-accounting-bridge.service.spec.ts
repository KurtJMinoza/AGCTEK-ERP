import { FicoSdAccountingBridgeService } from './fico-sd-accounting-bridge.service'
import { FicoSdRevenueGuardService } from './fico-sd-revenue-guard.service'

describe('FicoSdAccountingBridgeService.reversePosRevenueJournal', () => {
    const companyId = 'co-1'
    const salesOrderId = 'order-1'
    const reason = 'POS sale void'

    let prisma: {
        mmAccountingEvent: { findUnique: jest.Mock }
        ficoJournalEntry: { findMany: jest.Mock }
    }
    let events: { emit: jest.Mock }
    let revenueGuard: FicoSdRevenueGuardService
    let service: FicoSdAccountingBridgeService
    let recordSpy: jest.SpyInstance

    beforeEach(() => {
        prisma = {
            mmAccountingEvent: {
                findUnique: jest.fn().mockResolvedValue(null),
            },
            ficoJournalEntry: { findMany: jest.fn() },
        }
        events = { emit: jest.fn() }
        revenueGuard = new FicoSdRevenueGuardService(prisma as never)
        service = new FicoSdAccountingBridgeService(
            {
                ...prisma,
                mmAccountingEvent: {
                    findUnique: jest.fn().mockResolvedValue(null),
                    create: jest.fn().mockResolvedValue({ id: 'evt-1' }),
                },
                sdSalesOrder: { findUnique: jest.fn() },
            } as never,
            events as never,
            revenueGuard,
        )
        recordSpy = jest
            .spyOn(service, 'recordAndDispatch')
            .mockResolvedValue(undefined)
        jest.spyOn(revenueGuard, 'listPostedRevenueJournalsForOrder')
    })

    it('reverses every posted revenue journal, including reposted repair keys', async () => {
        jest.spyOn(
            revenueGuard,
            'listPostedRevenueJournalsForOrder',
        ).mockResolvedValue([
            {
                id: 'je-original',
                documentNumber: 'PS-2026-000001',
                idempotencyKey: 'pos-revenue:order-1',
                companyId,
            },
            {
                id: 'je-repost',
                documentNumber: 'PS-2026-000002',
                idempotencyKey: 'pos-revenue:order-1:cash-on-hand-repair',
                companyId,
            },
        ])

        await service.reversePosRevenueJournal(
            companyId,
            salesOrderId,
            reason,
            'void:order-1',
        )

        expect(recordSpy).toHaveBeenCalledTimes(2)
        expect(recordSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                eventType: 'PosSaleVoided',
                idempotencyKey: 'void:order-1:je:je-original',
                payload: expect.objectContaining({
                    reversalOfJournalId: 'je-original',
                }),
            }),
        )
        expect(recordSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                idempotencyKey: 'void:order-1:je:je-repost',
                payload: expect.objectContaining({
                    reversalOfJournalId: 'je-repost',
                }),
            }),
        )
    })

    it('skips journals whose void accounting event was already consumed', async () => {
        jest.spyOn(
            revenueGuard,
            'listPostedRevenueJournalsForOrder',
        ).mockResolvedValue([
            {
                id: 'je-repost',
                documentNumber: 'PS-2026-000002',
                idempotencyKey: 'pos-revenue:order-1:cash-on-hand-repair',
                companyId,
            },
        ])
        const bridgePrisma = (service as unknown as { prisma: typeof prisma })
            .prisma as {
            mmAccountingEvent: { findUnique: jest.Mock }
        }
        bridgePrisma.mmAccountingEvent.findUnique = jest
            .fn()
            .mockResolvedValue({ status: 'CONSUMED' })

        await service.reversePosRevenueJournal(
            companyId,
            salesOrderId,
            reason,
            'void:order-1',
        )

        expect(recordSpy).not.toHaveBeenCalled()
    })

    it('does nothing when no posted revenue remains', async () => {
        jest.spyOn(
            revenueGuard,
            'listPostedRevenueJournalsForOrder',
        ).mockResolvedValue([])

        await service.reversePosRevenueJournal(
            companyId,
            salesOrderId,
            reason,
            'void:order-1',
        )

        expect(recordSpy).not.toHaveBeenCalled()
    })
})