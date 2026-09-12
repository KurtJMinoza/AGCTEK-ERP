import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PutawayService } from './putaway/putaway.service'
import { PickingService } from './picking/picking.service'
import { PackingService } from './packing/packing.service'
import { TransfersService } from './transfers/transfers.service'
import { StorageBinsService } from './storage-bins.service'
import { WarehouseService } from './warehouse.service'
import { InventoryPostingService } from '../inventory/inventory-posting.service'
import { MmDomainEventsService } from '../common/mm-domain-events.service'
import { WarehouseTaskService } from './tasks/warehouse-task.service'
import { PutawayStrategyRegistry } from './tasks/strategies/putaway-strategy.registry'
import { PrismaService } from '../../prisma/prisma.service'

const mockPosting = {
    postTransaction: jest.fn().mockResolvedValue({ id: 'tx1' }),
    reverseTransaction: jest.fn(),
}

const mockPrisma: any = {
    plant: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    branch: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    warehouse: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
    },
    wmStorageType: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    wmStorageSection: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    wmStorageBin: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
    },
    wmWarehouseAudit: { create: jest.fn() },
    wmPutawayTask: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
    },
    wmPickingTask: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
    },
    wmPackage: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
    },
    wmPackageItem: { findFirst: jest.fn(), update: jest.fn() },
    wmWarehouseTransfer: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
    },
    wmWarehouseTransferLine: { update: jest.fn() },
    mmInventoryBalance: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        aggregate: jest.fn(),
        groupBy: jest.fn(),
    },
    mmMaterial: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
    },
    wmInventoryBalance: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
    },
}

describe('MM-03 Warehouse Management', () => {
    let putawayService: PutawayService
    let pickingService: PickingService
    let packingService: PackingService
    let transfersService: TransfersService
    let storageBinsService: StorageBinsService

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PutawayService,
                PickingService,
                PackingService,
                TransfersService,
                StorageBinsService,
                WarehouseService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: InventoryPostingService, useValue: mockPosting },
                {
                    provide: MmDomainEventsService,
                    useValue: { inventoryTransferred: jest.fn() },
                },
                {
                    provide: WarehouseTaskService,
                    useValue: {
                        create: jest.fn().mockResolvedValue({ id: 'wt1', destinationBinId: 'bin-rec' }),
                        assign: jest.fn(),
                        start: jest.fn(),
                        complete: jest.fn(),
                        cancel: jest.fn(),
                    },
                },
                {
                    provide: PutawayStrategyRegistry,
                    useValue: { recommend: jest.fn().mockResolvedValue('bin-rec') },
                },
            ],
        }).compile()

        putawayService = module.get(PutawayService)
        pickingService = module.get(PickingService)
        packingService = module.get(PackingService)
        transfersService = module.get(TransfersService)
        storageBinsService = module.get(StorageBinsService)
        jest.clearAllMocks()
        mockPosting.postTransaction.mockResolvedValue({ id: 'tx1' })
    })

    describe('Hierarchy (Plant → Warehouse → Type → Section → Bin)', () => {
        it('creates warehouse linked to plant and branch FKs', async () => {
            mockPrisma.company = { findUnique: jest.fn().mockResolvedValue({ id: 'co1' }) }
            mockPrisma.warehouse.findFirst.mockResolvedValue(null)
            mockPrisma.warehouse.create.mockResolvedValue({
                id: 'wh1',
                code: 'WH-000001',
                plantId: 'plant1',
                branchId: 'branch1',
                managerId: 'mgr-1',
            })
            mockPrisma.wmWarehouseAudit = { create: jest.fn() }

            const warehouseService = new WarehouseService(mockPrisma as any)
            const result = await warehouseService.create({
                name: 'Main WH',
                companyId: 'co1',
                plantId: 'plant1',
                branchId: 'branch1',
                managerId: 'mgr-1',
            })

            expect(mockPrisma.warehouse.create).toHaveBeenCalled()
            const data = mockPrisma.warehouse.create.mock.calls[0][0].data
            expect(data.plantId).toBe('plant1')
            expect(data.branchId).toBe('branch1')
            expect(data.managerId).toBe('mgr-1')
            expect(result.plantId).toBe('plant1')
        })
    })

    describe('Bin capacity from MmInventoryBalance', () => {
        it('aggregates occupancy from MM balances only', async () => {
            mockPrisma.wmStorageBin.findMany.mockResolvedValue([
                {
                    id: 'bin1',
                    status: 'ACTIVE',
                    capacityQuantity: new Decimal(100),
                    capacityWeight: new Decimal(0),
                    capacityVolume: new Decimal(0),
                },
                {
                    id: 'bin2',
                    status: 'ACTIVE',
                    capacityQuantity: new Decimal(50),
                    capacityWeight: new Decimal(0),
                    capacityVolume: new Decimal(0),
                },
            ])
            mockPrisma.mmInventoryBalance.findMany.mockResolvedValue([
                { storageBinId: 'bin1', quantity: new Decimal(40) },
                { storageBinId: 'bin1', quantity: new Decimal(10) },
                { storageBinId: 'bin2', quantity: new Decimal(5) },
            ])

            const summary = await storageBinsService.getCapacitySummary()
            expect(summary.totalOccupiedQuantity).toBe(55)
            expect(summary.totalCapacityQuantity).toBe(150)
            expect(summary.totalCapacityQty).toBe(150)
            expect(summary.utilizationPct).toBe(37)
        })

        it('exposes live occupancy on capacity details (not writable occupancy)', async () => {
            mockPrisma.wmStorageBin.findMany.mockResolvedValue([
                {
                    id: 'bin1',
                    code: 'A-01',
                    status: 'ACTIVE',
                    capacityQuantity: new Decimal(100),
                    capacityWeight: new Decimal(0),
                    capacityVolume: new Decimal(0),
                    storageSection: { storageType: { warehouse: { id: 'wh1' } } },
                },
            ])
            mockPrisma.mmInventoryBalance.findMany.mockResolvedValue([
                { storageBinId: 'bin1', quantity: new Decimal(25) },
            ])

            const details = await storageBinsService.findAllWithOccupancy({})
            expect(details[0].currentQuantity).toBe(25)
            expect(details[0].remainingQuantity).toBe(75)
            expect(details[0].utilizationPct).toBe(25)
        })
    })

    describe('Putaway', () => {
        const pendingTask = {
            id: 'pa1',
            status: 'PENDING',
            warehouseId: 'wh1',
            materialId: 'mat1',
            companyId: 'co1',
            uomId: 'uom1',
            sourceBinId: 'src-bin',
            batchId: null,
            serialId: null,
            stockStatus: 'UNRESTRICTED',
            assignedWorker: null,
        }

        const activeBin = {
            id: 'dst-bin',
            status: 'ACTIVE',
            putawayAllowed: true,
            capacityQuantity: new Decimal(100),
            capacityWeight: new Decimal(0),
            capacityVolume: new Decimal(0),
            storageSection: {
                storageType: {
                    warehouseId: 'wh1',
                    putawayAllowed: true,
                    qualityControlled: false,
                },
            },
        }

        it('confirm posts TRANSFER_OUT then TRANSFER_IN via InventoryPostingService', async () => {
            mockPrisma.wmPutawayTask.findUnique.mockResolvedValue(pendingTask)
            mockPrisma.wmPutawayTask.updateMany.mockResolvedValue({ count: 1 })
            mockPrisma.wmStorageBin.findUnique.mockResolvedValue(activeBin)
            mockPrisma.mmInventoryBalance.aggregate.mockResolvedValue({
                _sum: { quantity: new Decimal(10) },
            })
            mockPrisma.mmMaterial.findUnique.mockResolvedValue({
                id: 'mat1',
                baseUomId: 'uom1',
                weight: null,
                volume: null,
            })
            mockPrisma.warehouse.findUnique.mockResolvedValue({
                id: 'wh1',
                companyId: 'co1',
            })
            mockPrisma.wmPutawayTask.update.mockResolvedValue({
                ...pendingTask,
                status: 'COMPLETED',
                actualBinId: 'dst-bin',
            })

            await putawayService.confirm('pa1', {
                actualBinId: 'dst-bin',
                quantity: 5,
                idempotencyKey: 'idem-1',
            })

            expect(mockPosting.postTransaction).toHaveBeenCalledTimes(2)
            expect(mockPosting.postTransaction.mock.calls[0][0].movementType).toBe(
                'TRANSFER_OUT',
            )
            expect(mockPosting.postTransaction.mock.calls[1][0].movementType).toBe(
                'TRANSFER_IN',
            )
            expect(mockPosting.postTransaction.mock.calls[1][0].storageBinId).toBe(
                'dst-bin',
            )
        })

        it('rejects over-capacity confirm', async () => {
            mockPrisma.wmPutawayTask.findUnique.mockResolvedValue(pendingTask)
            mockPrisma.wmPutawayTask.updateMany.mockResolvedValue({ count: 1 })
            mockPrisma.wmStorageBin.findUnique.mockResolvedValue({
                ...activeBin,
                capacityQuantity: new Decimal(20),
            })
            mockPrisma.mmInventoryBalance.aggregate.mockResolvedValue({
                _sum: { quantity: new Decimal(18) },
            })
            mockPrisma.mmMaterial.findUnique.mockResolvedValue({
                id: 'mat1',
                baseUomId: 'uom1',
            })

            await expect(
                putawayService.confirm('pa1', {
                    actualBinId: 'dst-bin',
                    quantity: 5,
                }),
            ).rejects.toThrow(/capacity/i)
            expect(mockPosting.postTransaction).not.toHaveBeenCalled()
        })

        it('rejects double-confirm (concurrency)', async () => {
            mockPrisma.wmPutawayTask.findUnique.mockResolvedValue(pendingTask)
            mockPrisma.wmPutawayTask.updateMany.mockResolvedValue({ count: 0 })

            await expect(
                putawayService.confirm('pa1', {
                    actualBinId: 'dst-bin',
                    quantity: 5,
                }),
            ).rejects.toThrow(BadRequestException)
            expect(mockPosting.postTransaction).not.toHaveBeenCalled()
        })
        it('rejects scanned bin mismatch on confirm', async () => {
            mockPrisma.wmPutawayTask.findUnique.mockResolvedValue(pendingTask)
            mockPrisma.wmStorageBin.findFirst.mockResolvedValue({
                id: 'other-bin',
                code: 'WRONG',
            })

            await expect(
                putawayService.confirm('pa1', {
                    actualBinId: 'dst-bin',
                    quantity: 5,
                    scannedBinCode: 'WRONG',
                }),
            ).rejects.toThrow(/does not match/i)
            expect(mockPosting.postTransaction).not.toHaveBeenCalled()
        })
    })

    describe('Picking strategies', () => {
        const balances = [
            {
                storageBinId: 'bin-z',
                batchId: null,
                serialNumberId: null,
                quantity: new Decimal(50),
                updatedAt: new Date('2024-01-01'),
                batch: { manufacturingDate: new Date('2024-06-01'), expiryDate: new Date('2026-01-01') },
                storageBin: {
                    code: 'Z-99',
                    pickingAllowed: true,
                    status: 'ACTIVE',
                    storageSection: {
                        code: 'ZONE-B',
                        name: 'Zone B',
                        storageType: { code: 'BULK' },
                    },
                },
            },
            {
                storageBinId: 'bin-a',
                batchId: null,
                serialNumberId: null,
                quantity: new Decimal(50),
                updatedAt: new Date('2024-02-01'),
                batch: { manufacturingDate: new Date('2024-01-01'), expiryDate: new Date('2025-06-01') },
                storageBin: {
                    code: 'A-01',
                    pickingAllowed: true,
                    status: 'ACTIVE',
                    storageSection: {
                        code: 'ZONE-A',
                        name: 'Zone A',
                        storageType: { code: 'PICKING' },
                    },
                },
            },
        ]

        beforeEach(() => {
            mockPrisma.mmInventoryBalance.findMany.mockResolvedValue(balances)
        })

        it('FIFO prefers earliest manufacturing / age', async () => {
            const result = await pickingService.suggestSourceBin(
                'co1',
                'wh1',
                'mat1',
                10,
                'FIFO',
            )
            expect(result.storageBinId).toBe('bin-a')
            expect(result.strategy).toBe('FIFO')
        })

        it('FEFO prefers earliest expiry', async () => {
            const result = await pickingService.suggestSourceBin(
                'co1',
                'wh1',
                'mat1',
                10,
                'FEFO',
            )
            expect(result.storageBinId).toBe('bin-a')
            expect(result.strategy).toBe('FEFO')
        })

        it('NEAREST prefers lowest bin code walk sequence', async () => {
            const result = await pickingService.suggestSourceBin(
                'co1',
                'wh1',
                'mat1',
                10,
                'NEAREST',
            )
            expect(result.storageBinId).toBe('bin-a')
            expect(result.strategy).toBe('NEAREST')
        })

        it('ZONE filters to matching section/type code', async () => {
            const result = await pickingService.suggestSourceBin(
                'co1',
                'wh1',
                'mat1',
                10,
                'ZONE',
                null,
                null,
                'ZONE-B',
            )
            expect(result.storageBinId).toBe('bin-z')
            expect(result.strategy).toBe('ZONE')
        })

        it('partial pick sets PARTIALLY_PICKED without ledger post', async () => {
            mockPrisma.wmPickingTask.findUnique.mockResolvedValue({
                id: 'pk1',
                status: 'OPEN',
                sourceBinId: 'bin-a',
                materialId: 'mat1',
                requiredQty: new Decimal(10),
                pickedQty: new Decimal(0),
                batchId: null,
                serialId: null,
                waveId: null,
                lastIdempotencyKey: null,
            })
            mockPrisma.mmMaterial.findUnique.mockResolvedValue({
                id: 'mat1',
                batchManaged: false,
                serialManaged: false,
            })
            mockPrisma.wmPickingTask.update.mockResolvedValue({
                id: 'pk1',
                status: 'PARTIALLY_PICKED',
                pickedQty: new Decimal(4),
            })

            const result = await pickingService.confirmPick('pk1', {
                scannedBinId: 'bin-a',
                scannedMaterialId: 'mat1',
                pickedQty: 4,
            })

            expect(result.status).toBe('PARTIALLY_PICKED')
            expect(mockPosting.postTransaction).not.toHaveBeenCalled()
        })
    })

    describe('Packing', () => {
        it('mismatch blocks READY_FOR_DISPATCH and sets EXCEPTION', async () => {
            mockPrisma.wmPackage.findUnique.mockResolvedValue({
                id: 'pkg1',
                status: 'VERIFIED',
                items: [
                    {
                        id: 'i1',
                        expectedQty: new Decimal(10),
                        scannedQty: new Decimal(8),
                    },
                ],
            })
            mockPrisma.wmPackage.update.mockResolvedValue({ id: 'pkg1', status: 'EXCEPTION' })

            await expect(packingService.markReadyForDispatch('pkg1')).rejects.toThrow(
                BadRequestException,
            )
            expect(mockPrisma.wmPackage.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: { status: 'EXCEPTION' },
                }),
            )
        })

        it('allows READY_FOR_DISPATCH when all lines match', async () => {
            mockPrisma.wmPackage.findUnique.mockResolvedValue({
                id: 'pkg1',
                status: 'VERIFIED',
                items: [
                    {
                        id: 'i1',
                        expectedQty: new Decimal(10),
                        scannedQty: new Decimal(10),
                    },
                ],
            })
            mockPrisma.wmPackage.update.mockResolvedValue({
                id: 'pkg1',
                status: 'READY_FOR_DISPATCH',
            })

            const result = await packingService.markReadyForDispatch('pkg1')
            expect(result.status).toBe('READY_FOR_DISPATCH')
        })
    })

    describe('Transfers (ledger)', () => {
        const transferDoc = {
            id: 'tr1',
            status: 'PICKED',
            sourceWarehouseId: 'wh-src',
            destinationWarehouseId: 'wh-dst',
            requestedBy: 'user1',
            lines: [
                {
                    id: 'line1',
                    materialId: 'mat1',
                    quantity: new Decimal(10),
                    pickedQty: new Decimal(10),
                    receivedQty: new Decimal(0),
                    sourceBinId: 'bin-src',
                    destinationBinId: 'bin-dst',
                    batchId: null,
                    serialId: null,
                },
            ],
        }

        it('dispatch posts TRANSFER_OUT + dest IN_TRANSIT IN and sets IN_TRANSIT', async () => {
            mockPrisma.wmWarehouseTransfer.updateMany.mockResolvedValue({ count: 1 })
            mockPrisma.wmWarehouseTransfer.findUnique.mockResolvedValue({
                ...transferDoc,
                status: 'IN_TRANSIT',
            })
            mockPrisma.warehouse.findUnique.mockResolvedValue({
                id: 'wh-src',
                companyId: 'co1',
            })
            mockPrisma.mmMaterial.findMany.mockResolvedValue([
                { id: 'mat1', baseUomId: 'uom1' },
            ])

            await transfersService.dispatch('tr1')

            expect(mockPosting.postTransaction).toHaveBeenCalledTimes(2)
            expect(mockPosting.postTransaction.mock.calls[0][0]).toMatchObject({
                movementType: 'TRANSFER_OUT',
                warehouseId: 'wh-src',
                storageBinId: 'bin-src',
                stockStatus: 'UNRESTRICTED',
                quantity: 10,
            })
            expect(mockPosting.postTransaction.mock.calls[1][0]).toMatchObject({
                movementType: 'TRANSFER_IN',
                warehouseId: 'wh-dst',
                stockStatus: 'IN_TRANSIT',
                quantity: 10,
            })
            expect(mockPrisma.wmInventoryBalance.create).not.toHaveBeenCalled()
            expect(mockPrisma.wmInventoryBalance.update).not.toHaveBeenCalled()
        })

        it('receive clears IN_TRANSIT then credits UNRESTRICTED', async () => {
            mockPrisma.warehouse.findUnique.mockResolvedValue({
                id: 'wh-dst',
                companyId: 'co1',
            })
            mockPrisma.mmMaterial.findUnique.mockResolvedValue({
                id: 'mat1',
                baseUomId: 'uom1',
            })
            mockPrisma.wmWarehouseTransferLine.update.mockResolvedValue({})
            mockPrisma.wmWarehouseTransfer.findUnique
                .mockResolvedValueOnce({
                    ...transferDoc,
                    status: 'IN_TRANSIT',
                })
                .mockResolvedValueOnce({
                    ...transferDoc,
                    status: 'IN_TRANSIT',
                    lines: [
                        {
                            ...transferDoc.lines[0],
                            receivedQty: new Decimal(4),
                            status: 'PENDING',
                        },
                    ],
                })

            await transfersService.receive('tr1', 'line1', 4)

            expect(mockPosting.postTransaction).toHaveBeenCalledTimes(2)
            expect(mockPosting.postTransaction.mock.calls[0][0]).toMatchObject({
                movementType: 'TRANSFER_OUT',
                warehouseId: 'wh-dst',
                stockStatus: 'IN_TRANSIT',
                quantity: 4,
            })
            expect(mockPosting.postTransaction.mock.calls[1][0]).toMatchObject({
                movementType: 'TRANSFER_IN',
                warehouseId: 'wh-dst',
                storageBinId: 'bin-dst',
                stockStatus: 'UNRESTRICTED',
                quantity: 4,
            })
        })

        it('complete closes doc without posting when lines fully received', async () => {
            const receivedDoc = {
                ...transferDoc,
                status: 'RECEIVED',
                lines: [
                    {
                        ...transferDoc.lines[0],
                        receivedQty: new Decimal(10),
                        status: 'RECEIVED',
                    },
                ],
            }
            mockPrisma.wmWarehouseTransfer.findUnique
                .mockResolvedValueOnce(receivedDoc)
                .mockResolvedValueOnce({ ...receivedDoc, status: 'COMPLETED' })
            mockPrisma.wmWarehouseTransfer.updateMany.mockResolvedValue({ count: 1 })

            await transfersService.complete('tr1')

            expect(mockPosting.postTransaction).not.toHaveBeenCalled()
            expect(mockPrisma.wmWarehouseTransfer.updateMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: { status: 'COMPLETED' },
                }),
            )
        })

        it('rejects complete when lines not fully received', async () => {
            mockPrisma.wmWarehouseTransfer.findUnique.mockResolvedValue({
                ...transferDoc,
                status: 'IN_TRANSIT',
                lines: [
                    {
                        ...transferDoc.lines[0],
                        receivedQty: new Decimal(2),
                    },
                ],
            })

            await expect(transfersService.complete('tr1')).rejects.toThrow(
                /not fully received/i,
            )
            expect(mockPosting.postTransaction).not.toHaveBeenCalled()
        })

        it('rejects concurrent double-dispatch', async () => {
            mockPrisma.wmWarehouseTransfer.updateMany.mockResolvedValue({ count: 0 })
            mockPrisma.wmWarehouseTransfer.findUnique.mockResolvedValue({
                ...transferDoc,
                status: 'IN_TRANSIT',
            })

            await expect(transfersService.dispatch('tr1')).rejects.toThrow(
                BadRequestException,
            )
            expect(mockPosting.postTransaction).not.toHaveBeenCalled()
        })
    })

    describe('Derived bin hierarchy', () => {
        it('exposes warehouseId and storageTypeId on list', async () => {
            mockPrisma.wmStorageBin.findMany.mockResolvedValue([
                {
                    id: 'bin1',
                    code: 'A-01',
                    storageSectionId: 'sec1',
                    capacityQuantity: new Decimal(100),
                    storageSection: {
                        storageType: {
                            id: 'type1',
                            warehouseId: 'wh1',
                            warehouse: { id: 'wh1' },
                        },
                    },
                },
            ])

            const result = await storageBinsService.findAll({})
            expect(result[0].warehouseId).toBe('wh1')
            expect(result[0].storageTypeId).toBe('type1')
        })
    })

    describe('WAVE strategy with zone', () => {
        it('WAVE with zoneCode filters then nearest bin', async () => {
            mockPrisma.mmInventoryBalance.findMany.mockResolvedValue([
                {
                    storageBinId: 'bin-z',
                    batchId: null,
                    serialNumberId: null,
                    quantity: new Decimal(50),
                    updatedAt: new Date('2024-01-01'),
                    batch: null,
                    storageBin: {
                        code: 'Z-01',
                        pickingAllowed: true,
                        status: 'ACTIVE',
                        storageSection: {
                            code: 'ZONE-B',
                            name: 'Zone B',
                            storageType: { code: 'BULK' },
                        },
                    },
                },
                {
                    storageBinId: 'bin-a',
                    batchId: null,
                    serialNumberId: null,
                    quantity: new Decimal(50),
                    updatedAt: new Date('2024-01-01'),
                    batch: null,
                    storageBin: {
                        code: 'A-01',
                        pickingAllowed: true,
                        status: 'ACTIVE',
                        storageSection: {
                            code: 'ZONE-A',
                            name: 'Zone A',
                            storageType: { code: 'PICKING' },
                        },
                    },
                },
            ])

            const result = await pickingService.suggestSourceBin(
                'co1',
                'wh1',
                'mat1',
                10,
                'WAVE',
                null,
                null,
                'ZONE-B',
            )
            expect(result.storageBinId).toBe('bin-z')
            expect(result.strategy).toBe('WAVE')
        })
    })
})
