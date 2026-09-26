/**
 * Reservation + posting integration (Phase 1 scenarios 3–4).
 */
import { Test, TestingModule } from '@nestjs/testing'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Decimal } from '@prisma/client/runtime/library'
import { InventoryPostingService } from './inventory-posting.service'
import { InventoryAvailabilityService } from './inventory-availability.service'
import { ReservationService } from '../outbound/reservation.service'
import { PrismaService } from '../../prisma/prisma.service'
import { ValuationEngineService } from '../valuation/valuation-engine.service'
import { UomConversionsService } from '../uom-conversions/uom-conversions.service'
import { MmScopeService } from '../common/mm-scope.service'
import { MmDomainEventsService } from '../common/mm-domain-events.service'

function baseDto(overrides: Record<string, unknown> = {}) {
    return {
        companyId: 'co-1',
        warehouseId: 'wh-1',
        materialId: 'mat-1',
        movementType: 'RECEIPT',
        quantity: 100,
        uomId: 'uom-1',
        postingDate: '2026-01-15',
        documentDate: '2026-01-15',
        ...overrides,
    }
}

describe('Inventory reservation integration (Phase 1)', () => {
    let posting: InventoryPostingService
    let availability: InventoryAvailabilityService
    let reservations: ReservationService
    let balanceStore: Map<string, Record<string, unknown>>
    let mockPrisma: Record<string, unknown>

    function balanceKey(d: {
        companyId: string
        warehouseId: string
        materialId: string
        stockStatus: string
        storageBinId?: string | null
    }) {
        return `${d.companyId}:${d.warehouseId}:${d.materialId}:${d.stockStatus}:${d.storageBinId ?? ''}`
    }

    beforeEach(async () => {
        balanceStore = new Map()

        mockPrisma = {
            mmInventoryTransaction: {
                findUnique: jest.fn().mockResolvedValue(null),
                findFirst: jest.fn().mockResolvedValue(null),
            },
            mmInventoryBalance: {
                findFirst: jest.fn(({ where }: any) => {
                    const key = balanceKey(where)
                    return Promise.resolve(balanceStore.get(key) ?? null)
                }),
                findMany: jest.fn(({ where }: any) =>
                    Promise.resolve(
                        [...balanceStore.values()].filter((b) => {
                            if (where.companyId && b.companyId !== where.companyId) return false
                            if (where.warehouseId && b.warehouseId !== where.warehouseId) return false
                            if (where.materialId && b.materialId !== where.materialId) return false
                            if (where.stockStatus && b.stockStatus !== where.stockStatus) return false
                            return true
                        }),
                    ),
                ),
            },
            mmMaterial: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'mat-1',
                    companyId: 'co-1',
                    status: 'ACTIVE',
                    inventoryManaged: true,
                    batchManaged: false,
                    serialManaged: false,
                    negativeStockAllowed: false,
                }),
            },
            warehouse: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'wh-1',
                    companyId: 'co-1',
                    status: 'ACTIVE',
                    deletedAt: null,
                    plantId: 'plant-1',
                }),
            },
            wmStorageBin: { findFirst: jest.fn() },
            mmUom: { findFirst: jest.fn().mockResolvedValue({ id: 'uom-1', deletedAt: null }) },
            mmBatch: { findFirst: jest.fn() },
            mmSerialNumber: { findFirst: jest.fn() },
            mmInventoryAudit: { create: jest.fn().mockResolvedValue({}) },
            mmInventoryReservation: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockImplementation(({ data }: any) =>
                    Promise.resolve({ id: 'rsv-1', reservationNumber: 'RSV-001', ...data }),
                ),
                count: jest.fn().mockResolvedValue(0),
            },
            $transaction: jest.fn(),
        }

        ;(mockPrisma as any).$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
            const tx = {
                mmInventoryTransaction: {
                    findUnique: jest.fn().mockResolvedValue(null),
                    findFirst: jest.fn().mockResolvedValue(null),
                    create: jest.fn(({ data }: any) =>
                        Promise.resolve({ id: 'txn-1', transactionNumber: 'TXN-1', ...data }),
                    ),
                },
                mmInventoryBalance: {
                    findFirst: jest.fn(({ where }: any) => {
                        const key = balanceKey(where)
                        return Promise.resolve(balanceStore.get(key) ?? null)
                    }),
                    findMany: jest.fn(({ where }: any) =>
                        Promise.resolve(
                            [...balanceStore.values()].filter((b) => {
                                if (where.companyId && b.companyId !== where.companyId) return false
                                if (where.warehouseId && b.warehouseId !== where.warehouseId)
                                    return false
                                if (where.materialId && b.materialId !== where.materialId) return false
                                if (where.stockStatus && b.stockStatus !== where.stockStatus)
                                    return false
                                return true
                            }),
                        ),
                    ),
                    create: jest.fn(({ data }: any) => {
                        const key = balanceKey(data)
                        const bal = { id: `bal-${balanceStore.size + 1}`, version: 0, ...data }
                        balanceStore.set(key, bal)
                        return bal
                    }),
                    update: jest.fn(({ where, data }: any) => {
                        const bal = [...balanceStore.values()].find((b) => b.id === where.id)
                        if (!bal) return null
                        Object.assign(bal, data)
                        if (data.version?.increment) {
                            bal.version = (bal.version as number) + data.version.increment
                        }
                        return bal
                    }),
                    updateMany: jest.fn(({ where, data }: any) => {
                        const bal = [...balanceStore.values()].find((b) => b.id === where.id)
                        if (!bal || bal.version !== where.version) return { count: 0 }
                        const key = balanceKey(bal as any)
                        balanceStore.set(key, {
                            ...bal,
                            quantity: data.quantity ?? bal.quantity,
                            reservedQuantity: data.reservedQuantity ?? bal.reservedQuantity,
                            availableQuantity: data.availableQuantity ?? bal.availableQuantity,
                            version: (bal.version as number) + 1,
                        })
                        return { count: 1 }
                    }),
                },
                mmInventoryReservation: (mockPrisma as any).mmInventoryReservation,
                mmInventoryAudit: { create: jest.fn().mockResolvedValue({}) },
            }
            return fn(tx)
        })

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                InventoryPostingService,
                InventoryAvailabilityService,
                ReservationService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: EventEmitter2, useValue: { emit: jest.fn() } },
                {
                    provide: ValuationEngineService,
                    useValue: { applyInTransaction: jest.fn(), reverseInTransaction: jest.fn() },
                },
                {
                    provide: UomConversionsService,
                    useValue: {
                        toBaseUom: jest.fn().mockImplementation(
                            async (_m: string, u: string, q: number) => ({
                                quantity: new Decimal(q),
                                baseUomId: u,
                            }),
                        ),
                    },
                },
                {
                    provide: MmScopeService,
                    useValue: { assertPostingScope: jest.fn().mockResolvedValue(undefined) },
                },
                {
                    provide: MmDomainEventsService,
                    useValue: {
                        reservationCreated: jest.fn(),
                        inventoryTransactionPosted: jest.fn(),
                    },
                },
            ],
        }).compile()

        posting = module.get(InventoryPostingService)
        availability = module.get(InventoryAvailabilityService)
        reservations = module.get(ReservationService)
    })

    it('3–4: receive 100, reserve 20 → on-hand 100, available 80', async () => {
        await posting.postTransaction(baseDto({ quantity: 100, idempotencyKey: 'r100' }))

        await reservations.create({
            companyId: 'co-1',
            warehouseId: 'wh-1',
            materialId: 'mat-1',
            quantity: 20,
            sourceType: 'INTERNAL_REQUEST',
            sourceModule: 'TEST',
            sourceDocumentType: 'TEST_DOC',
            sourceDocumentId: 'doc-1',
        })

        const atp = await availability.getAvailability({
            companyId: 'co-1',
            warehouseId: 'wh-1',
            materialId: 'mat-1',
        })

        expect(atp.onHand).toBe(100)
        expect(atp.reserved).toBe(20)
        expect(atp.available).toBe(80)
    })
})
