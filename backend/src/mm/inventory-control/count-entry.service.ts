import {
    Injectable,
    NotFoundException,
    BadRequestException,
    Inject,
    forwardRef,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { CreateCountEntryDto } from './dto/count-engine.dto'
import { CountVarianceService } from './count-variance.service'
import { CountSessionService } from './count-session.service'
import { CountPlanService } from './count-plan.service'

@Injectable()
export class CountEntryService {
    constructor(
        private prisma: PrismaService,
        @Inject(forwardRef(() => CountVarianceService))
        private variances: CountVarianceService,
        private sessions: CountSessionService,
        private plans: CountPlanService,
    ) {}

    async create(dto: CreateCountEntryDto) {
        const task = await this.prisma.mmCountTask.findUnique({
            where: { id: dto.taskId },
            include: { session: true, entries: true },
        })
        if (!task) throw new NotFoundException('Count task not found')
        if (!['IN_PROGRESS', 'RECOUNT_REQUIRED', 'VARIANCE'].includes(task.session.status)) {
            throw new BadRequestException(
                `Cannot enter count while session is ${task.session.status}`,
            )
        }
        if (!['PENDING', 'COUNTED', 'RECOUNT_REQUIRED', 'VARIANCE'].includes(task.status)) {
            throw new BadRequestException(`Task status ${task.status} cannot accept entry`)
        }

        if (dto.idempotencyKey) {
            const dup = await this.prisma.mmCountEntry.findUnique({
                where: { idempotencyKey: dto.idempotencyKey },
            })
            if (dup) {
                if (dup.taskId === dto.taskId) {
                    const existing = await this.prisma.mmCountEntry.findUnique({
                        where: { id: dup.id },
                        include: { task: true },
                    })
                    return this.toBlindSafe(existing!, task.session.blindMode)
                }
                throw new BadRequestException('Duplicate idempotency key')
            }
        }

        const openRecount = await this.prisma.mmCountRecount.findFirst({
            where: { taskId: task.id, status: 'OPEN' },
        })
        const sequence = openRecount
            ? (task.entries.reduce((m, e) => Math.max(m, e.sequence), 0) || 0) + 1
            : task.entries.length === 0
              ? 1
              : task.entries.reduce((m, e) => Math.max(m, e.sequence), 0) + 1

        // Duplicate first count guard
        if (!openRecount && task.entries.some((e) => e.sequence === 1)) {
            throw new BadRequestException('Duplicate count: first entry already exists')
        }

        const claimed = await this.prisma.mmCountTask.updateMany({
            where: {
                id: task.id,
                status: { in: ['PENDING', 'COUNTED', 'RECOUNT_REQUIRED', 'VARIANCE'] },
            },
            data: {
                status: 'COUNTED',
                lastCountedAt: new Date(),
                lastIdempotencyKey: dto.idempotencyKey ?? task.lastIdempotencyKey,
            },
        })
        if (claimed.count === 0) {
            throw new BadRequestException('Concurrent count failed')
        }

        const entry = await this.prisma.mmCountEntry.create({
            data: {
                taskId: task.id,
                sequence,
                countQuantity: new Decimal(dto.countQuantity),
                uomId: dto.uomId ?? task.uomId,
                counterId: dto.counterId ?? null,
                notes: dto.notes ?? null,
                isBlind: task.session.blindMode,
                attachmentMeta: (dto.attachmentMeta as object | undefined) ?? undefined,
                idempotencyKey: dto.idempotencyKey ?? null,
            },
            include: { task: true },
        })

        if (openRecount) {
            await this.prisma.mmCountRecount.update({
                where: { id: openRecount.id },
                data: { status: 'COMPLETED', completedAt: new Date() },
            })
        }

        // Dual-write legacy line if bridged
        await this.syncLegacyLine(task.id, dto)

        await this.variances.recomputeForTask(task.id)

        const allTasks = await this.prisma.mmCountTask.findMany({
            where: { sessionId: task.sessionId },
        })
        const allCounted = allTasks.every((t) =>
            ['COUNTED', 'VARIANCE', 'RECOUNT_REQUIRED', 'ADJUSTED', 'APPROVED'].includes(
                t.status,
            ),
        )
        if (allCounted && task.session.status === 'IN_PROGRESS') {
            const hasRecount = allTasks.some((t) => t.status === 'RECOUNT_REQUIRED')
            const hasVariance = allTasks.some((t) => t.status === 'VARIANCE')
            const next = hasRecount
                ? 'RECOUNT_REQUIRED'
                : hasVariance
                  ? 'VARIANCE'
                  : 'COUNTED'
            await this.prisma.mmCountSession.update({
                where: { id: task.sessionId },
                data: { status: next },
            })
            await this.plans.syncLegacyStatus(task.session.planId, next)
        }

        return this.toBlindSafe(entry, task.session.blindMode)
    }

    private async syncLegacyLine(taskId: string, dto: CreateCountEntryDto) {
        const task = await this.prisma.mmCountTask.findUnique({
            where: { id: taskId },
            include: { session: { include: { plan: true } } },
        })
        const legacyCountId = task?.session.plan.legacyInventoryCountId
        if (!legacyCountId) return
        const line = await this.prisma.mmInventoryCountLine.findFirst({
            where: {
                countId: legacyCountId,
                materialId: task!.materialId,
                storageBinId: task!.storageBinId,
                batchId: task!.batchId,
                serialNumberId: task!.serialNumberId,
            },
        })
        if (!line) return
        const isRecount = (await this.prisma.mmCountEntry.count({ where: { taskId } })) > 1
        await this.prisma.mmInventoryCountLine.update({
            where: { id: line.id },
            data: isRecount
                ? {
                      recountQuantity: new Decimal(dto.countQuantity),
                      status: 'RECOUNTED',
                      recountBy: dto.counterId ?? null,
                      recountedAt: new Date(),
                      lastIdempotencyKey: dto.idempotencyKey ?? line.lastIdempotencyKey,
                  }
                : {
                      countedQuantity: new Decimal(dto.countQuantity),
                      originalCount: new Decimal(dto.countQuantity),
                      status: 'COUNTED',
                      countedBy: dto.counterId ?? null,
                      countedAt: new Date(),
                      lastIdempotencyKey: dto.idempotencyKey ?? line.lastIdempotencyKey,
                  },
        })
    }

    private toBlindSafe(entry: any, blind: boolean) {
        if (!blind || !entry.task) return entry
        return {
            ...entry,
            task: this.sessions.stripSystemQty(entry.task),
        }
    }
}
