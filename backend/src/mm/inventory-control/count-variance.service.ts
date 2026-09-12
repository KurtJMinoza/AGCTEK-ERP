import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { CountGenerationService } from './count-generation.service'
import { CountRecountService } from './count-recount.service'

@Injectable()
export class CountVarianceService {
    constructor(
        private prisma: PrismaService,
        private generation: CountGenerationService,
        @Inject(forwardRef(() => CountRecountService))
        private recounts: CountRecountService,
    ) {}

    async recomputeForTask(taskId: string) {
        const task = await this.prisma.mmCountTask.findUnique({
            where: { id: taskId },
            include: {
                entries: { orderBy: { sequence: 'desc' }, take: 1 },
                session: { include: { plan: { include: { policy: true } } } },
            },
        })
        if (!task || !task.entries[0]) throw new NotFoundException('Task/entry not found')

        const entry = task.entries[0]
        const systemQty = new Decimal(task.systemQuantity)
        const countQty = new Decimal(entry.countQuantity)
        const varianceQty = countQty.minus(systemQty)
        const variancePct = systemQty.equals(0)
            ? countQty.equals(0)
                ? new Decimal(0)
                : new Decimal(100)
            : varianceQty.div(systemQty).mul(100)
        const unitCost = new Decimal(task.unitCost)
        const estimatedValue = varianceQty.mul(unitCost)
        const policy = task.session.plan.policy
        const over = this.generation.exceedsTolerance(
            policy,
            varianceQty,
            variancePct,
            estimatedValue,
        )

        await this.prisma.mmCountVariance.updateMany({
            where: { taskId, status: { in: ['OPEN', 'RECOUNT_REQUIRED'] } },
            data: { status: 'CLEARED' },
        })

        const variance = await this.prisma.mmCountVariance.create({
            data: {
                taskId,
                entryId: entry.id,
                systemQuantity: systemQty,
                countQuantity: countQty,
                varianceQuantity: varianceQty,
                variancePercentage: variancePct,
                estimatedValue,
                unitCost,
                status: varianceQty.equals(0)
                    ? 'CLEARED'
                    : over
                      ? 'RECOUNT_REQUIRED'
                      : 'OPEN',
            },
        })

        if (varianceQty.equals(0)) {
            await this.prisma.mmCountTask.update({
                where: { id: taskId },
                data: { status: 'COUNTED' },
            })
        } else if (over) {
            await this.prisma.mmCountTask.update({
                where: { id: taskId },
                data: { status: 'RECOUNT_REQUIRED' },
            })
            const existingOpen = await this.prisma.mmCountRecount.findFirst({
                where: { taskId, status: 'OPEN' },
            })
            if (!existingOpen) {
                await this.recounts.create({
                    varianceId: variance.id,
                    reason: 'Variance exceeds policy threshold',
                })
            }
        } else {
            await this.prisma.mmCountTask.update({
                where: { id: taskId },
                data: { status: 'VARIANCE' },
            })
            await this.prisma.mmCountVariance.update({
                where: { id: variance.id },
                data: { status: 'PENDING_ADJUSTMENT' },
            })
        }

        return variance
    }

    async listBySession(sessionId: string) {
        return this.prisma.mmCountVariance.findMany({
            where: { task: { sessionId } },
            include: {
                task: { include: { material: true, storageBin: true } },
                entry: true,
            },
            orderBy: { createdAt: 'desc' },
        })
    }
}
