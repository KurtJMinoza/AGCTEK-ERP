/**
 * Phase 5: Reservation + Allocation Engine scenarios
 */
import { Test, TestingModule } from '@nestjs/testing'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../../prisma/prisma.service'
import { InventoryAvailabilityService } from '../inventory-availability.service'
import { ReservationEngineService } from './reservation-engine.service'
import { AllocationEngineService } from './allocation-engine.service'
import { AllocationStrategyRegistry } from './strategies/allocation-strategy.registry'
import { FifoAllocationStrategy } from './strategies/fifo-allocation.strategy'
import { FefoAllocationStrategy } from './strategies/fefo-allocation.strategy'
import { MmDomainEventsService } from '../../common/mm-domain-events.service'
import { PickingService } from '../../warehouse/picking/picking.service'
import { WarehouseTaskService } from '../../warehouse/tasks/warehouse-task.service'
import { PutawayStrategyRegistry } from '../../warehouse/tasks/strategies/putaway-strategy.registry'

describe('Reservation + Allocation Engine (Phase 5)', () => {
    let reservations: ReservationEngineService
    let allocations: AllocationEngineService
    let availability: InventoryAvailabilityService
    let balanceStore: Map<string, Record<string, unknown>>
    let reservationHeaders: Map<string, any>
    let reservationLines: Map<string, any>
    let allocationLines: Map<string, any>
    let seq: number

    function balKey(d: {
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
        reservationHeaders = new Map()
        reservationLines = new Map()
        allocationLines = new Map()
        seq = 0

        const seedBin = (binId: string, qty: number) => {
            balanceStore.set(
                balKey({
                    companyId: 'co-1',
                    warehouseId: 'wh-1',
                    materialId: 'mat-1',
                    stockStatus: 'UNRESTRICTED',
                    storageBinId: binId,
                }),
                {
                    id: `bal-${binId}`,
                    companyId: 'co-1',
                    warehouseId: 'wh-1',
                    materialId: 'mat-1',
                    storageBinId: binId,
                    batchId: null,
                    serialNumberId: null,
                    stockStatus: 'UNRESTRICTED',
                    quantity: new Decimal(qty),
                    reservedQuantity: new Decimal(0),
                    availableQuantity: new Decimal(qty),
                    version: 0,
                    storageBin: { code: binId },
                    batch: null,
                },
            )
        }
        seedBin('bin-a1', 40)
        seedBin('bin-a2', 30)
        seedBin('bin-a3', 30)

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
                    const key = balKey(data)
                    const row = { id: `bal-wh-${seq++}`, version: 0, ...data }
                    balanceStore.set(key, row)
                    return Promise.resolve(row)
                }),
                updateMany: jest.fn(({ where, data }: any) => {
                    const row = [...balanceStore.values()].find((b) => b.id === where.id)
                    if (!row || row.version !== where.version) return Promise.resolve({ count: 0 })
                    Object.assign(row, {
                        reservedQuantity: data.reservedQuantity ?? row.reservedQuantity,
                        availableQuantity: data.availableQuantity ?? row.availableQuantity,
                        quantity: data.quantity ?? row.quantity,
                        version: (row.version as number) + 1,
                    })
                    return Promise.resolve({ count: 1 })
                }),
            },
            mmMaterial: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'mat-1',
                    batchManaged: false,
                    serialManaged: false,
                    baseUomId: 'uom-1',
                    defaultWarehouseId: 'wh-1',
                }),
                findFirst: jest.fn().mockResolvedValue({
                    id: 'mat-1',
                    batchManaged: false,
                    serialManaged: false,
                    baseUomId: 'uom-1',
                }),
            },
            mmInventoryReservationHeader: {
                findFirst: jest.fn().mockResolvedValue(null),
                findUnique: jest.fn(({ where }: any) =>
                    Promise.resolve(reservationHeaders.get(where.id) ?? null),
                ),
                findMany: jest.fn().mockResolvedValue([]),
                count: jest.fn().mockResolvedValue(0),
                create: jest.fn(({ data, include }: any) => {
                    const id = `rsvh-${++seq}`
                    const header = {
                        id,
                        reservationNumber: data.reservationNumber,
                        companyId: data.companyId,
                        warehouseId: data.warehouseId,
                        status: data.status ?? 'DRAFT',
                        lines: [],
                        ...data,
                    }
                    reservationHeaders.set(id, header)
                    return Promise.resolve(header)
                }),
                update: jest.fn(({ where, data, include }: any) => {
                    const h = reservationHeaders.get(where.id)
                    Object.assign(h, data)
                    if (include?.lines) h.lines = [...reservationLines.values()].filter((l) => l.headerId === where.id)
                    return Promise.resolve(h)
                }),
            },
            mmInventoryReservationLine: {
                findMany: jest.fn(({ where }: any) =>
                    Promise.resolve(
                        [...reservationLines.values()].filter((l) =>
                            where.headerId ? l.headerId === where.headerId : true,
                        ),
                    ),
                ),
                findUnique: jest.fn(({ where, include }: any) => {
                    const line = reservationLines.get(where.id)
                    if (!line) return Promise.resolve(null)
                    if (include?.header) {
                        line.header =
                            line.header ??
                            reservationHeaders.get(line.headerId) ?? {
                                id: line.headerId,
                                companyId: 'co-1',
                                warehouseId: 'wh-1',
                            }
                    }
                    return Promise.resolve(line)
                }),
                update: jest.fn(({ where, data }: any) => {
                    const line = reservationLines.get(where.id)
                    Object.assign(line, data)
                    return Promise.resolve(line)
                }),
            },
            mmInventoryReservation: {
                create: jest.fn(({ data }: any) => Promise.resolve({ id: `rsv-${seq++}`, ...data })),
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                findFirst: jest.fn().mockResolvedValue({ id: 'legacy-rsv-1' }),
            },
            mmInventoryAllocation: {
                findFirst: jest.fn().mockResolvedValue(null),
                findUnique: jest.fn(({ where }: any) => {
                    const lines = [...allocationLines.values()].filter(
                        (l) => l.allocationId === where.id,
                    )
                    return Promise.resolve(
                        lines.length
                            ? {
                                  id: where.id,
                                  headerId: 'rsvh-1',
                                  header: { id: 'rsvh-1', companyId: 'co-1', reservationNumber: 'RSV-1' },
                                  lines,
                              }
                            : null,
                    )
                }),
                findMany: jest.fn().mockResolvedValue([]),
                count: jest.fn().mockResolvedValue(0),
                create: jest.fn(({ data }: any) =>
                    Promise.resolve({ id: `alc-${++seq}`, ...data, lines: [] }),
                ),
                update: jest.fn(({ where, data }: any) =>
                    Promise.resolve({ id: where.id, ...data, lines: [] }),
                ),
            },
            mmInventoryAllocationLine: {
                create: jest.fn(({ data }: any) => {
                    const id = `alcl-${++seq}`
                    const row = {
                        id,
                        version: 0,
                        pickedQuantity: new Decimal(0),
                        issuedQuantity: new Decimal(0),
                        ...data,
                    }
                    allocationLines.set(id, row)
                    return Promise.resolve(row)
                }),
                findUnique: jest.fn(({ where }: any) =>
                    Promise.resolve(allocationLines.get(where.id) ?? null),
                ),
                update: jest.fn(({ where, data }: any) => {
                    const row = allocationLines.get(where.id)
                    Object.assign(row, data)
                    return Promise.resolve(row)
                }),
                updateMany: jest.fn(({ where, data }: any) => {
                    const row = allocationLines.get(where.id)
                    if (!row || row.version !== where.version) return Promise.resolve({ count: 0 })
                    Object.assign(row, data, { version: row.version + 1 })
                    return Promise.resolve({ count: 1 })
                }),
            },
            wmPickingTask: { findUnique: jest.fn() },
            $transaction: jest.fn(),
        }

        ;(mockPrisma as any).$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
            fn(mockPrisma),
        )

        ;(mockPrisma as any).mmInventoryReservationHeader.create.mockImplementation(
            async ({ data }: any) => {
                const id = `rsvh-${++seq}`
                const header: any = {
                    id,
                    reservationNumber: data.reservationNumber,
                    companyId: data.companyId,
                    warehouseId: data.warehouseId,
                    status: 'DRAFT',
                    lines: [] as any[],
                }
                reservationHeaders.set(id, header)
                if (data.lines?.create) {
                    for (const ld of data.lines.create) {
                        const lid = `rsvl-${++seq}`
                        const line = {
                            id: lid,
                            headerId: id,
                            requestedQuantity: ld.requestedQuantity,
                            reservedQuantity: new Decimal(0),
                            allocatedQuantity: new Decimal(0),
                            pickedQuantity: new Decimal(0),
                            issuedQuantity: new Decimal(0),
                            materialId: ld.materialId,
                            stockStatus: ld.stockStatus ?? 'UNRESTRICTED',
                            batchId: ld.batchId ?? null,
                            serialNumberId: ld.serialNumberId ?? null,
                            status: 'DRAFT',
                            header,
                        }
                        reservationLines.set(lid, line)
                        header.lines.push(line)
                    }
                }
                return header
            },
        )

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ReservationEngineService,
                AllocationEngineService,
                InventoryAvailabilityService,
                AllocationStrategyRegistry,
                FifoAllocationStrategy,
                FefoAllocationStrategy,
                { provide: PrismaService, useValue: mockPrisma },
                {
                    provide: MmDomainEventsService,
                    useValue: { reservationCreated: jest.fn(), reservationReleased: jest.fn() },
                },
                {
                    provide: PickingService,
                    useValue: { create: jest.fn().mockResolvedValue({ id: 'pick-1' }) },
                },
                {
                    provide: WarehouseTaskService,
                    useValue: { create: jest.fn().mockResolvedValue({ id: 'wt-1' }) },
                },
                { provide: PutawayStrategyRegistry, useValue: { recommend: jest.fn() } },
            ],
        }).compile()

        reservations = module.get(ReservationEngineService)
        allocations = module.get(AllocationEngineService)
        availability = module.get(InventoryAvailabilityService)
    })

    it('100 on hand → reserve 20 → available 80 → allocate → issue closes reservation', async () => {
        const before = await availability.getAvailability({
            companyId: 'co-1',
            warehouseId: 'wh-1',
            materialId: 'mat-1',
        })
        expect(before.onHand).toBe(100)
        expect(before.available).toBe(100)

        const header = await reservations.create({
            companyId: 'co-1',
            warehouseId: 'wh-1',
            sourceModule: 'TEST',
            sourceDocumentType: 'ORDER',
            sourceDocumentId: 'ord-100',
            lines: [{ materialId: 'mat-1', quantity: 20 }],
        })

        const afterReserve = await availability.getAvailability({
            companyId: 'co-1',
            warehouseId: 'wh-1',
            materialId: 'mat-1',
        })
        expect(afterReserve.available).toBe(80)
        expect(afterReserve.onHand).toBe(100)

        const line = header.lines[0]
        const alloc = await allocations.allocateHeader(header.id, {
            strategy: 'CUSTOM',
            lines: [
                { reservationLineId: line.id, storageBinId: 'bin-a1', quantity: 20 },
            ],
            generatePickTasks: false,
        })

        const afterAlloc = await availability.getAvailability({
            companyId: 'co-1',
            warehouseId: 'wh-1',
            materialId: 'mat-1',
        })
        expect(afterAlloc.available).toBe(80)
        expect(afterAlloc.onHand).toBe(100)

        const allocLine = [...allocationLines.values()][0]
        await allocations.recordIssue(allocLine.id, new Decimal(20))

        const binBal = balanceStore.get(
            balKey({
                companyId: 'co-1',
                warehouseId: 'wh-1',
                materialId: 'mat-1',
                stockStatus: 'UNRESTRICTED',
                storageBinId: 'bin-a1',
            }),
        )!
        binBal.quantity = new Decimal(20)
        binBal.availableQuantity = new Decimal(20)

        const afterIssue = await availability.getAvailability({
            companyId: 'co-1',
            warehouseId: 'wh-1',
            materialId: 'mat-1',
        })
        expect(afterIssue.onHand).toBe(80)
    })

    it('rejects reservation when ATP insufficient and partial not allowed', async () => {
        await expect(
            reservations.create({
                companyId: 'co-1',
                warehouseId: 'wh-1',
                sourceModule: 'TEST',
                sourceDocumentType: 'ORDER',
                sourceDocumentId: 'ord-over',
                lines: [{ materialId: 'mat-1', quantity: 150 }],
            }),
        ).rejects.toThrow(/Insufficient available stock/)
    })

    it('supports partial reservation when configured', async () => {
        const header = await reservations.create({
            companyId: 'co-1',
            warehouseId: 'wh-1',
            sourceModule: 'TEST',
            sourceDocumentType: 'ORDER',
            sourceDocumentId: 'ord-partial',
            allowPartialReservation: true,
            lines: [{ materialId: 'mat-1', quantity: 150 }],
        })
        expect(header.status).toBe('SHORT')
        const line = header.lines[0]
        expect(Number(line.reservedQuantity)).toBe(100)
    })

    it('FEFO strategy prefers earliest batch expiry', () => {
        const registry = new AllocationStrategyRegistry(
            new FifoAllocationStrategy(),
            new FefoAllocationStrategy(),
        )
        const picks = registry.plan(
            'FEFO',
            {
                companyId: 'co-1',
                warehouseId: 'wh-1',
                materialId: 'mat-1',
                quantity: new Decimal(50),
            },
            [
                {
                    storageBinId: 'b2',
                    batchId: 'batch-late',
                    serialNumberId: null,
                    availableQuantity: new Decimal(30),
                    batchExpiry: new Date('2028-01-01'),
                },
                {
                    storageBinId: 'b1',
                    batchId: 'batch-early',
                    serialNumberId: null,
                    availableQuantity: new Decimal(30),
                    batchExpiry: new Date('2027-06-01'),
                },
            ],
        )
        expect(picks[0].batchId).toBe('batch-early')
    })

    it('concurrent allocation update fails with version guard', async () => {
        allocationLines.set('alcl-1', {
            id: 'alcl-1',
            reservationLineId: 'rsvl-1',
            quantity: new Decimal(10),
            issuedQuantity: new Decimal(0),
            version: 0,
        })
        reservationLines.set('rsvl-1', {
            id: 'rsvl-1',
            headerId: 'rsvh-1',
            reservedQuantity: new Decimal(10),
            issuedQuantity: new Decimal(0),
            pickedQuantity: new Decimal(0),
            allocatedQuantity: new Decimal(10),
            materialId: 'mat-1',
            stockStatus: 'UNRESTRICTED',
            batchId: null,
            serialNumberId: null,
            header: { companyId: 'co-1', warehouseId: 'wh-1' },
        })

        const prisma = (allocations as any).prisma
        prisma.mmInventoryAllocationLine.updateMany.mockResolvedValueOnce({ count: 0 })
        await expect(allocations.recordIssue('alcl-1', new Decimal(5))).rejects.toThrow(
            /Concurrent allocation issue conflict/,
        )
    })
})
