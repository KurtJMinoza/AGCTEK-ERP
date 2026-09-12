import {
    Injectable,
    NotFoundException,
    BadRequestException,
    Inject,
    forwardRef,
} from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { InventoryPostingService } from '../../inventory/inventory-posting.service'
import { WarehouseTaskService } from '../tasks/warehouse-task.service'
import { PutawayStrategyRegistry } from '../tasks/strategies/putaway-strategy.registry'
import { CreatePutawayDto } from './dto/create-putaway.dto'
import { PutawayQueryDto } from './dto/putaway-query.dto'
import { ConfirmPutawayDto } from './dto/confirm-putaway.dto'
import { Decimal } from '@prisma/client/runtime/library'

export type CreatePutawayFromGrInput = {
    companyId: string
    warehouseId: string
    goodsReceiptId: string
    goodsReceiptLineId: string
    materialId: string
    quantity: number
    uomId: string
    batchId?: string
    serialId?: string
    stockStatus?: string
    sourceBinId?: string
    sourceDocument?: string
}

@Injectable()
export class PutawayService {
    constructor(
        private prisma: PrismaService,
        @Inject(forwardRef(() => InventoryPostingService))
        private posting: InventoryPostingService,
        @Inject(forwardRef(() => WarehouseTaskService))
        private warehouseTasks: WarehouseTaskService,
        private putawayStrategy: PutawayStrategyRegistry,
    ) {}

    private readonly includes = {
        material: true,
        recommendedBin: true,
        actualBin: true,
        warehouse: true,
        goodsReceipt: { select: { id: true, documentNumber: true } },
    }

    async findAll(query: PutawayQueryDto) {
        const {
            page = 1,
            limit = 20,
            status,
            warehouseId,
            assignedWorker,
            search,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = query

        const where: any = {}
        if (status) where.status = status
        if (warehouseId) where.warehouseId = warehouseId
        if (assignedWorker) where.assignedWorker = assignedWorker
        if (search) {
            where.OR = [
                { taskNumber: { contains: search, mode: 'insensitive' } },
                { sourceDocument: { contains: search, mode: 'insensitive' } },
            ]
        }

        const [data, total] = await Promise.all([
            this.prisma.wmPutawayTask.findMany({
                where,
                include: this.includes,
                orderBy: { [sortBy]: sortOrder },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.wmPutawayTask.count({ where }),
        ])

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    async findOne(id: string) {
        const task = await this.prisma.wmPutawayTask.findUnique({
            where: { id },
            include: this.includes,
        })
        if (!task) throw new NotFoundException('Putaway task not found')
        return task
    }

    async create(dto: CreatePutawayDto) {
        const wh = await this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } })
        if (!wh) throw new NotFoundException('Warehouse not found')

        const engineTask = await this.warehouseTasks.create({
            companyId: wh.companyId,
            warehouseId: dto.warehouseId,
            taskType: 'PUTAWAY',
            materialId: dto.materialId,
            quantity: dto.quantity,
            batchId: dto.batchId,
            serialId: dto.serialId,
            sourceBinId: dto.sourceLocation ?? undefined,
            stockStatus: 'UNRESTRICTED',
            referenceType: dto.sourceDocument ? 'MANUAL' : undefined,
            referenceId: dto.sourceDocument ?? undefined,
            priority: dto.priority,
            metadata: { sourceDocument: dto.sourceDocument },
        })

        const taskNumber = await this.generateNextCode()
        return this.prisma.wmPutawayTask.create({
            data: {
                taskNumber,
                companyId: wh.companyId,
                warehouseId: dto.warehouseId,
                materialId: dto.materialId,
                quantity: dto.quantity,
                batchId: dto.batchId ?? null,
                serialId: dto.serialId ?? null,
                sourceDocument: dto.sourceDocument ?? null,
                sourceLocation: dto.sourceLocation ?? null,
                priority: dto.priority ?? 5,
                recommendedBinId: engineTask.destinationBinId,
                warehouseTaskId: engineTask.id,
                stockStatus: 'UNRESTRICTED',
                status: 'PENDING',
            },
            include: this.includes,
        })
    }

    async createFromGoodsReceiptLine(input: CreatePutawayFromGrInput) {
        return this.createPutawayBridge({
            companyId: input.companyId,
            warehouseId: input.warehouseId,
            goodsReceiptId: input.goodsReceiptId,
            goodsReceiptLineId: input.goodsReceiptLineId,
            materialId: input.materialId,
            quantity: input.quantity,
            uomId: input.uomId,
            batchId: input.batchId,
            serialId: input.serialId,
            stockStatus: input.stockStatus ?? 'UNRESTRICTED',
            sourceBinId: input.sourceBinId,
            sourceDocument: input.sourceDocument,
        })
    }

    async createFromEvent(input: {
        companyId: string
        warehouseId: string
        materialId: string
        quantity: number
        sourceBinId?: string
        goodsReceiptLineId?: string
        stockStatus?: string
    }) {
        return this.createPutawayBridge({
            companyId: input.companyId,
            warehouseId: input.warehouseId,
            materialId: input.materialId,
            quantity: input.quantity,
            sourceBinId: input.sourceBinId,
            goodsReceiptLineId: input.goodsReceiptLineId,
            stockStatus: input.stockStatus ?? 'UNRESTRICTED',
            sourceDocument: input.goodsReceiptLineId
                ? `GR_LINE:${input.goodsReceiptLineId}`
                : 'PUTAWAY_EVENT',
        })
    }

    private async createPutawayBridge(input: {
        companyId: string
        warehouseId: string
        materialId: string
        quantity: number
        uomId?: string
        batchId?: string
        serialId?: string
        stockStatus: string
        sourceBinId?: string
        goodsReceiptId?: string
        goodsReceiptLineId?: string
        sourceDocument?: string
    }) {
        const engineTask = await this.warehouseTasks.create({
            companyId: input.companyId,
            warehouseId: input.warehouseId,
            taskType: 'PUTAWAY',
            materialId: input.materialId,
            quantity: input.quantity,
            uomId: input.uomId,
            batchId: input.batchId,
            serialId: input.serialId,
            sourceBinId: input.sourceBinId,
            stockStatus: input.stockStatus,
            referenceType: input.goodsReceiptLineId ? 'GOODS_RECEIPT_LINE' : 'PUTAWAY',
            referenceId: input.goodsReceiptLineId ?? input.goodsReceiptId,
            metadata: { sourceDocument: input.sourceDocument },
        })

        const taskNumber = await this.generateNextCode()
        return this.prisma.wmPutawayTask.create({
            data: {
                taskNumber,
                companyId: input.companyId,
                warehouseId: input.warehouseId,
                goodsReceiptId: input.goodsReceiptId ?? null,
                goodsReceiptLineId: input.goodsReceiptLineId ?? null,
                materialId: input.materialId,
                quantity: input.quantity,
                uomId: input.uomId ?? null,
                batchId: input.batchId ?? null,
                serialId: input.serialId ?? null,
                stockStatus: input.stockStatus,
                sourceBinId: input.sourceBinId ?? null,
                sourceDocument: input.sourceDocument ?? null,
                sourceLocation: input.sourceBinId ?? 'RECEIVING',
                recommendedBinId: engineTask.destinationBinId,
                warehouseTaskId: engineTask.id,
                priority: 5,
                status: 'PENDING',
            },
            include: this.includes,
        })
    }

    async assign(id: string, workerId: string) {
        const task = await this.findOne(id)
        if (task.status !== 'PENDING' && task.status !== 'ASSIGNED') {
            throw new BadRequestException('Only PENDING tasks can be assigned')
        }
        if (task.warehouseTaskId) {
            await this.warehouseTasks.assign(task.warehouseTaskId, workerId)
            return this.findOne(id)
        }
        return this.prisma.wmPutawayTask.update({
            where: { id },
            data: { assignedWorker: workerId, status: 'ASSIGNED' },
            include: this.includes,
        })
    }

    async confirm(id: string, dto: ConfirmPutawayDto) {
        const task = await this.findOne(id)
        if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
            throw new BadRequestException(`Cannot confirm a ${task.status} task`)
        }

        if (task.warehouseTaskId) {
            await this.warehouseTasks.complete(task.warehouseTaskId, {
                quantity: Number(dto.quantity),
                destinationBinId: dto.actualBinId,
                scannedBinCode: dto.scannedBinCode,
                performedBy: task.assignedWorker ?? undefined,
                idempotencyKey: dto.idempotencyKey,
            })
            return this.findOne(id)
        }

        if (dto.scannedBinCode?.trim()) {
            await this.assertScannedBinMatches(
                task.warehouseId,
                dto.actualBinId,
                dto.scannedBinCode.trim(),
            )
        }

        // Concurrent claim — only one confirm may proceed
        const claimed = await this.prisma.wmPutawayTask.updateMany({
            where: {
                id,
                status: { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'] },
            },
            data: { status: 'IN_PROGRESS' },
        })
        if (claimed.count === 0) {
            throw new BadRequestException('Putaway task already completed or being confirmed')
        }

        await this.assertBinAcceptsPutaway(
            dto.actualBinId,
            task.warehouseId,
            task.materialId,
            Number(dto.quantity),
        )

        const warehouse = await this.prisma.warehouse.findUnique({
            where: { id: task.warehouseId },
        })
        if (!warehouse) throw new NotFoundException('Warehouse not found')

        const companyId = task.companyId ?? warehouse.companyId
        const material = await this.prisma.mmMaterial.findUnique({
            where: { id: task.materialId },
        })
        if (!material) throw new NotFoundException('Material not found')

        const uomId = task.uomId ?? material.baseUomId
        const qty = Number(dto.quantity)
        const today = new Date().toISOString()
        const stockStatus = task.stockStatus || 'UNRESTRICTED'
        const idKey = dto.idempotencyKey

        if (task.sourceBinId) {
            await this.posting.postTransaction({
                companyId,
                warehouseId: task.warehouseId,
                storageBinId: task.sourceBinId,
                materialId: task.materialId,
                batchId: task.batchId ?? undefined,
                serialNumberId: task.serialId ?? undefined,
                stockStatus,
                movementType: 'TRANSFER_OUT',
                quantity: qty,
                uomId,
                postingDate: today,
                documentDate: today,
                sourceModule: 'WAREHOUSE',
                sourceDocumentType: 'PUTAWAY',
                sourceDocumentId: task.id,
                createdBy: task.assignedWorker ?? undefined,
                idempotencyKey: idKey ? `${idKey}:out` : undefined,
            })
        } else {
            await this.posting.postTransaction({
                companyId,
                warehouseId: task.warehouseId,
                materialId: task.materialId,
                batchId: task.batchId ?? undefined,
                serialNumberId: task.serialId ?? undefined,
                stockStatus,
                movementType: 'TRANSFER_OUT',
                quantity: qty,
                uomId,
                postingDate: today,
                documentDate: today,
                sourceModule: 'WAREHOUSE',
                sourceDocumentType: 'PUTAWAY',
                sourceDocumentId: task.id,
                createdBy: task.assignedWorker ?? undefined,
                idempotencyKey: idKey ? `${idKey}:out` : undefined,
            })
        }

        await this.posting.postTransaction({
            companyId,
            warehouseId: task.warehouseId,
            storageBinId: dto.actualBinId,
            materialId: task.materialId,
            batchId: task.batchId ?? undefined,
            serialNumberId: task.serialId ?? undefined,
            stockStatus,
            movementType: 'TRANSFER_IN',
            quantity: qty,
            uomId,
            postingDate: today,
            documentDate: today,
            sourceModule: 'WAREHOUSE',
            sourceDocumentType: 'PUTAWAY',
            sourceDocumentId: task.id,
            createdBy: task.assignedWorker ?? undefined,
            idempotencyKey: idKey ? `${idKey}:in` : undefined,
        })

        return this.prisma.wmPutawayTask.update({
            where: { id },
            data: {
                actualBinId: dto.actualBinId,
                quantity: dto.quantity,
                status: 'COMPLETED',
                completedAt: new Date(),
            },
            include: this.includes,
        })
    }

    async cancel(id: string) {
        const task = await this.findOne(id)
        if (task.status === 'COMPLETED') {
            throw new BadRequestException('Cannot cancel a completed task')
        }
        if (task.warehouseTaskId) {
            await this.warehouseTasks.cancel(task.warehouseTaskId)
            return this.findOne(id)
        }
        return this.prisma.wmPutawayTask.update({
            where: { id },
            data: { status: 'CANCELLED' },
            include: this.includes,
        })
    }

    /** Recommend a bin via putaway strategy registry (default CAPACITY_BASED). */
    async recommendBin(
        warehouseId: string,
        materialId: string,
        quantity: number,
        stockStatus = 'UNRESTRICTED',
    ): Promise<string | null> {
        return this.putawayStrategy.recommend('CAPACITY_BASED', {
            warehouseId,
            materialId,
            quantity,
            stockStatus,
        })
    }

    private async assertScannedBinMatches(
        warehouseId: string,
        actualBinId: string,
        scannedBinCode: string,
    ) {
        const code = scannedBinCode.trim()
        const bin = await this.prisma.wmStorageBin.findFirst({
            where: {
                OR: [
                    { id: code },
                    { code: { equals: code, mode: 'insensitive' } },
                    { barcode: { equals: code, mode: 'insensitive' } },
                ],
                storageSection: {
                    storageType: { warehouseId },
                },
            },
        })
        if (!bin) {
            throw new BadRequestException(`Scanned bin not found: ${code}`)
        }
        if (bin.id !== actualBinId) {
            throw new BadRequestException(
                `Scanned bin ${bin.code} does not match selected putaway bin`,
            )
        }
    }

    private async assertBinAcceptsPutaway(
        binId: string,
        warehouseId: string,
        materialId: string,
        quantity: number,
    ) {
        const bin = await this.prisma.wmStorageBin.findUnique({
            where: { id: binId },
            include: { storageSection: { include: { storageType: true } } },
        })
        if (!bin) throw new NotFoundException('Bin not found')
        if (bin.status !== 'ACTIVE') throw new BadRequestException('Bin is not active')
        if (!bin.putawayAllowed) throw new BadRequestException('Putaway not allowed for this bin')
        if (!bin.storageSection.storageType.putawayAllowed) {
            throw new BadRequestException('Putaway not allowed for this storage type')
        }
        if (bin.storageSection.storageType.warehouseId !== warehouseId) {
            throw new BadRequestException('Bin does not belong to task warehouse')
        }

        const used = await this.prisma.mmInventoryBalance.aggregate({
            where: { storageBinId: binId, stockStatus: 'UNRESTRICTED' },
            _sum: { quantity: true },
        })
        const usedQty = new Decimal(used._sum.quantity ?? 0)
        const capacity = new Decimal(bin.capacityQuantity ?? 0)
        if (capacity.gt(0) && usedQty.plus(quantity).gt(capacity)) {
            throw new BadRequestException('Bin capacity exceeded for putaway quantity')
        }

        const material = await this.prisma.mmMaterial.findUnique({ where: { id: materialId } })
        if (material?.weight && bin.capacityWeight && Number(bin.capacityWeight) > 0) {
            if (new Decimal(material.weight).mul(quantity).gt(bin.capacityWeight)) {
                throw new BadRequestException('Bin weight capacity exceeded')
            }
        }
        if (material?.volume && bin.capacityVolume && Number(bin.capacityVolume) > 0) {
            if (new Decimal(material.volume).mul(quantity).gt(bin.capacityVolume)) {
                throw new BadRequestException('Bin volume capacity exceeded')
            }
        }
        return bin
    }

    private async generateNextCode(): Promise<string> {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `PA-${today}-`
        const last = await this.prisma.wmPutawayTask.findFirst({
            where: { taskNumber: { startsWith: pfx } },
            orderBy: { taskNumber: 'desc' },
            select: { taskNumber: true },
        })
        let seq = 1
        if (last) {
            const num = parseInt(last.taskNumber.replace(pfx, ''), 10)
            if (!isNaN(num)) seq = num + 1
        }
        return `${pfx}${String(seq).padStart(5, '0')}`
    }
}
