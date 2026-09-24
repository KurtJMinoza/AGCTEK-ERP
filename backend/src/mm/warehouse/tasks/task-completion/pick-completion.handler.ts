import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../../../prisma/prisma.service'
import { CompleteTaskDto } from '../dto/warehouse-task.dto'
import { Decimal } from '@prisma/client/runtime/library'
import { WmWarehouseTask } from '@prisma/client'

/**
 * Soft pick confirmation — no inventory ledger posting.
 * Goods Issue posts the physical deduction.
 */
@Injectable()
export class PickCompletionHandler {
    constructor(private prisma: PrismaService) {}

    async complete(task: WmWarehouseTask, dto: CompleteTaskDto) {
        const sourceBinId = dto.sourceBinId ?? task.sourceBinId
        if (!sourceBinId) throw new BadRequestException('sourceBinId is required for pick')

        if (dto.scannedBinId && dto.scannedBinId !== sourceBinId) {
            throw new BadRequestException('WRONG_BIN: Scanned bin does not match source bin')
        }
        if (dto.scannedMaterialId && task.materialId && dto.scannedMaterialId !== task.materialId) {
            throw new BadRequestException('WRONG_MATERIAL: Scanned material does not match task')
        }

        const material = await this.prisma.mmMaterial.findUnique({
            where: { id: task.materialId! },
        })
        if (!material) throw new BadRequestException('Material not found')

        if (material.batchManaged) {
            if (!dto.scannedBatchId) {
                throw new BadRequestException('WRONG_BATCH: Batch scan is required')
            }
            if (task.batchId && dto.scannedBatchId !== task.batchId) {
                throw new BadRequestException('WRONG_BATCH: Scanned batch does not match task')
            }
        }
        if (material.serialManaged) {
            if (!dto.scannedSerialId) {
                throw new BadRequestException('WRONG_SERIAL: Serial scan is required')
            }
            if (task.serialId && dto.scannedSerialId !== task.serialId) {
                throw new BadRequestException('WRONG_SERIAL: Scanned serial does not match task')
            }
        }

        const remaining = new Decimal(task.quantity).minus(task.completedQuantity)
        if (new Decimal(dto.quantity).gt(remaining)) {
            throw new BadRequestException('Pick quantity exceeds remaining task quantity')
        }

        const newCompleted = new Decimal(task.completedQuantity).plus(dto.quantity)
        const isDone = newCompleted.gte(task.quantity)

        const updated = await this.prisma.wmWarehouseTask.update({
            where: { id: task.id },
            data: {
                completedQuantity: newCompleted,
                status: isDone ? 'COMPLETED' : 'PARTIALLY_COMPLETED',
                completedAt: isDone ? new Date() : null,
            },
        })

        const pickingBridge = await this.prisma.wmPickingTask.findFirst({
            where: { warehouseTaskId: task.id },
        })
        if (pickingBridge) {
            await this.prisma.wmPickingTask.update({
                where: { id: pickingBridge.id },
                data: {
                    pickedQty: newCompleted,
                    status: isDone ? 'COMPLETED' : 'PARTIALLY_PICKED',
                    completedAt: isDone ? new Date() : null,
                    lastIdempotencyKey: dto.idempotencyKey ?? null,
                },
            })
        }

        return updated
    }
}
