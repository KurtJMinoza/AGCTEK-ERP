import type { PrismaService } from '../../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { AllocationEngineService } from './allocation-engine.service'

/**
 * Picking task generation for split stock (serial/batch managed): ONE task per
 * ALLOCATION LINE — many allocation lines share one reservation line, so the
 * old reservation-line dedupe collapsed every serial into a single pick task
 * and under-picked the order (18 ordered → 1 pick of qty 1).
 */
function makeEngine(
    allocation: Record<string, unknown>,
    existingByAllocLine: Record<string, unknown> = {},
) {
    const prisma = {
        wmPickingTask: {
            findFirst: jest.fn(
                ({
                    where,
                }: {
                    where: {
                        allocationLineId: string
                        status?: { not?: string }
                    }
                }) => {
                    const existing =
                        existingByAllocLine[where.allocationLineId] ?? null
                    // Honour the non-cancelled filter the way Prisma would.
                    if (
                        existing &&
                        where.status?.not === 'CANCELLED' &&
                        (existing as { status?: string }).status === 'CANCELLED'
                    ) {
                        return Promise.resolve(null)
                    }
                    return Promise.resolve(existing)
                },
            ),
            create: jest.fn((args: { data: Record<string, unknown> }) =>
                Promise.resolve({ id: `pk-${Math.random()}`, ...args.data }),
            ),
            findMany: jest.fn().mockResolvedValue([
                {
                    id: 'pk-created',
                    reservationHeaderId: 'rsvh-1',
                    status: 'OPEN',
                },
            ]),
        },
        mmInventoryReservation: {
            findFirst: jest.fn().mockResolvedValue(null),
        },
        mmInventoryReservationHeader: {
            update: jest.fn().mockResolvedValue({}),
            findUnique: jest.fn().mockResolvedValue({
                id: 'rsvh-1',
                status: 'PICKING',
                lines: [
                    {
                        reservedQuantity: new Decimal(1),
                        allocatedQuantity: new Decimal(1),
                    },
                ],
            }),
        },
        mmInventoryAllocation: {
            findMany: jest.fn().mockResolvedValue([{ id: 'alloc-1' }]),
        },
        mmInventoryReservationLine: {
            findUnique: jest
                .fn()
                .mockResolvedValue({ demandReferenceLineId: 'so-line-1' }),
        },
    }
    const picking = {
        create: jest.fn().mockResolvedValue({ id: 'pk-created' }),
    }
    const engine = new AllocationEngineService(
        prisma as unknown as PrismaService,
        {} as never,
        {} as never,
        picking as never,
        {} as never,
    )
    jest.spyOn(engine, 'findOne').mockResolvedValue(allocation as never)
    return { prisma, picking, engine }
}

const baseAllocation = (lines: Array<Record<string, unknown>>) => ({
    id: 'alloc-1',
    header: {
        id: 'rsvh-1',
        companyId: 'co-1',
        reservationNumber: 'RSV-20261009-00001',
        sourceDocumentType: 'SALES_ORDER',
        sourceDocumentId: 'so-1',
        status: 'ACTIVE',
    },
    lines,
})

describe('AllocationEngineService.generatePickTasks', () => {
    it('creates one pick task per allocation line even when they share a reservation line (serial stock)', async () => {
        const { prisma, picking, engine } = makeEngine(
            baseAllocation([
                {
                    id: 'al-1',
                    status: 'ACTIVE',
                    reservationLineId: 'rline-1',
                    quantity: new Decimal(1),
                    pickedQuantity: new Decimal(0),
                    warehouseId: 'wh-1',
                    storageBinId: 'bin-1',
                    materialId: 'mat-1',
                    batchId: null,
                    serialNumberId: 'serial-1',
                },
                {
                    id: 'al-2',
                    status: 'ACTIVE',
                    reservationLineId: 'rline-1',
                    quantity: new Decimal(1),
                    pickedQuantity: new Decimal(0),
                    warehouseId: 'wh-1',
                    storageBinId: 'bin-1',
                    materialId: 'mat-1',
                    batchId: null,
                    serialNumberId: 'serial-2',
                },
                {
                    id: 'al-3',
                    status: 'ACTIVE',
                    reservationLineId: 'rline-1',
                    quantity: new Decimal(1),
                    pickedQuantity: new Decimal(0),
                    warehouseId: 'wh-1',
                    storageBinId: 'bin-1',
                    materialId: 'mat-1',
                    batchId: null,
                    serialNumberId: 'serial-3',
                },
            ]),
        )
        await engine.generatePickTasks('alloc-1')
        expect(picking.create).toHaveBeenCalledTimes(3)
        const serials = picking.create.mock.calls.map(
            (call) => call[0].serialId,
        )
        expect(serials).toEqual(
            expect.arrayContaining(['serial-1', 'serial-2', 'serial-3']),
        )
        expect(
            picking.create.mock.calls.every(
                (call) => call[0].salesOrderId === 'so-1',
            ),
        ).toBe(true)
        expect(
            picking.create.mock.calls.every(
                (call) => call[0].salesOrderLineId === 'so-line-1',
            ),
        ).toBe(true)
    })

    it('never duplicates an existing pick task for an allocation line', async () => {
        const { prisma, picking, engine } = makeEngine(
            baseAllocation([
                {
                    id: 'al-1',
                    status: 'ACTIVE',
                    reservationLineId: 'rline-1',
                    quantity: new Decimal(1),
                    pickedQuantity: new Decimal(0),
                    warehouseId: 'wh-1',
                    storageBinId: 'bin-1',
                    materialId: 'mat-1',
                    batchId: null,
                    serialNumberId: null,
                },
                {
                    id: 'al-2',
                    status: 'ACTIVE',
                    reservationLineId: 'rline-1',
                    quantity: new Decimal(1),
                    pickedQuantity: new Decimal(0),
                    warehouseId: 'wh-1',
                    storageBinId: 'bin-1',
                    materialId: 'mat-1',
                    batchId: null,
                    serialNumberId: null,
                },
            ]),
            { 'al-1': { id: 'pk-existing' } },
        )
        await engine.generatePickTasks('alloc-1')
        expect(picking.create).toHaveBeenCalledTimes(1)
    })

    it('re-creates a pick task when the only existing task was cancelled', async () => {
        const { prisma, picking, engine } = makeEngine(
            baseAllocation([
                {
                    id: 'al-1',
                    status: 'ACTIVE',
                    reservationLineId: 'rline-1',
                    quantity: new Decimal(1),
                    pickedQuantity: new Decimal(0),
                    warehouseId: 'wh-1',
                    storageBinId: 'bin-1',
                    materialId: 'mat-1',
                    batchId: null,
                    serialNumberId: null,
                },
            ]),
            { 'al-1': { id: 'pk-cancelled', status: 'CANCELLED' } },
        )

        await engine.generatePickTasks('alloc-1')

        expect(prisma.wmPickingTask.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    allocationLineId: 'al-1',
                    status: { not: 'CANCELLED' },
                }),
            }),
        )
        // The cancelled task is filtered out, so the line is re-picked.
        expect(picking.create).toHaveBeenCalledTimes(1)
    })

    it('repairs a taskless existing allocation instead of creating an empty replacement allocation', async () => {
        const { prisma, picking, engine } = makeEngine(
            baseAllocation([
                {
                    id: 'al-1',
                    status: 'ACTIVE',
                    reservationLineId: 'rline-1',
                    quantity: new Decimal(1),
                    pickedQuantity: new Decimal(0),
                    warehouseId: 'wh-1',
                    storageBinId: 'bin-1',
                    materialId: 'mat-1',
                    batchId: null,
                    serialNumberId: null,
                },
            ]),
        )
        const allocate = jest.spyOn(engine, 'allocateHeader')

        await engine.ensurePickTasksForHeader('rsvh-1')

        expect(prisma.mmInventoryAllocation.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { headerId: 'rsvh-1', status: { not: 'RELEASED' } },
            }),
        )
        expect(allocate).not.toHaveBeenCalled()
        expect(picking.create).toHaveBeenCalledTimes(1)
        expect(prisma.wmPickingTask.findMany).toHaveBeenCalledWith({
            where: {
                reservationHeaderId: 'rsvh-1',
                status: { not: 'CANCELLED' },
            },
            orderBy: { createdAt: 'asc' },
        })
    })
})

describe('AllocationEngineService allocation validation', () => {
    it('fails clearly instead of persisting an empty allocation for unlocated stock', async () => {
        const header = {
            id: 'rsvh-1',
            status: 'RESERVED',
            companyId: 'co-1',
            warehouseId: 'wh-1',
            lines: [
                {
                    id: 'rline-1',
                    materialId: 'mat-1',
                    stockStatus: 'UNRESTRICTED',
                    batchId: null,
                    serialNumberId: null,
                    reservedQuantity: new Decimal(10),
                    allocatedQuantity: new Decimal(0),
                },
            ],
        }
        const tx = {
            mmInventoryAllocation: { create: jest.fn() },
            mmInventoryBalance: {
                aggregate: jest.fn().mockResolvedValue({
                    _sum: { availableQuantity: new Decimal(40) },
                }),
            },
        }
        const prisma = {
            mmInventoryReservationHeader: {
                findUnique: jest.fn().mockResolvedValue(header),
            },
            mmInventoryAllocation: { findFirst: jest.fn() },
            mmMaterial: {
                findUnique: jest.fn().mockResolvedValue({
                    batchManaged: false,
                    serialManaged: false,
                }),
            },
            $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
                operation(tx),
            ),
        }
        const engine = new AllocationEngineService(
            prisma as unknown as PrismaService,
            { plan: jest.fn().mockReturnValue([]) } as never,
            {} as never,
            {} as never,
            {} as never,
        )
        const internals = engine as unknown as {
            nextAllocationNumber: () => Promise<string>
            loadCandidates: () => Promise<unknown[]>
        }
        internals.nextAllocationNumber = async () => 'ALC-20261011-00001'
        internals.loadCandidates = async () => []

        await expect(
            engine.allocateHeader('rsvh-1', {
                reservationHeaderId: 'rsvh-1',
            }),
        ).rejects.toThrow(
            'No pickable stock location for mat-1. 40 unit(s) are not assigned to a storage bin.',
        )
        expect(tx.mmInventoryAllocation.create).toHaveBeenCalled()
        expect(prisma.$transaction).toHaveBeenCalled()
    })
})
