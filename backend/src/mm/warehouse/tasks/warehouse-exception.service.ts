import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { ReportExceptionDto, ReleaseExceptionDto } from './dto/warehouse-task.dto'
import { ACTIVE_TASK_STATUSES, WAREHOUSE_EXCEPTION_CODES } from './warehouse-task.constants'

@Injectable()
export class WarehouseExceptionService {
    constructor(private prisma: PrismaService) {}

    async report(taskId: string, dto: ReportExceptionDto) {
        const task = await this.prisma.wmWarehouseTask.findUnique({ where: { id: taskId } })
        if (!task) throw new NotFoundException('Warehouse task not found')
        if (!ACTIVE_TASK_STATUSES.includes(task.status as any) && task.status !== 'EXCEPTION') {
            throw new BadRequestException(`Cannot report exception on task in status ${task.status}`)
        }
        if (!WAREHOUSE_EXCEPTION_CODES.includes(dto.exceptionCode as any)) {
            throw new BadRequestException(`Invalid exception code: ${dto.exceptionCode}`)
        }

        await this.prisma.wmWarehouseTaskException.create({
            data: {
                taskId,
                exceptionCode: dto.exceptionCode,
                details: dto.details ?? null,
                reportedBy: dto.reportedBy ?? null,
            },
        })

        return this.prisma.wmWarehouseTask.update({
            where: { id: taskId },
            data: {
                status: 'EXCEPTION',
                exceptionReason: dto.details ?? dto.exceptionCode,
            },
        })
    }

    async release(taskId: string, dto?: ReleaseExceptionDto) {
        const task = await this.prisma.wmWarehouseTask.findUnique({ where: { id: taskId } })
        if (!task) throw new NotFoundException('Warehouse task not found')
        if (task.status !== 'EXCEPTION') {
            throw new BadRequestException('Task is not in EXCEPTION status')
        }

        await this.prisma.wmWarehouseTaskException.updateMany({
            where: { taskId, resolvedAt: null },
            data: { resolvedAt: new Date() },
        })

        return this.prisma.wmWarehouseTask.update({
            where: { id: taskId },
            data: {
                status: task.startedAt ? 'IN_PROGRESS' : task.assignedUserId ? 'ASSIGNED' : 'PENDING',
                exceptionReason: null,
            },
        })
    }
}
