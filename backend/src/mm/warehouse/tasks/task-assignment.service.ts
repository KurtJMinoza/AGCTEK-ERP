import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'

@Injectable()
export class TaskAssignmentService {
    constructor(private prisma: PrismaService) {}

    async assign(taskId: string, userId: string) {
        const task = await this.prisma.wmWarehouseTask.findUnique({
            where: { id: taskId },
            include: { putawayBridge: true, pickingBridge: true },
        })
        if (!task) throw new NotFoundException('Warehouse task not found')
        if (task.status !== 'PENDING' && task.status !== 'ASSIGNED') {
            throw new BadRequestException(`Cannot assign task in status ${task.status}`)
        }

        const updated = await this.prisma.wmWarehouseTask.update({
            where: { id: taskId },
            data: { assignedUserId: userId, status: 'ASSIGNED' },
        })

        if (task.putawayBridge) {
            await this.prisma.wmPutawayTask.update({
                where: { id: task.putawayBridge.id },
                data: { assignedWorker: userId, status: 'ASSIGNED' },
            })
        }
        if (task.pickingBridge) {
            await this.prisma.wmPickingTask.update({
                where: { id: task.pickingBridge.id },
                data: { assignedUser: userId, status: 'ASSIGNED' },
            })
        }

        return updated
    }

    async reassign(taskId: string, userId: string) {
        const task = await this.prisma.wmWarehouseTask.findUnique({
            where: { id: taskId },
            include: { putawayBridge: true, pickingBridge: true },
        })
        if (!task) throw new NotFoundException('Warehouse task not found')
        if (['COMPLETED', 'CANCELLED'].includes(task.status)) {
            throw new BadRequestException(`Cannot reassign task in status ${task.status}`)
        }

        const updated = await this.prisma.wmWarehouseTask.update({
            where: { id: taskId },
            data: { assignedUserId: userId, status: 'ASSIGNED' },
        })

        if (task.putawayBridge) {
            await this.prisma.wmPutawayTask.update({
                where: { id: task.putawayBridge.id },
                data: { assignedWorker: userId, status: 'ASSIGNED' },
            })
        }
        if (task.pickingBridge) {
            await this.prisma.wmPickingTask.update({
                where: { id: task.pickingBridge.id },
                data: { assignedUser: userId, status: 'ASSIGNED' },
            })
        }

        return updated
    }
}
