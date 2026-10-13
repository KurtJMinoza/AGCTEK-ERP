import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'

@Injectable()
export class TaskAssignmentService {
    constructor(private prisma: PrismaService) {}

    /** Loads the assignee and rejects missing, inactive, or out-of-company users. */
    private async assertAssignableUser(userId: string, companyId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { companies: true },
        })
        if (!user) {
            throw new BadRequestException(`User ${userId} was not found`)
        }
        if (!user.isActive) {
            throw new BadRequestException(
                `User ${user.userName || userId} is inactive and cannot be assigned`,
            )
        }
        const inCompany = user.companies.some(
            (membership) => membership.companyId === companyId,
        )
        if (!inCompany) {
            throw new BadRequestException(
                `User ${user.userName || userId} is not a member of the task company`,
            )
        }
        return user
    }

    async assign(taskId: string, userId: string) {
        const task = await this.prisma.wmWarehouseTask.findUnique({
            where: { id: taskId },
            include: { putawayBridge: true, pickingBridge: true },
        })
        if (!task) throw new NotFoundException('Warehouse task not found')
        if (task.status !== 'PENDING' && task.status !== 'ASSIGNED') {
            throw new BadRequestException(`Cannot assign task in status ${task.status}`)
        }
        await this.assertAssignableUser(userId, task.companyId)

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
        await this.assertAssignableUser(userId, task.companyId)

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
