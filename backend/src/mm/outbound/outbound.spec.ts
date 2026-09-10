import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../prisma/prisma.service'
import { ReservationService } from './reservation.service'
import { InventoryAvailabilityService } from './inventory-availability.service'
import { PickingService } from '../warehouse/picking/picking.service'
import { PackingService } from '../warehouse/packing/packing.service'
import { GoodsIssueService } from '../stock-ops/goods-issue.service'
import { InventoryPostingService } from '../inventory/inventory-posting.service'

const mockPrisma: any = {
    mmInventoryBalance: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
    },
    mmInventoryReservation: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
    },
    mmMaterial: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
    },
    warehouse: {
        findUnique: jest.fn(),
    },
    wmPickingTask: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
    },
    wmPickWave: {
        findUnique: jest.fn(),
        update: jest.fn(),
    },
    wmPackage: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
    },
    wmPackageItem: {
        findFirst: jest.fn(),
        update: jest.fn(),
    },
    mmGoodsIssue: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
    },
    mmInventoryTransaction: {
        findMany: jest.fn(),
    },
    mmAccountingEvent: {
        create: jest.fn(),
    },
    $transaction: jest.fn((fn: any) => fn(mockPrisma)),
}

const mockPosting: any = {
    postTransaction: jest.fn(),
    reverseTransaction: jest.fn(),
}

const mockEvents: any = { emit: jest.fn() }

describe('MM-10 Outbound', () => {
    let availability: InventoryAvailabilityService
    let reservations: ReservationService
    let picking: PickingService
    let packing: PackingService
    let gi: GoodsIssueService

    beforeEach(async () => {
        jest.resetAllMocks()
        mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockPrisma))

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                InventoryAvailabilityService,
                ReservationService,
                PickingService,
                PackingService,
                GoodsIssueService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: InventoryPostingService, useValue: mockPosting },
                { provide: EventEmitter2, useValue: mockEvents },
            ],
        }).compile()

        availability = module.get(InventoryAvailabilityService)
        reservations = module.get(ReservationService)
        picking = module.get(PickingService)
        packing = module.get(PackingService)
        gi = module.get(GoodsIssueService)
    })

    describe('ATP', () => {
        it('computes Available = Unrestricted − Reservations (restricted separate)', async () => {
            mockPrisma.mmInventoryBalance.findMany.mockResolvedValue([
                {
                    id: 'b1',
                    stockStatus: 'UNRESTRICTED',
                    quantity: new Decimal(100),
                    reservedQuantity: new Decimal(30),
                    availableQuantity: new Decimal(70),
                    storageBinId: 'bin1',
                    batchId: null,
                    serialNumberId: null,
                },
                {
                    id: 'b2',
                    stockStatus: 'QUALITY_INSPECTION',
                    quantity: new Decimal(20),
                    reservedQuantity: new Decimal(0),
                    availableQuantity: new Decimal(0),
                    storageBinId: 'bin2',
                    batchId: null,
                    serialNumberId: null,
                },
            ])

            const atp = await availability.getAtp({
                companyId: 'co',
                warehouseId: 'wh',
                materialId: 'mat',
            })

            expect(atp.unrestrictedStock).toBe(100)
            expect(atp.existingReservations).toBe(30)
            expect(atp.restrictedStock).toBe(20)
            expect(atp.available).toBe(70)
        })
    })

    describe('Reservation', () => {
        it('rejects reservation when ATP insufficient', async () => {
            mockPrisma.mmInventoryBalance.findMany.mockResolvedValue([
                {
                    stockStatus: 'UNRESTRICTED',
                    quantity: new Decimal(10),
                    reservedQuantity: new Decimal(8),
                    availableQuantity: new Decimal(2),
                    storageBinId: 'bin1',
                    batchId: null,
                    serialNumberId: null,
                },
            ])

            await expect(
                reservations.create({
                    companyId: 'co',
                    warehouseId: 'wh',
                    materialId: 'mat',
                    quantity: 5,
                    sourceType: 'SALES_ORDER',
                    sourceModule: 'SD',
                    sourceDocumentType: 'SO',
                    sourceDocumentId: 'so-1',
                }),
            ).rejects.toThrow(BadRequestException)
        })

        it('creates reservation without changing on-hand quantity', async () => {
            mockPrisma.mmInventoryBalance.findMany
                .mockResolvedValueOnce([
                    {
                        stockStatus: 'UNRESTRICTED',
                        quantity: new Decimal(100),
                        reservedQuantity: new Decimal(0),
                        availableQuantity: new Decimal(100),
                        storageBinId: 'bin1',
                        batchId: null,
                        serialNumberId: null,
                    },
                ])
                .mockResolvedValueOnce([
                    {
                        id: 'bal-1',
                        stockStatus: 'UNRESTRICTED',
                        quantity: new Decimal(100),
                        reservedQuantity: new Decimal(0),
                        availableQuantity: new Decimal(100),
                        storageBinId: 'bin1',
                        batchId: null,
                        serialNumberId: null,
                    },
                ])
            mockPrisma.mmInventoryReservation.findFirst.mockResolvedValue(null)
            mockPrisma.mmInventoryBalance.update.mockResolvedValue({})
            mockPrisma.mmInventoryReservation.create.mockResolvedValue({
                id: 'rsv-1',
                reservationNumber: 'RSV-000001',
                quantity: new Decimal(10),
                reservedQuantity: new Decimal(10),
                status: 'OPEN',
            })

            const rsv = await reservations.create({
                companyId: 'co',
                warehouseId: 'wh',
                materialId: 'mat',
                quantity: 10,
                sourceType: 'INTERNAL_REQUEST',
                sourceModule: 'MM',
                sourceDocumentType: 'IMR',
                sourceDocumentId: 'imr-1',
            })

            expect(rsv.status).toBe('OPEN')
            expect(mockPrisma.mmInventoryBalance.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        reservedQuantity: expect.anything(),
                        availableQuantity: expect.anything(),
                    }),
                }),
            )
            // quantity (on-hand) must not be in the update payload
            const updateArg = mockPrisma.mmInventoryBalance.update.mock.calls[0][0]
            expect(updateArg.data.quantity).toBeUndefined()
        })
    })

    describe('Picking scan', () => {
        it('rejects mismatched bin scan', async () => {
            mockPrisma.wmPickingTask.findUnique.mockResolvedValue({
                id: 'pk-1',
                status: 'ASSIGNED',
                sourceBinId: 'bin-A',
                materialId: 'mat-1',
                batchId: null,
                serialId: null,
                requiredQty: new Decimal(5),
                pickedQty: new Decimal(0),
                waveId: null,
            })

            await expect(
                picking.confirmPick('pk-1', {
                    scannedBinId: 'bin-B',
                    scannedMaterialId: 'mat-1',
                    pickedQty: 2,
                }),
            ).rejects.toThrow(/bin/i)
        })

        it('supports partial pick without inventory deduction', async () => {
            mockPrisma.wmPickingTask.findUnique.mockResolvedValue({
                id: 'pk-1',
                status: 'ASSIGNED',
                sourceBinId: 'bin-A',
                materialId: 'mat-1',
                batchId: null,
                serialId: null,
                requiredQty: new Decimal(10),
                pickedQty: new Decimal(0),
                waveId: null,
                lastIdempotencyKey: null,
            })
            mockPrisma.mmMaterial.findUnique.mockResolvedValue({
                id: 'mat-1',
                batchManaged: false,
                serialManaged: false,
            })
            mockPrisma.wmPickingTask.update.mockResolvedValue({
                id: 'pk-1',
                status: 'PARTIALLY_PICKED',
                pickedQty: new Decimal(4),
            })

            const result = await picking.confirmPick('pk-1', {
                scannedBinId: 'bin-A',
                scannedMaterialId: 'mat-1',
                pickedQty: 4,
                idempotencyKey: 'pick-1',
            })

            expect(result.status).toBe('PARTIALLY_PICKED')
            expect(mockPosting.postTransaction).not.toHaveBeenCalled()
        })

        it('requires batch scan for batch-managed material', async () => {
            mockPrisma.wmPickingTask.findUnique.mockResolvedValue({
                id: 'pk-1',
                status: 'OPEN',
                sourceBinId: 'bin-A',
                materialId: 'mat-1',
                batchId: 'batch-1',
                serialId: null,
                requiredQty: new Decimal(1),
                pickedQty: new Decimal(0),
                waveId: null,
            })
            mockPrisma.mmMaterial.findUnique.mockResolvedValue({
                batchManaged: true,
                serialManaged: false,
            })

            await expect(
                picking.confirmPick('pk-1', {
                    scannedBinId: 'bin-A',
                    scannedMaterialId: 'mat-1',
                    pickedQty: 1,
                }),
            ).rejects.toThrow(/batch/i)
        })

        it('requires serial scan for serial-managed material', async () => {
            mockPrisma.wmPickingTask.findUnique.mockResolvedValue({
                id: 'pk-1',
                status: 'OPEN',
                sourceBinId: 'bin-A',
                materialId: 'mat-1',
                batchId: null,
                serialId: 'ser-1',
                requiredQty: new Decimal(1),
                pickedQty: new Decimal(0),
                waveId: null,
            })
            mockPrisma.mmMaterial.findUnique.mockResolvedValue({
                batchManaged: false,
                serialManaged: true,
            })

            await expect(
                picking.confirmPick('pk-1', {
                    scannedBinId: 'bin-A',
                    scannedMaterialId: 'mat-1',
                    pickedQty: 1,
                }),
            ).rejects.toThrow(/serial/i)
        })

        it('is idempotent on duplicate confirm key', async () => {
            mockPrisma.wmPickingTask.findUnique.mockResolvedValue({
                id: 'pk-1',
                status: 'PARTIALLY_PICKED',
                sourceBinId: 'bin-A',
                materialId: 'mat-1',
                batchId: null,
                serialId: null,
                requiredQty: new Decimal(10),
                pickedQty: new Decimal(4),
                waveId: null,
                lastIdempotencyKey: 'same-key',
            })
            mockPrisma.wmPickingTask.findFirst.mockResolvedValue({
                id: 'pk-1',
                lastIdempotencyKey: 'same-key',
            })

            const result = await picking.confirmPick('pk-1', {
                scannedBinId: 'bin-A',
                scannedMaterialId: 'mat-1',
                pickedQty: 4,
                idempotencyKey: 'same-key',
            })

            expect(result.id).toBe('pk-1')
            expect(mockPrisma.wmPickingTask.update).not.toHaveBeenCalled()
        })
    })

    describe('Pack verification', () => {
        it('blocks READY_FOR_DISPATCH when contents mismatch', async () => {
            mockPrisma.wmPackage.findUnique.mockResolvedValue({
                id: 'pkg-1',
                status: 'VERIFIED',
                items: [
                    {
                        expectedQty: new Decimal(5),
                        scannedQty: new Decimal(3),
                    },
                ],
            })

            await expect(packing.markReadyForDispatch('pkg-1')).rejects.toThrow(
                /match/i,
            )
        })

        it('allows READY_FOR_DISPATCH when contents match', async () => {
            mockPrisma.wmPackage.findUnique.mockResolvedValue({
                id: 'pkg-1',
                status: 'VERIFIED',
                items: [
                    {
                        expectedQty: new Decimal(5),
                        scannedQty: new Decimal(5),
                    },
                ],
            })
            mockPrisma.wmPackage.update.mockResolvedValue({
                id: 'pkg-1',
                status: 'READY_FOR_DISPATCH',
                items: [],
            })

            const result = await packing.markReadyForDispatch('pkg-1')
            expect(result.status).toBe('READY_FOR_DISPATCH')
        })
    })

    describe('Goods Issue', () => {
        it('posts ISSUE with ON_HAND check when reservation linked and emits accounting event', async () => {
            mockPrisma.mmGoodsIssue.findUnique.mockResolvedValue({
                id: 'gi-1',
                status: 'DRAFT',
                companyId: 'co',
                warehouseId: 'wh',
                reservationId: 'rsv-1',
                packageId: null,
                postingDate: new Date(),
                documentDate: new Date(),
                issuePurpose: 'SALES',
                createdBy: null,
                lines: [
                    {
                        id: 'gil-1',
                        materialId: 'mat-1',
                        quantity: new Decimal(2),
                        uomId: 'uom-1',
                        storageBinId: 'bin-1',
                        batchId: null,
                        serialNumberId: null,
                        reservationId: 'rsv-1',
                        pickingTaskId: null,
                        unitCost: new Decimal(10),
                        totalCost: new Decimal(20),
                    },
                ],
            })
            mockPrisma.mmMaterial.findUnique.mockResolvedValue({
                batchManaged: false,
                serialManaged: false,
            })
            mockPrisma.mmInventoryReservation.findUnique.mockResolvedValue({
                id: 'rsv-1',
                status: 'OPEN',
                quantity: new Decimal(10),
                fulfilledQuantity: new Decimal(0),
                reservedQuantity: new Decimal(10),
            })
            mockPrisma.mmInventoryReservation.update.mockResolvedValue({
                status: 'PARTIAL',
            })
            mockPosting.postTransaction.mockResolvedValue({ id: 'txn-1' })
            mockPrisma.mmGoodsIssue.update.mockResolvedValue({
                id: 'gi-1',
                status: 'POSTED',
                lines: [],
            })
            mockPrisma.mmAccountingEvent.create.mockResolvedValue({})

            const result = await gi.post('gi-1')
            expect(result.status).toBe('POSTED')
            expect(mockPosting.postTransaction).toHaveBeenCalledWith(
                expect.objectContaining({
                    movementType: 'ISSUE',
                    stockCheckMode: 'ON_HAND',
                    releaseReservedQuantity: 2,
                }),
            )
            expect(mockPrisma.mmAccountingEvent.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        eventType: 'GOODS_ISSUE_POSTED',
                    }),
                }),
            )
        })

        it('rejects create when insufficient reservation open qty', async () => {
            mockPrisma.mmInventoryReservation.findUnique.mockResolvedValue({
                id: 'rsv-1',
                status: 'OPEN',
                quantity: new Decimal(2),
                fulfilledQuantity: new Decimal(0),
            })
            mockPrisma.mmMaterial.findUnique.mockResolvedValue({
                batchManaged: false,
                serialManaged: false,
            })

            await expect(
                gi.create({
                    companyId: 'co',
                    warehouseId: 'wh',
                    reservationId: 'rsv-1',
                    postingDate: new Date().toISOString(),
                    documentDate: new Date().toISOString(),
                    lines: [
                        {
                            materialId: 'mat-1',
                            quantity: 5,
                            uomId: 'uom-1',
                            storageBinId: 'bin-1',
                        },
                    ],
                }),
            ).rejects.toThrow(BadRequestException)
        })
    })
})
