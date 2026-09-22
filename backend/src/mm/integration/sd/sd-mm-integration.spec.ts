/**
 * Phase 3B: SD ↔ MM integration scenarios
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
import { SdIntegrationService } from './sd-integration.service'
import { SD_ORDER_GUARD_PORT } from './sd-order-guard.port'

describe('SD ↔ MM Integration (Phase 3B)', () => {
    let sdIntegration: SdIntegrationService
    let reservations: ReservationEngineService
    let domainEvents: jest.Mocked<Pick<MmDomainEventsService, 'reservationCreated' | 'reservationReleased' | 'shortageDetected'>>

    let balanceStore: Map<string, Record<string, unknown>>
    let reservationHeaders: Map<string, any>
    let reservationLines: Map<string, any>
    let legacyReservations: Map<string, any>
    let seq: number

    const SD = {
        sourceModule: 'SD',
        sourceDocumentType: 'SALES_ORDER',
        sourceDocumentId: 'so-1',
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

    function seedWarehouseStock(qty: number) {
        balanceStore.set(
            balKey({
                companyId: SD.companyId,
                warehouseId: SD.warehouseId,
                materialId: 'mat-1',
                stockStatus: 'UNRESTRICTED',
                storageBinId: null,
            }),
            {
                id: 'bal-wh-1',
                companyId: SD.companyId,
                warehouseId: SD.warehouseId,
                materialId: 'mat-1',
                storageBinId: null,
                batchId: null,
                serialNumberId: null,
                stockStatus: 'UNRESTRICTED',
                quantity: new Decimal(qty),
                reservedQuantity: new Decimal(0),
                availableQuantity: new Decimal(qty),
                version: 0,
            },
        )
    }

    beforeEach(async () => {
        balanceStore = new Map()
        reservationHeaders = new Map()
        reservationLines = new Map()
        legacyReservations = new Map()
        seq = 0
        seedWarehouseStock(100)

        domainEvents = {
            reservationCreated: jest.fn().mockResolvedValue(undefined),
            reservationReleased: jest.fn().mockResolvedValue(undefined),
            shortageDetected: jest.fn().mockResolvedValue(undefined),
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
                            if (where.idempotencyKey && h.idempotencyKey !== where.idempotencyKey) return false
                            if (where.sourceModule && h.sourceModule !== where.sourceModule) return false
                            if (where.sourceDocumentType && h.sourceDocumentType !== where.sourceDocumentType) return false
                            if (where.sourceDocumentId && h.sourceDocumentId !== where.sourceDocumentId) return false
                            return true
                        }) ?? null,
                    )
                }),
                findMany: jest.fn(({ where }: any) => {
                    let rows = [...reservationHeaders.values()]
                    if (where.sourceModule) rows = rows.filter((h) => h.sourceModule === where.sourceModule)
                    if (where.sourceDocumentType) rows = rows.filter((h) => h.sourceDocumentType === where.sourceDocumentType)
                    if (where.sourceDocumentId) rows = rows.filter((h) => h.sourceDocumentId === where.sourceDocumentId)
                    if (where.status?.in) rows = rows.filter((h) => where.status.in.includes(h.status))
                    return Promise.resolve(rows.map((h) => ({
                        ...h,
                        lines: [...reservationLines.values()].filter((l) => l.headerId === h.id),
                        allocations: [],
                    })))
                }),
                findUnique: jest.fn(({ where, include }: any) => {
                    const h = reservationHeaders.get(where.id)
                    if (!h) return Promise.resolve(null)
                    const result = {
                        ...h,
                        lines: [...reservationLines.values()].filter((l) => l.headerId === h.id),
                        allocations: [],
                    }
                    if (include?.lines) {
                        for (const line of result.lines) {
                            if (include.lines.include?.header) {
                                ;(line as any).header = result
                            }
                        }
                    }
                    return Promise.resolve(result)
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
                            batchId: l.batchId ?? null,
                            serialNumberId: l.serialNumberId ?? null,
                            status: l.status ?? 'DRAFT',
                        }
                        reservationLines.set(lineId, line)
                        return line
                    })
                    header.lines = createdLines
                    return Promise.resolve(include ? { ...header, lines: createdLines } : header)
                }),
                update: jest.fn(({ where, data, include }: any) => {
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
                findUnique: jest.fn(({ where }: any) =>
                    Promise.resolve(reservationLines.get(where.id) ?? null),
                ),
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
            },
            mmMaterial: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'mat-1',
                    batchManaged: false,
                    serialManaged: false,
                }),
            },
            $transaction: jest.fn(),
        }

        ;(mockPrisma as any).$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
            const tx = {
                ...mockPrisma,
                mmInventoryBalance: mockPrisma.mmInventoryBalance,
                mmInventoryReservationHeader: mockPrisma.mmInventoryReservationHeader,
                mmInventoryReservationLine: mockPrisma.mmInventoryReservationLine,
                mmInventoryReservation: mockPrisma.mmInventoryReservation,
            }
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
                SdIntegrationService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: MmDomainEventsService, useValue: domainEvents },
                { provide: PickingService, useValue: { create: jest.fn() } },
                {
                    provide: SD_ORDER_GUARD_PORT,
                    useValue: { isOrderActive: jest.fn().mockResolvedValue(true) },
                },
            ],
        }).compile()

        sdIntegration = module.get(SdIntegrationService)
        reservations = module.get(ReservationEngineService)
    })

    async function reserve100() {
        return sdIntegration.reserveDemand({
            companyId: SD.companyId,
            warehouseId: SD.warehouseId,
            sourceDocumentId: SD.sourceDocumentId,
            idempotencyKey: 'confirm:so-1',
            lines: [
                {
                    materialId: 'mat-1',
                    quantity: 100,
                    demandReferenceLineId: 'line-1',
                },
            ],
        })
    }

    it('creates reservation idempotently on duplicate confirm', async () => {
        const first = await reserve100()
        const second = await reserve100()
        expect(second.reservationHeaderId).toBe(first.reservationHeaderId)
        expect(reservationHeaders.size).toBe(1)
    })

    it('releases reservation on cancel flow', async () => {
        const reserved = await reserve100()
        expect(reserved.status).toBe('RESERVED')

        const released = await sdIntegration.releaseBySourceDocument(SD.sourceDocumentId, {
            reason: 'ORDER_CANCELLED',
        })
        expect(released.releasedCount).toBe(1)

        const header = reservationHeaders.get(reserved.reservationHeaderId)
        expect(['CANCELLED', 'RELEASED']).toContain(header.status)
        expect(domainEvents.reservationReleased).toHaveBeenCalled()
    })

    it('partially releases on quantity decrease 100 → 60', async () => {
        await reserve100()
        const result = await sdIntegration.adjustBySourceDocument(SD.sourceDocumentId, {
            lines: [{ demandReferenceLineId: 'line-1', newQuantity: 60 }],
        })
        expect(result.adjustments[0].releasedQty).toBe('40')
        expect(result.adjustments[0].newReservedQuantity).toBe('60')

        const line = [...reservationLines.values()][0]
        expect(line.reservedQuantity.toString()).toBe('60')
        expect(domainEvents.reservationReleased).toHaveBeenCalledWith(
            expect.objectContaining({
                payload: expect.objectContaining({ reason: 'DEMAND_CHANGED' }),
            }),
        )
    })

    it('rejects reservation when sales order is cancelled', async () => {
        const guard = { isOrderActive: jest.fn().mockResolvedValue(false) }
        const module = await Test.createTestingModule({
            providers: [
                InventoryAvailabilityService,
                ReservationEngineService,
                AllocationEngineService,
                AllocationStrategyRegistry,
                FifoAllocationStrategy,
                FefoAllocationStrategy,
                SdIntegrationService,
                { provide: PrismaService, useValue: { mmInventoryBalance: { findFirst: jest.fn(), findMany: jest.fn() } } },
                { provide: MmDomainEventsService, useValue: domainEvents },
                { provide: PickingService, useValue: { create: jest.fn() } },
                { provide: SD_ORDER_GUARD_PORT, useValue: guard },
            ],
        }).compile()

        const svc = module.get(SdIntegrationService)
        await expect(
            svc.reserveDemand({
                companyId: SD.companyId,
                warehouseId: SD.warehouseId,
                sourceDocumentId: SD.sourceDocumentId,
                lines: [{ materialId: 'mat-1', quantity: 10, demandReferenceLineId: 'line-1' }],
            }),
        ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('returns reservation status snapshot by source document', async () => {
        const reserved = await reserve100()
        const status = await sdIntegration.getStatusBySourceDocument(SD.sourceDocumentId)
        expect(status.reservations).toHaveLength(1)
        expect(status.reservations[0].reservationHeaderId).toBe(reserved.reservationHeaderId)
        expect(status.reservations[0].lines[0].requestedQuantity).toBe('100')
    })
})
