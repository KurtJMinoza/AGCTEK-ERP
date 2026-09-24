import {
    Injectable,
    BadRequestException,
    NotFoundException,
    Inject,
    forwardRef,
} from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import {
    CreateWarehouseTaskDto,
    WarehouseTaskQueryDto,
    CompleteTaskDto,
    CancelTaskDto,
    StartTaskDto,
} from './dto/warehouse-task.dto'
import { TaskAssignmentService } from './task-assignment.service'
import { PutawayCompletionHandler } from './task-completion/putaway-completion.handler'
import { PickCompletionHandler } from './task-completion/pick-completion.handler'
import { RelocationCompletionHandler } from './task-completion/relocation-completion.handler'
import { TransferCompletionHandler } from './task-completion/transfer-completion.handler'
import { PutawayStrategyRegistry } from './strategies/putaway-strategy.registry'
import { Decimal } from '@prisma/client/runtime/library'
import { Prisma } from '@prisma/client'

const TASK_INCLUDES = {
    material: { select: { id: true, materialCode: true, materialName: true } },
    warehouse: { select: { id: true, code: true, name: true } },
    putawayBridge: true,
    pickingBridge: true,
    exceptions: { orderBy: { createdAt: 'desc' as const }, take: 10 },
}

@Injectable()
export class WarehouseTaskService {
    constructor(
        private prisma: PrismaService,
        private assignment: TaskAssignmentService,
        private putawayStrategy: PutawayStrategyRegistry,
        private putawayCompletion: PutawayCompletionHandler,
        private pickCompletion: PickCompletionHandler,
        private relocationCompletion: RelocationCompletionHandler,
        private transferCompletion: TransferCompletionHandler,
    ) {}

    async create(dto: CreateWarehouseTaskDto) {
        const warehouse = await this.prisma.warehouse.findUnique({
            where: { id: dto.warehouseId },
        })
        if (!warehouse) throw new NotFoundException('Warehouse not found')

        const taskNumber = await this.nextTaskNumber()
        let destinationBinId = dto.destinationBinId ?? null
        const metadata = (dto.metadata ?? {}) as Record<string, unknown>

        if (dto.taskType === 'PUTAWAY' && dto.materialId && !destinationBinId) {
            const strategyCode = (metadata.putawayStrategy as string) ?? 'CAPACITY_BASED'
            destinationBinId = await this.putawayStrategy.recommend(strategyCode, {
                warehouseId: dto.warehouseId,
                materialId: dto.materialId,
                quantity: dto.quantity,
                batchId: dto.batchId,
                serialId: dto.serialId,
                stockStatus: dto.stockStatus,
            })
            metadata.recommendedBinId = destinationBinId
        }

        return this.prisma.wmWarehouseTask.create({
            data: {
                taskNumber,
                companyId: dto.companyId,
                plantId: dto.plantId ?? warehouse.plantId,
                warehouseId: dto.warehouseId,
                taskType: dto.taskType,
                priority: dto.priority ?? 5,
                status: dto.assignedUserId ? 'ASSIGNED' : 'PENDING',
                sourceBinId: dto.sourceBinId ?? null,
                destinationBinId,
                materialId: dto.materialId ?? null,
                batchId: dto.batchId ?? null,
                serialId: dto.serialId ?? null,
                quantity: new Decimal(dto.quantity),
                uomId: dto.uomId ?? null,
                stockStatus: dto.stockStatus ?? 'UNRESTRICTED',
                referenceType: dto.referenceType ?? null,
                referenceId: dto.referenceId ?? null,
                assignedUserId: dto.assignedUserId ?? null,
                metadata: metadata as Prisma.InputJsonValue,
            },
            include: TASK_INCLUDES,
        })
    }

    async findAll(query: WarehouseTaskQueryDto) {
        const where: Prisma.WmWarehouseTaskWhereInput = {}
        if (query.taskType) where.taskType = query.taskType
        if (query.status) where.status = query.status
        if (query.warehouseId) where.warehouseId = query.warehouseId
        if (query.companyId) where.companyId = query.companyId
        if (query.assignedUserId) where.assignedUserId = query.assignedUserId
        if (query.search) {
            where.OR = [
                { taskNumber: { contains: query.search, mode: 'insensitive' } },
                { referenceId: { contains: query.search, mode: 'insensitive' } },
            ]
        }
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20
        const [data, total] = await Promise.all([
            this.prisma.wmWarehouseTask.findMany({
                where,
                include: TASK_INCLUDES,
                orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.wmWarehouseTask.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async findMyTasks(userId: string, query: WarehouseTaskQueryDto) {
        return this.findAll({
            ...query,
            assignedUserId: userId,
            status: query.status ?? undefined,
        })
    }

    async findOne(id: string) {
        const task = await this.prisma.wmWarehouseTask.findUnique({
            where: { id },
            include: TASK_INCLUDES,
        })
        if (!task) throw new NotFoundException('Warehouse task not found')
        return task
    }

    async assign(id: string, userId: string) {
        return this.assignment.assign(id, userId)
    }

    async reassign(id: string, userId: string) {
        return this.assignment.reassign(id, userId)
    }

    async start(id: string, dto?: StartTaskDto) {
        const task = await this.findOne(id)
        if (!['PENDING', 'ASSIGNED', 'PARTIALLY_COMPLETED'].includes(task.status)) {
            throw new BadRequestException(`Cannot start task in status ${task.status}`)
        }

        const updated = await this.prisma.wmWarehouseTask.update({
            where: { id },
            data: { status: 'IN_PROGRESS', startedAt: task.startedAt ?? new Date() },
            include: TASK_INCLUDES,
        })

        if (task.putawayBridge) {
            await this.prisma.wmPutawayTask.update({
                where: { id: task.putawayBridge.id },
                data: { status: 'IN_PROGRESS' },
            })
        }

        void dto
        return updated
    }

    async complete(id: string, dto: CompleteTaskDto) {
        const task = await this.findOne(id)
        if (!['IN_PROGRESS', 'PARTIALLY_COMPLETED', 'ASSIGNED'].includes(task.status)) {
            throw new BadRequestException(`Cannot complete task in status ${task.status}`)
        }

        if (task.status === 'ASSIGNED') {
            await this.start(id)
        }

        const fresh = await this.findOne(id)

        switch (fresh.taskType) {
            case 'PUTAWAY':
            case 'REPLENISHMENT':
                return this.putawayCompletion.complete(fresh, dto)
            case 'PICK':
                return this.pickCompletion.complete(fresh, dto)
            case 'RELOCATION':
                return this.relocationCompletion.complete(fresh, dto)
            case 'TRANSFER':
                return this.transferCompletion.complete(fresh, dto)
            case 'COUNT':
                return this.completeCountStub(fresh, dto)
            default:
                throw new BadRequestException(`Unsupported task type: ${fresh.taskType}`)
        }
    }

    async cancel(id: string, dto?: CancelTaskDto) {
        const task = await this.findOne(id)
        if (task.status === 'COMPLETED') {
            throw new BadRequestException('Cannot cancel a completed task')
        }

        const updated = await this.prisma.wmWarehouseTask.update({
            where: { id },
            data: { status: 'CANCELLED', cancelledAt: new Date() },
            include: TASK_INCLUDES,
        })

        if (task.putawayBridge) {
            await this.prisma.wmPutawayTask.update({
                where: { id: task.putawayBridge.id },
                data: { status: 'CANCELLED' },
            })
        }
        if (task.pickingBridge) {
            await this.prisma.wmPickingTask.update({
                where: { id: task.pickingBridge.id },
                data: { status: 'CANCELLED' },
            })
        }

        void dto
        return updated
    }

    private async completeCountStub(task: Awaited<ReturnType<typeof this.findOne>>, dto: CompleteTaskDto) {
        const newCompleted = new Decimal(task.completedQuantity).plus(dto.quantity)
        const isDone = newCompleted.gte(task.quantity)
        return this.prisma.wmWarehouseTask.update({
            where: { id: task.id },
            data: {
                completedQuantity: newCompleted,
                status: isDone ? 'COMPLETED' : 'PARTIALLY_COMPLETED',
                completedAt: isDone ? new Date() : null,
            },
            include: TASK_INCLUDES,
        })
    }

    private async nextTaskNumber() {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `WT-${today}-`
        const last = await this.prisma.wmWarehouseTask.findFirst({
            where: { taskNumber: { startsWith: pfx } },
            orderBy: { taskNumber: 'desc' },
        })
        let seq = 1
        if (last) {
            const n = parseInt(last.taskNumber.replace(pfx, ''), 10)
            if (!isNaN(n)) seq = n + 1
        }
        return `${pfx}${String(seq).padStart(5, '0')}`
    }
}
