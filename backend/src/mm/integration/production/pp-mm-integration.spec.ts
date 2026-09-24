/**
 * Phase 3C: Production ↔ MM integration scenarios
 */
import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../../prisma/prisma.service'
import { InventoryAvailabilityService } from '../../inventory/inventory-availability.service'
import { ReservationEngineService } from '../../inventory/reservation-allocation/reservation-engine.service'
import { AllocationEngineService } from '../../inventory/reservation-allocation/allocation-engine.service'
import { AllocationStrategyRegistry } from '../../inventory/reservation-allocation/strategies/allocation-strategy.registry'
import { FifoAllocationStrategy } from '../../inventory/reservation-allocation/strategies/fifo-allocation.strategy'
import { FefoAllocationStrategy } from '../../inventory/reservation-allocation/strategies/fefo-allocation.strategy'
import { MmDomainEventsService } from '../../common/mm-domain-events.service'
import { PickingService } from '../../warehouse/picking/picking.service'
import { ProductionIntegrationService } from './production-integration.service'
import { PRODUCTION_ORDER_GUARD_PORT } from './production-order-guard.port'
import { GoodsIssueService } from '../../stock-ops/goods-issue.service'
import { GoodsReceiptService } from '../../stock-ops/goods-receipt.service'

describe('Production ↔ MM Integration (Phase 3C)', () => {
    let ppIntegration: ProductionIntegrationService
    let domainEvents: jest.Mocked<
        Pick<
            MmDomainEventsService,
            | 'reservationCreated'
            | 'reservationReleased'
            | 'shortageDetected'
            | 'allocationCreated'
            | 'goodsIssuePosted'
            | 'goodsReceiptPosted'
        >
    >

    let balanceStore: Map<string, Record<string, unknown>>
    let reservationHeaders: Map<string, any>
    let reservationLines: Map<string, any>
    let legacyReservations: Map<string, any>
    let seq: number

    const PP = {
        sourceModule: 'PRODUCTION',
        sourceDocumentType: 'PRODUCTION_ORDER',
        sourceDocumentId: 'po-1',
        companyId: 'co-1',
        warehouseId: 'wh-1',
    }

    function balKey(d: {
        companyId: string
        warehouseId: string
        materialId: string
        stockStatus: string
        storageBinId?: string | null
    }) {
        return `${d.companyId}:${d.warehouseId}:${d.materialId}:${d.stockStatus}:${d.storageBinId ?? ''}`
    }

    function seedWarehouseStock(materialId: string, qty: number, binId: string | null = null) {
        balanceStore.set(
            balKey({
                companyId: PP.companyId,
                warehouseId: PP.warehouseId,
                materialId,
                stockStatus: 'UNRESTRICTED',
                storageBinId: binId,
            }),
            {
                id: `bal-${materialId}-${binId ?? 'wh'}`,
                companyId: PP.companyId,
                warehouseId: PP.warehouseId,
                materialId,
                storageBinId: binId,
                batchId: null,
                serialNumberId: null,
                stockStatus: 'UNRESTRICTED',
                quantity: new Decimal(qty),
                reservedQuantity: new Decimal(0),
                availableQuantity: new Decimal(qty),
                version: 0,
                storageBin: binId ? { code: binId } : null,
                batch: null,
            },
        )
    }

    beforeEach(async () => {
        balanceStore = new Map()
        reservationHeaders = new Map()
        reservationLines = new Map()
        legacyReservations = new Map()
        seq = 0

        seedWarehouseStock('RM-001', 200, 'bin-a1')
        seedWarehouseStock('RM-002', 200, 'bin-a2')
        seedWarehouseStock('FG-001', 0, 'bin-fg')

        domainEvents = {
            reservationCreated: jest.fn().mockResolvedValue(undefined),
            reservationReleased: jest.fn().mockResolvedValue(undefined),
            shortageDetected: jest.fn().mockResolvedValue(undefined),
            allocationCreated: jest.fn().mockResolvedValue(undefined),
            goodsIssuePosted: jest.fn().mockResolvedValue(undefined),
            goodsReceiptPosted: jest.fn().mockResolvedValue(undefined),
        } as any

        const mockPrisma: Record<string, unknown> = {
            mmInventoryBalance: {
                findFirst: jest.fn(({ where }: any) => {
                    const key = balKey(where)
                    return Promise.resolve(balanceStore.get(key) ?? null)
                }),
                findMany: jest.fn(({ where }: any) =>
                    Promise.resolve(
                        [...balanceStore.values()].filter((b) => {
                            if (where.companyId && b.companyId !== where.companyId) return false
                            if (where.warehouseId && b.warehouseId !== where.warehouseId) return false
                            if (where.materialId && b.materialId !== where.materialId) return false
                            if (where.stockStatus && b.stockStatus !== where.stockStatus) return false
                            if (where.storageBinId === null && b.storageBinId !== null) return false
                            if (where.storageBinId?.not === null && b.storageBinId === null) return false
                            if (
                                typeof where.storageBinId === 'string' &&
                                b.storageBinId !== where.storageBinId
                            )
                                return false
                            return true
                        }),
                    ),
                ),
                create: jest.fn(({ data }: any) => {
                    const row = { id: `bal-${++seq}`, version: 0, ...data }
                    balanceStore.set(balKey(row), row)
                    return Promise.resolve(row)
                }),
                updateMany: jest.fn(({ where, data }: any) => {
                    const row = [...balanceStore.values()].find((b) => b.id === where.id)
                    if (!row || row.version !== where.version) {
                        return Promise.resolve({ count: 0 })
                    }
                    Object.assign(row, {
                        reservedQuantity: data.reservedQuantity ?? row.reservedQuantity,
                        availableQuantity: data.availableQuantity ?? row.availableQuantity,
                        quantity: data.quantity ?? row.quantity,
                        version: (row.version as number) + 1,
                    })
                    return Promise.resolve({ count: 1 })
                }),
            },
            mmInventoryReservationHeader: {
                findFirst: jest.fn(({ where }: any) => {
                    const rows = [...reservationHeaders.values()]
                    return Promise.resolve(
                        rows.find((h) => {
                            if (where.idempotencyKey && h.idempotencyKey !== where.idempotencyKey)
                                return false
                            if (where.sourceModule && h.sourceModule !== where.sourceModule)
                                return false
                            if (
                                where.sourceDocumentType &&
                                h.sourceDocumentType !== where.sourceDocumentType
                            )
                                return false
                            if (
                                where.sourceDocumentId &&
                                h.sourceDocumentId !== where.sourceDocumentId
                            )
                                return false
                            return true
                        }) ?? null,
                    )
                }),
                findMany: jest.fn(({ where }: any) => {
                    let rows = [...reservationHeaders.values()]
                    if (where.sourceModule) rows = rows.filter((h) => h.sourceModule === where.sourceModule)
                    if (where.sourceDocumentType)
                        rows = rows.filter((h) => h.sourceDocumentType === where.sourceDocumentType)
                    if (where.sourceDocumentId)
                        rows = rows.filter((h) => h.sourceDocumentId === where.sourceDocumentId)
                    if (where.status?.in)
                        rows = rows.filter((h) => where.status.in.includes(h.status))
                    return Promise.resolve(
                        rows.map((h) => ({
                            ...h,
                            lines: [...reservationLines.values()].filter((l) => l.headerId === h.id),
                            allocations: [],
                        })),
                    )
                }),
                findUnique: jest.fn(({ where, include }: any) => {
                    const h = reservationHeaders.get(where.id)
                    if (!h) return Promise.resolve(null)
                    const lines = [...reservationLines.values()].filter((l) => l.headerId === h.id)
                    return Promise.resolve({
                        ...h,
                        lines: lines.map((l) => ({
                            ...l,
                            material: { baseUomId: 'uom-1' },
                        })),
                        allocations: [],
                    })
                }),
                create: jest.fn(({ data, include }: any) => {
                    const headerId = `rsvh-${++seq}`
                    const header = {
                        id: headerId,
                        reservationNumber: data.reservationNumber,
                        companyId: data.companyId,
                        warehouseId: data.warehouseId,
                        sourceModule: data.sourceModule,
                        sourceDocumentType: data.sourceDocumentType,
                        sourceDocumentId: data.sourceDocumentId,
                        idempotencyKey: data.idempotencyKey,
                        status: data.status,
                        lines: [],
                    }
                    reservationHeaders.set(headerId, header)
                    const createdLines = (data.lines?.create ?? []).map((l: any, idx: number) => {
                        const lineId = `rsvl-${++seq}`
                        const line = {
                            id: lineId,
                            headerId,
                            lineNumber: l.lineNumber ?? idx + 1,
                            demandReferenceLineId: l.demandReferenceLineId,
                            materialId: l.materialId,
                            requestedQuantity: l.requestedQuantity,
                            reservedQuantity: l.reservedQuantity ?? new Decimal(0),
                            allocatedQuantity: new Decimal(0),
                            issuedQuantity: new Decimal(0),
                            stockStatus: l.stockStatus ?? 'UNRESTRICTED',
                            status: l.status ?? 'DRAFT',
                            material: { baseUomId: 'uom-1' },
                        }
                        reservationLines.set(lineId, line)
                        return line
                    })
                    header.lines = createdLines
                    return Promise.resolve(include ? { ...header, lines: createdLines } : header)
                }),
                update: jest.fn(({ where, data }: any) => {
                    const h = reservationHeaders.get(where.id)
                    if (!h) throw new Error('header not found')
                    Object.assign(h, data)
                    const result = {
                        ...h,
                        lines: [...reservationLines.values()].filter((l) => l.headerId === h.id),
                        allocations: [],
                    }
                    reservationHeaders.set(h.id, result)
                    return Promise.resolve(result)
                }),
                count: jest.fn().mockResolvedValue(0),
            },
            mmInventoryReservationLine: {
                findMany: jest.fn(({ where }: any) =>
                    Promise.resolve(
                        [...reservationLines.values()].filter((l) => l.headerId === where.headerId),
                    ),
                ),
                findFirst: jest.fn(({ where }: any) =>
                    Promise.resolve(
                        [...reservationLines.values()].find(
                            (l) =>
                                l.headerId === where.headerId &&
                                l.materialId === where.materialId,
                        ) ?? null,
                    ),
                ),
                findUnique: jest.fn(({ where, include }: any) => {
                    const line = reservationLines.get(where.id)
                    if (!line) return Promise.resolve(null)
                    if (include?.header) {
                        line.header = reservationHeaders.get(line.headerId)
                    }
                    return Promise.resolve(line)
                }),
                update: jest.fn(({ where, data }: any) => {
                    const line = reservationLines.get(where.id)
                    if (!line) throw new Error('line not found')
                    Object.assign(line, data)
                    reservationLines.set(where.id, line)
                    return Promise.resolve(line)
                }),
            },
            mmInventoryReservation: {
                create: jest.fn(({ data }: any) => {
                    const id = `rsv-${++seq}`
                    const row = { id, ...data }
                    legacyReservations.set(id, row)
                    return Promise.resolve(row)
                }),
                updateMany: jest.fn(({ where, data }: any) => {
                    for (const [id, row] of legacyReservations) {
                        if (where.reservationLineId && row.reservationLineId === where.reservationLineId) {
                            legacyReservations.set(id, { ...row, ...data })
                        }
                    }
                    return Promise.resolve({ count: 1 })
                }),
                findMany: jest.fn(({ where }: any) =>
                    Promise.resolve(
                        [...legacyReservations.values()].filter(
                            (r) => r.reservationHeaderId === where.reservationHeaderId,
                        ),
                    ),
                ),
            },
            mmInventoryAllocation: {
                findMany: jest.fn().mockResolvedValue([]),
                create: jest.fn(({ data }: any) =>
                    Promise.resolve({
                        id: `alloc-${++seq}`,
                        allocationNumber: data.allocationNumber,
                        headerId: data.headerId,
                        strategy: data.strategy,
                        status: data.status,
                        lines: [],
                    }),
                ),
            },
            mmInventoryAllocationLine: {
                create: jest.fn(({ data }: any) =>
                    Promise.resolve({ id: `allocl-${++seq}`, ...data }),
                ),
            },
            mmMaterial: {
                findUnique: jest.fn(({ where }: any) =>
                    Promise.resolve({
                        id: where.id,
                        baseUomId: 'uom-1',
                        batchManaged: false,
                        serialManaged: false,
                    }),
                ),
            },
            ppProductionOutput: {
                create: jest.fn(({ data }: any) =>
                    Promise.resolve({ id: `out-${++seq}`, ...data }),
                ),
            },
            $transaction: jest.fn(),
        }

        ;(mockPrisma as any).$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
            const tx = { ...mockPrisma }
            return fn(tx)
        })

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                InventoryAvailabilityService,
                ReservationEngineService,
                AllocationEngineService,
                AllocationStrategyRegistry,
                FifoAllocationStrategy,
                FefoAllocationStrategy,
                ProductionIntegrationService,
                {
                    provide: GoodsIssueService,
                    useValue: {
                        create: jest.fn().mockResolvedValue({ id: 'gi-1' }),
                        post: jest.fn().mockResolvedValue({ id: 'gi-1', status: 'POSTED' }),
                    },
                },
                {
                    provide: GoodsReceiptService,
                    useValue: {
                        create: jest.fn().mockResolvedValue({ id: 'gr-1' }),
                        post: jest.fn().mockResolvedValue({ id: 'gr-1', status: 'POSTED' }),
                    },
                },
                { provide: PrismaService, useValue: mockPrisma },
                { provide: MmDomainEventsService, useValue: domainEvents },
                { provide: PickingService, useValue: { create: jest.fn() } },
                {
                    provide: PRODUCTION_ORDER_GUARD_PORT,
                    useValue: { isOrderActive: jest.fn().mockResolvedValue(true) },
                },
            ],
        }).compile()

        ppIntegration = module.get(ProductionIntegrationService)
    })

    async function reserveComponents() {
        return ppIntegration.reserveDemand({
            companyId: PP.companyId,
            warehouseId: PP.warehouseId,
            sourceDocumentId: PP.sourceDocumentId,
            idempotencyKey: 'release:po-1',
            lines: [
                {
                    materialId: 'RM-001',
                    quantity: 100,
                    demandReferenceLineId: 'mat-line-1',
                },
                {
                    materialId: 'RM-002',
                    quantity: 50,
                    demandReferenceLineId: 'mat-line-2',
                },
            ],
        })
    }

    it('reserves RM-001=100 and RM-002=50 idempotently', async () => {
        const first = await reserveComponents()
        const second = await reserveComponents()
        expect(second.reservationHeaderId).toBe(first.reservationHeaderId)
        expect(reservationHeaders.size).toBe(1)
        expect(first.lines).toHaveLength(2)
        expect(domainEvents.reservationCreated).toHaveBeenCalled()
    })

    it('releases reservation on production order cancel', async () => {
        const reserved = await reserveComponents()
        const released = await ppIntegration.releaseBySourceDocument(PP.sourceDocumentId, {
            reason: 'ORDER_CANCELLED',
        })
        expect(released.releasedCount).toBe(1)
        const header = reservationHeaders.get(reserved.reservationHeaderId)
        expect(['CANCELLED', 'RELEASED']).toContain(header.status)
        expect(domainEvents.reservationReleased).toHaveBeenCalled()
    })

    it('partially releases RM-001 on quantity decrease 100 → 60', async () => {
        await reserveComponents()
        const result = await ppIntegration.adjustBySourceDocument(PP.sourceDocumentId, {
            lines: [{ demandReferenceLineId: 'mat-line-1', newQuantity: 60 }],
        })
        expect(result.adjustments[0].releasedQty).toBe('40')
        expect(result.adjustments[0].newReservedQuantity).toBe('60')
        expect(domainEvents.reservationReleased).toHaveBeenCalledWith(
            expect.objectContaining({
                payload: expect.objectContaining({ reason: 'DEMAND_CHANGED' }),
            }),
        )
    })

    it('rejects reservation when production order is cancelled', async () => {
        const module = await Test.createTestingModule({
            providers: [
                InventoryAvailabilityService,
                ReservationEngineService,
                AllocationEngineService,
                AllocationStrategyRegistry,
                FifoAllocationStrategy,
                FefoAllocationStrategy,
                ProductionIntegrationService,
                {
                    provide: GoodsIssueService,
                    useValue: { create: jest.fn(), post: jest.fn() },
                },
                {
                    provide: GoodsReceiptService,
                    useValue: { create: jest.fn(), post: jest.fn() },
                },
                {
                    provide: PrismaService,
                    useValue: {
                        mmInventoryBalance: { findFirst: jest.fn(), findMany: jest.fn() },
                    },
                },
                { provide: MmDomainEventsService, useValue: domainEvents },
                { provide: PickingService, useValue: { create: jest.fn() } },
                {
                    provide: PRODUCTION_ORDER_GUARD_PORT,
                    useValue: { isOrderActive: jest.fn().mockResolvedValue(false) },
                },
            ],
        }).compile()

        const svc = module.get(ProductionIntegrationService)
        await expect(
            svc.reserveDemand({
                companyId: PP.companyId,
                warehouseId: PP.warehouseId,
                sourceDocumentId: PP.sourceDocumentId,
                lines: [
                    {
                        materialId: 'RM-001',
                        quantity: 10,
                        demandReferenceLineId: 'mat-line-1',
                    },
                ],
            }),
        ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('receives FG-001 production output via goods receipt integration', async () => {
        const result = await ppIntegration.receiveOutput({
            productionOrderId: PP.sourceDocumentId,
            companyId: PP.companyId,
            warehouseId: PP.warehouseId,
            materialId: 'FG-001',
            quantity: 10,
            storageBinId: 'bin-fg',
        })
        expect(result.outputId).toBeDefined()
        expect(result.goodsReceipt.status).toBe('POSTED')
    })
})
