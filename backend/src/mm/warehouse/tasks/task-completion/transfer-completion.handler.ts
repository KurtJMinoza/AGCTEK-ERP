import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../../../prisma/prisma.service'
import { CompleteTaskDto } from '../dto/warehouse-task.dto'
import { Decimal } from '@prisma/client/runtime/library'
import { WmWarehouseTask } from '@prisma/client'

/** Transfer tasks track worker progress; inventory posts on dispatch/receive. */
@Injectable()
export class TransferCompletionHandler {
    constructor(private prisma: PrismaService) {}

    async complete(task: WmWarehouseTask, dto: CompleteTaskDto) {
        const remaining = new Decimal(task.quantity).minus(task.completedQuantity)
        if (new Decimal(dto.quantity).gt(remaining)) {
            throw new BadRequestException('Transfer pick quantity exceeds remaining')
        }

        const newCompleted = new Decimal(task.completedQuantity).plus(dto.quantity)
        const isDone = newCompleted.gte(task.quantity)

        return this.prisma.wmWarehouseTask.update({
            where: { id: task.id },
            data: {
                completedQuantity: newCompleted,
                status: isDone ? 'COMPLETED' : 'PARTIALLY_COMPLETED',
                completedAt: isDone ? new Date() : null,
            },
        })
    }
}
