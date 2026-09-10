import { Test, TestingModule } from '@nestjs/testing'
import { PutawayService } from './putaway/putaway.service'
import { PickingService } from './picking/picking.service'
import { PackingService } from './packing/packing.service'
import { TransfersService } from './transfers/transfers.service'
import { InventoryBalanceService } from './inventory-balance/inventory-balance.service'
import { InventoryPostingService } from '../inventory/inventory-posting.service'
import { PrismaService } from '../../prisma/prisma.service'
import {
    NotFoundException,
    BadRequestException,
} from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'

const mockPrisma = {
    wmPutawayTask: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
    },
    wmStorageBin: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
    },
    wmPickingTask: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
    },
    wmPickWave: {
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
    wmPackageItem: {
        findFirst: jest.fn(),
        update: jest.fn(),
    },
    wmWarehouseTransfer: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
    },
    wmWarehouseTransferLine: {
        update: jest.fn(),
    },
    wmInventoryBalance: {
        upsert: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
    },
    mmInventoryBalance: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        aggregate: jest.fn(),
    },
    mmMaterial: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
    },
    warehouse: {
        findUnique: jest.fn(),
    },
    mmInventoryReservation: {
        findUnique: jest.fn(),
    },
}

describe('Warehouse Operations', () => {
    let putawayService: PutawayService
    let pickingService: PickingService
    let packingService: PackingService
    let transfersService: TransfersService
    let inventoryBalanceService: InventoryBalanceService

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PutawayService,
                PickingService,
                PackingService,
                TransfersService,
                InventoryBalanceService,
                { provide: PrismaService, useValue: mockPrisma },
                {
                    provide: InventoryPostingService,
                    useValue: {
                        postTransaction: jest.fn(),
                        reverseTransaction: jest.fn(),
                    },
                },
            ],
        }).compile()

        putawayService = module.get(PutawayService)
        pickingService = module.get(PickingService)
        packingService = module.get(PackingService)
        transfersService = module.get(TransfersService)
        inventoryBalanceService = module.get(InventoryBalanceService)
        jest.clearAllMocks()
    })

    describe('PutawayService', () => {
        it('should create a putaway task with auto-generated code', async () => {
            mockPrisma.wmPutawayTask.findFirst.mockResolvedValueOnce(null)
            mockPrisma.wmStorageBin.findMany.mockResolvedValue([])
            mockPrisma.wmPutawayTask.create.mockResolvedValue({
                id: '1',
                taskNumber: 'PA-000001',
                status: 'PENDING',
                materialId: 'mat1',
                warehouseId: 'wh1',
                quantity: 100,
                recommendedBinId: null,
            })

            const result = await putawayService.create({
                warehouseId: 'wh1',
                materialId: 'mat1',
                quantity: 100,
            })

            expect(result.taskNumber).toBe('PA-000001')
            expect(result.status).toBe('PENDING')
        })

        it('should reject confirming a COMPLETED task', async () => {
            mockPrisma.wmPutawayTask.findUnique.mockResolvedValue({
                id: '1',
                status: 'COMPLETED',
            })

            await expect(
                putawayService.confirm('1', {
                    actualBinId: 'bin1',
                    quantity: 10,
                }),
            ).rejects.toThrow(BadRequestException)
        })

        it('should reject confirming with inactive bin', async () => {
            mockPrisma.wmPutawayTask.findUnique.mockResolvedValue({
                id: '1',
                status: 'PENDING',
                materialId: 'mat1',
                warehouseId: 'wh1',
            })
            mockPrisma.wmPutawayTask.updateMany.mockResolvedValue({ count: 1 })
            mockPrisma.wmStorageBin.findUnique.mockResolvedValue({
                id: 'bin1',
                status: 'INACTIVE',
                putawayAllowed: true,
                storageSection: {
                    storageType: { warehouseId: 'wh1', putawayAllowed: true },
                },
            })

            await expect(
                putawayService.confirm('1', {
                    actualBinId: 'bin1',
                    quantity: 10,
                }),
            ).rejects.toThrow(BadRequestException)
        })

        it('should reject cancelling a COMPLETED task', async () => {
            mockPrisma.wmPutawayTask.findUnique.mockResolvedValue({
                id: '1',
                status: 'COMPLETED',
            })

            await expect(putawayService.cancel('1')).rejects.toThrow(
                BadRequestException,
            )
        })

        it('should only assign PENDING tasks', async () => {
            mockPrisma.wmPutawayTask.findUnique.mockResolvedValue({
                id: '1',
                status: 'IN_PROGRESS',
            })

            await expect(
                putawayService.assign('1', 'worker1'),
            ).rejects.toThrow(BadRequestException)
        })
    })

    describe('PickingService', () => {
        it('should create picking task with auto-generated code', async () => {
            mockPrisma.wmPickingTask.findFirst.mockResolvedValueOnce(null)
            mockPrisma.warehouse.findUnique.mockResolvedValue({
                id: 'wh1',
                companyId: 'co1',
            })
            mockPrisma.mmMaterial.findFirst.mockResolvedValue({
                id: 'mat1',
                baseUomId: 'uom1',
            })
            mockPrisma.mmInventoryBalance.findFirst.mockResolvedValue({
                quantity: new Decimal(100),
            })
            mockPrisma.wmPickingTask.create.mockResolvedValue({
                id: '1',
                taskNumber: 'PK-000001',
                status: 'OPEN',
            })

            const result = await pickingService.create({
                warehouseId: 'wh1',
                sourceBinId: 'bin1',
                materialId: 'mat1',
                requiredQty: 10,
            })

            expect(result.taskNumber).toBe('PK-000001')
        })

        it('should reject cancelling completed picking task', async () => {
            mockPrisma.wmPickingTask.findUnique.mockResolvedValue({
                id: '1',
                status: 'COMPLETED',
            })

            await expect(pickingService.cancel('1')).rejects.toThrow(
                BadRequestException,
            )
        })
    })

    describe('PackingService', () => {
        it('should create a package with auto-generated code', async () => {
            mockPrisma.wmPackage.findFirst.mockResolvedValueOnce(null)
            mockPrisma.wmPackage.create.mockResolvedValue({
                id: '1',
                packageNumber: 'PKG-000001',
                status: 'OPEN',
            })

            const result = await packingService.create({
                warehouseId: 'wh1',
                items: [{ materialId: 'mat1', expectedQty: 5 }],
            })

            expect(result.packageNumber).toBe('PKG-000001')
        })

        it('should verify a package and return exceptions if items not fully scanned', async () => {
            mockPrisma.wmPackage.findUnique.mockResolvedValue({
                id: '1',
                status: 'PACKING',
                items: [
                    {
                        id: 'i1',
                        materialId: 'mat1',
                        expectedQty: new Decimal(5),
                        scannedQty: new Decimal(3),
                        material: { materialCode: 'MAT-001', materialName: 'Test' },
                    },
                ],
            })

            const result = await packingService.verify('1') as any

            expect(result.verified).toBe(false)
            expect(result.exceptions).toHaveLength(1)
            expect(Number(result.exceptions[0].expectedQty) - Number(result.exceptions[0].scannedQty)).toBe(2)
        })

        it('should reject sealing an unverified package', async () => {
            mockPrisma.wmPackage.findUnique.mockResolvedValue({
                id: '1',
                status: 'OPEN',
            })

            await expect(packingService.seal('1')).rejects.toThrow(
                BadRequestException,
            )
        })
    })

    describe('TransfersService', () => {
        it('should create transfer with auto-generated code', async () => {
            mockPrisma.wmWarehouseTransfer.findFirst.mockResolvedValueOnce(null)
            mockPrisma.wmWarehouseTransfer.create.mockResolvedValue({
                id: '1',
                transferNumber: 'TO-000001',
                status: 'DRAFT',
                lines: [],
            })

            const result = await transfersService.create({
                sourceWarehouseId: 'wh1',
                destinationWarehouseId: 'wh2',
                lines: [{ materialId: 'mat1', quantity: 10 }],
            })

            expect(result.transferNumber).toBe('TO-000001')
            expect(result.status).toBe('DRAFT')
        })

        it('should only approve DRAFT transfers', async () => {
            mockPrisma.wmWarehouseTransfer.findUnique.mockResolvedValue({
                id: '1',
                status: 'IN_TRANSIT',
                lines: [],
            })

            await expect(transfersService.approve('1')).rejects.toThrow(
                BadRequestException,
            )
        })

        it('should only cancel DRAFT or APPROVED transfers', async () => {
            mockPrisma.wmWarehouseTransfer.findUnique.mockResolvedValue({
                id: '1',
                status: 'IN_TRANSIT',
                lines: [],
            })

            await expect(transfersService.cancel('1')).rejects.toThrow(
                BadRequestException,
            )
        })

        it('should reject dispatch of non-PICKED transfer', async () => {
            mockPrisma.wmWarehouseTransfer.updateMany.mockResolvedValue({ count: 0 })
            mockPrisma.wmWarehouseTransfer.findUnique.mockResolvedValue({
                id: '1',
                status: 'DRAFT',
                lines: [],
            })

            await expect(transfersService.dispatch('1')).rejects.toThrow(
                BadRequestException,
            )
        })
    })

    describe('InventoryBalanceService', () => {
        it('rejects addStock (stub mutations locked)', async () => {
            await expect(
                inventoryBalanceService.addStock('bin1', 'mat1', 100),
            ).rejects.toThrow(BadRequestException)
            expect(mockPrisma.wmInventoryBalance.create).not.toHaveBeenCalled()
        })

        it('rejects removeStock (stub mutations locked)', async () => {
            await expect(
                inventoryBalanceService.removeStock('bin1', 'mat1', 10),
            ).rejects.toThrow(BadRequestException)
            expect(mockPrisma.wmInventoryBalance.update).not.toHaveBeenCalled()
        })
    })
})
