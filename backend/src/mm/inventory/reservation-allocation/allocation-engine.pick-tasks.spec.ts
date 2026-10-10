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
            findFirst: jest.fn(({ where }: { where: { allocationLineId: string } }) =>
                Promise.resolve(existingByAllocLine[where.allocationLineId] ?? null),
            ),
            create: jest.fn((args: { data: Record<string, unknown> }) =>
                Promise.resolve({ id: `pk-${Math.random()}`, ...args.data }),
            ),
        },
        mmInventoryReservation: {
            findFirst: jest.fn().mockResolvedValue(null),
        },
        mmInventoryReservationHeader: {
            update: jest.fn().mockResolvedValue({}),
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
    jest.spyOn(engine, 'findOne').mockResolvedValue(
        allocation as never,
    )
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
})