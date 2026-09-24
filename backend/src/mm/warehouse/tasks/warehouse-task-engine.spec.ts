import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../../prisma/prisma.service'
import { InventoryPostingService } from '../../inventory/inventory-posting.service'
import { WarehouseTaskService } from './warehouse-task.service'
import { TaskAssignmentService } from './task-assignment.service'
import { WarehouseExceptionService } from './warehouse-exception.service'
import { PutawayCompletionHandler } from './task-completion/putaway-completion.handler'
import { PickCompletionHandler } from './task-completion/pick-completion.handler'
import { TransferCompletionHandler } from './task-completion/transfer-completion.handler'
import { RelocationCompletionHandler } from './task-completion/relocation-completion.handler'
import { PutawayStrategyRegistry } from './strategies/putaway-strategy.registry'
import { PutawayService } from '../putaway/putaway.service'
import { PickingService } from '../picking/picking.service'

const mockPrisma = {
    wmWarehouseTask: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
    },
    wmWarehouseTaskException: {
        create: jest.fn(),
        updateMany: jest.fn(),
    },
    wmPutawayTask: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
    },
    wmPickingTask: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
    },
    warehouse: {
        findUnique: jest.fn(),
    },
    wmStorageBin: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
    },
    mmMaterial: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
    },
    mmInventoryBalance: {
        findFirst: jest.fn(),
    },
}

const mockPosting = {
    postTransaction: jest.fn(),
    reverseTransaction: jest.fn(),
}

const mockPutawayStrategy = {
    recommend: jest.fn().mockResolvedValue('bin-rec'),
}

describe('Warehouse Task Engine', () => {
    let taskService: WarehouseTaskService
    let exceptionService: WarehouseExceptionService
    let putawayService: PutawayService
    let pickingService: PickingService
    let putawayCompletion: PutawayCompletionHandler
    let pickCompletion: PickCompletionHandler

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WarehouseTaskService,
                TaskAssignmentService,
                WarehouseExceptionService,
                PutawayCompletionHandler,
                PickCompletionHandler,
                TransferCompletionHandler,
                RelocationCompletionHandler,
                PutawayService,
                PickingService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: InventoryPostingService, useValue: mockPosting },
                { provide: PutawayStrategyRegistry, useValue: mockPutawayStrategy },
            ],
        }).compile()

        taskService = module.get(WarehouseTaskService)
        exceptionService = module.get(WarehouseExceptionService)
        putawayService = module.get(PutawayService)
        pickingService = module.get(PickingService)
        putawayCompletion = module.get(PutawayCompletionHandler)
        pickCompletion = module.get(PickCompletionHandler)
        jest.clearAllMocks()
    })

    const baseTask = {
        id: 'wt1',
        taskNumber: 'WT-20260911-00001',
        companyId: 'co1',
        plantId: 'pl1',
        warehouseId: 'wh1',
        taskType: 'PUTAWAY',
        priority: 5,
        status: 'IN_PROGRESS',
        sourceBinId: 'src-bin',
        destinationBinId: 'dest-bin',
        materialId: 'mat1',
        batchId: null,
        serialId: null,
        quantity: new Decimal(100),
        completedQuantity: new Decimal(0),
        uomId: 'uom1',
        stockStatus: 'UNRESTRICTED',
        assignedUserId: 'user1',
        startedAt: new Date(),
        completedAt: null,
        cancelledAt: null,
        exceptionReason: null,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
    }

    it('1. creates putaway task from GR with legacy bridge', async () => {
        mockPrisma.warehouse.findUnique.mockResolvedValue({ id: 'wh1', companyId: 'co1', plantId: 'pl1' })
        mockPrisma.wmWarehouseTask.findFirst.mockResolvedValueOnce(null)
        mockPrisma.wmWarehouseTask.create.mockResolvedValue({
            ...baseTask,
            destinationBinId: 'bin-rec',
        })
        mockPrisma.wmPutawayTask.findFirst.mockResolvedValue(null)
        mockPrisma.wmPutawayTask.create.mockResolvedValue({
            id: 'pa1',
            taskNumber: 'PA-000001',
            warehouseTaskId: 'wt1',
            status: 'PENDING',
        })

        const result = await putawayService.createFromGoodsReceiptLine({
            companyId: 'co1',
            warehouseId: 'wh1',
            goodsReceiptId: 'gr1',
            goodsReceiptLineId: 'grl1',
            materialId: 'mat1',
            quantity: 100,
            uomId: 'uom1',
        })

        expect(result.warehouseTaskId).toBe('wt1')
        expect(mockPrisma.wmPutawayTask.create).toHaveBeenCalled()
    })

    it('2. partial putaway → PARTIALLY_COMPLETED', async () => {
        mockPrisma.wmStorageBin.findUnique.mockResolvedValue({
            id: 'dest-bin',
            status: 'ACTIVE',
            putawayAllowed: true,
            storageSection: { storageType: { warehouseId: 'wh1', putawayAllowed: true } },
        })
        mockPrisma.warehouse.findUnique.mockResolvedValue({ id: 'wh1', companyId: 'co1' })
        mockPrisma.mmMaterial.findUnique.mockResolvedValue({ id: 'mat1', baseUomId: 'uom1' })
        mockPrisma.wmWarehouseTask.update.mockResolvedValue({
            ...baseTask,
            completedQuantity: new Decimal(40),
            status: 'PARTIALLY_COMPLETED',
        })

        const result = await putawayCompletion.complete(baseTask as any, {
            quantity: 40,
            destinationBinId: 'dest-bin',
        })

        expect(result.status).toBe('PARTIALLY_COMPLETED')
        expect(mockPosting.postTransaction).toHaveBeenCalled()
    })

    it('3. complete putaway → IPS TRANSFER called', async () => {
        mockPrisma.wmStorageBin.findUnique.mockResolvedValue({
            id: 'dest-bin',
            status: 'ACTIVE',
            putawayAllowed: true,
            storageSection: { storageType: { warehouseId: 'wh1', putawayAllowed: true } },
        })
        mockPrisma.warehouse.findUnique.mockResolvedValue({ id: 'wh1', companyId: 'co1' })
        mockPrisma.mmMaterial.findUnique.mockResolvedValue({ id: 'mat1', baseUomId: 'uom1' })
        mockPrisma.wmWarehouseTask.update.mockResolvedValue({
            ...baseTask,
            completedQuantity: new Decimal(100),
            status: 'COMPLETED',
        })
        mockPrisma.wmPutawayTask.findFirst.mockResolvedValue(null)

        await putawayCompletion.complete(baseTask as any, {
            quantity: 100,
            destinationBinId: 'dest-bin',
        })

        expect(mockPosting.postTransaction).toHaveBeenCalledWith(
            expect.objectContaining({ movementType: 'TRANSFER_OUT' }),
        )
        expect(mockPosting.postTransaction).toHaveBeenCalledWith(
            expect.objectContaining({ movementType: 'TRANSFER_IN' }),
        )
    })

    it('4. wrong bin → exception via report', async () => {
        mockPrisma.wmWarehouseTask.findUnique.mockResolvedValue({
            ...baseTask,
            status: 'IN_PROGRESS',
        })
        mockPrisma.wmWarehouseTaskException.create.mockResolvedValue({ id: 'ex1' })
        mockPrisma.wmWarehouseTask.update.mockResolvedValue({
            ...baseTask,
            status: 'EXCEPTION',
            exceptionReason: 'WRONG_BIN',
        })

        const result = await exceptionService.report('wt1', {
            exceptionCode: 'WRONG_BIN',
            details: 'Scanned bin mismatch',
        })

        expect(result.status).toBe('EXCEPTION')
    })

    it('5. picking task from reservation bridge', async () => {
        mockPrisma.warehouse.findUnique.mockResolvedValue({ id: 'wh1', companyId: 'co1' })
        mockPrisma.mmMaterial.findFirst.mockResolvedValue({ id: 'mat1', baseUomId: 'uom1' })
        mockPrisma.mmInventoryBalance.findFirst.mockResolvedValue({ quantity: new Decimal(50) })
        mockPrisma.wmWarehouseTask.findFirst.mockResolvedValue(null)
        mockPrisma.wmWarehouseTask.create.mockResolvedValue({
            ...baseTask,
            id: 'wt-pick',
            taskType: 'PICK',
            sourceBinId: 'bin1',
        })
        mockPrisma.wmPickingTask.findFirst.mockResolvedValue(null)
        mockPrisma.wmPickingTask.create.mockResolvedValue({
            id: 'pk1',
            taskNumber: 'PK-000001',
            warehouseTaskId: 'wt-pick',
            status: 'OPEN',
        })

        const result = await pickingService.create({
            warehouseId: 'wh1',
            sourceBinId: 'bin1',
            materialId: 'mat1',
            requiredQty: 10,
        })

        expect(result.warehouseTaskId).toBe('wt-pick')
    })

    it('6. partial pick → PARTIALLY_COMPLETED', async () => {
        const pickTask = {
            ...baseTask,
            id: 'wt-pick',
            taskType: 'PICK',
            sourceBinId: 'bin1',
            quantity: new Decimal(10),
        }
        mockPrisma.mmMaterial.findUnique.mockResolvedValue({
            id: 'mat1',
            batchManaged: false,
            serialManaged: false,
        })
        mockPrisma.wmWarehouseTask.update.mockResolvedValue({
            ...pickTask,
            completedQuantity: new Decimal(4),
            status: 'PARTIALLY_COMPLETED',
        })
        mockPrisma.wmPickingTask.findFirst.mockResolvedValue({ id: 'pk1' })
        mockPrisma.wmPickingTask.update.mockResolvedValue({})

        const result = await pickCompletion.complete(pickTask as any, {
            quantity: 4,
            sourceBinId: 'bin1',
            scannedBinId: 'bin1',
        })

        expect(result.status).toBe('PARTIALLY_COMPLETED')
        expect(mockPosting.postTransaction).not.toHaveBeenCalled()
    })

    it('7. batch pick validation fails on mismatch', async () => {
        const pickTask = {
            ...baseTask,
            taskType: 'PICK',
            sourceBinId: 'bin1',
            batchId: 'batch-expected',
        }
        mockPrisma.mmMaterial.findUnique.mockResolvedValue({
            id: 'mat1',
            batchManaged: true,
            serialManaged: false,
        })

        await expect(
            pickCompletion.complete(pickTask as any, {
                quantity: 1,
                sourceBinId: 'bin1',
                scannedBinId: 'bin1',
                scannedBatchId: 'batch-wrong',
            }),
        ).rejects.toThrow(BadRequestException)
    })

    it('8. serial pick validation fails when missing', async () => {
        const pickTask = {
            ...baseTask,
            taskType: 'PICK',
            sourceBinId: 'bin1',
            serialId: 'serial-1',
        }
        mockPrisma.mmMaterial.findUnique.mockResolvedValue({
            id: 'mat1',
            batchManaged: false,
            serialManaged: true,
        })

        await expect(
            pickCompletion.complete(pickTask as any, {
                quantity: 1,
                sourceBinId: 'bin1',
                scannedBinId: 'bin1',
            }),
        ).rejects.toThrow(BadRequestException)
    })

    it('9. task reassignment updates assignee', async () => {
        mockPrisma.wmWarehouseTask.findUnique.mockResolvedValue({
            ...baseTask,
            status: 'ASSIGNED',
            putawayBridge: { id: 'pa1' },
            pickingBridge: null,
        })
        mockPrisma.wmWarehouseTask.update.mockResolvedValue({
            ...baseTask,
            assignedUserId: 'user2',
            status: 'ASSIGNED',
        })
        mockPrisma.wmPutawayTask.update.mockResolvedValue({})

        const result = await taskService.reassign('wt1', 'user2')
        expect(result.assignedUserId).toBe('user2')
    })

    it('10. task cancellation', async () => {
        mockPrisma.wmWarehouseTask.findUnique.mockResolvedValue({
            ...baseTask,
            putawayBridge: { id: 'pa1' },
            pickingBridge: null,
        })
        mockPrisma.wmWarehouseTask.update.mockResolvedValue({
            ...baseTask,
            status: 'CANCELLED',
        })
        mockPrisma.wmPutawayTask.update.mockResolvedValue({})

        const result = await taskService.cancel('wt1')
        expect(result.status).toBe('CANCELLED')
    })

    it('11. exception handling sets status', async () => {
        mockPrisma.wmWarehouseTask.findUnique.mockResolvedValue({
            ...baseTask,
            status: 'IN_PROGRESS',
        })
        mockPrisma.wmWarehouseTaskException.create.mockResolvedValue({ id: 'ex1' })
        mockPrisma.wmWarehouseTask.update.mockResolvedValue({
            ...baseTask,
            status: 'EXCEPTION',
        })

        const result = await exceptionService.report('wt1', {
            exceptionCode: 'QUANTITY_MISMATCH',
        })
        expect(result.status).toBe('EXCEPTION')
    })

    it('12. findMyTasks filtered by assignee', async () => {
        mockPrisma.wmWarehouseTask.findMany.mockResolvedValue([baseTask])
        mockPrisma.wmWarehouseTask.count.mockResolvedValue(1)

        const result = await taskService.findMyTasks('user1', {})
        expect(result.data).toHaveLength(1)
        expect(mockPrisma.wmWarehouseTask.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ assignedUserId: 'user1' }),
            }),
        )
    })

    it('rejects reporting exception on unknown task', async () => {
        mockPrisma.wmWarehouseTask.findUnique.mockResolvedValue(null)
        await expect(
            exceptionService.report('missing', { exceptionCode: 'WRONG_BIN' }),
        ).rejects.toThrow(NotFoundException)
    })
})
