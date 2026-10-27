import {
    Injectable,
    NotFoundException,
    BadRequestException,
    Inject,
    forwardRef,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { CountGenerationService } from './count-generation.service'
import { CountRecountService } from './count-recount.service'
import {
    CountVarianceQueryDto,
    InvestigateVarianceDto,
    SubmitVarianceReportDto,
} from './dto/count-engine.dto'

@Injectable()
export class CountVarianceService {
    constructor(
        private prisma: PrismaService,
        private generation: CountGenerationService,
        @Inject(forwardRef(() => CountRecountService))
        private recounts: CountRecountService,
    ) {}

    async findAll(query: CountVarianceQueryDto) {
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 50
        const where: Record<string, unknown> = {}
        if (query.sessionId) where.task = { sessionId: query.sessionId }
        if (query.status) where.status = query.status
        if (query.companyId || query.warehouseId) {
            where.task = {
                ...(where.task as object),
                session: {
                    ...(query.companyId ? { companyId: query.companyId } : {}),
                    ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
                },
            }
        }
        const [data, total] = await Promise.all([
            this.prisma.mmCountVariance.findMany({
                where,
                include: {
                    task: {
                        include: {
                            material: true,
                            storageBin: true,
                            session: { include: { warehouse: true, plan: true } },
                        },
                    },
                    entry: true,
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmCountVariance.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async investigate(id: string, dto: InvestigateVarianceDto) {
        const variance = await this.prisma.mmCountVariance.findUnique({
            where: { id },
            include: { task: { include: { session: true } } },
        })
        if (!variance) throw new NotFoundException('Variance not found')
        if (['CLEARED', 'ADJUSTED', 'RECOUNT_REQUIRED'].includes(variance.status)) {
            throw new BadRequestException(
                variance.status === 'RECOUNT_REQUIRED'
                    ? 'Complete mandatory recount before documenting root cause'
                    : `Cannot investigate variance in ${variance.status}`,
            )
        }
        if (new Decimal(variance.varianceQuantity).equals(0)) {
            throw new BadRequestException('Zero-variance lines do not require investigation')
        }
        return this.prisma.mmCountVariance.update({
            where: { id },
            data: {
                rootCause: dto.rootCause,
                correctiveAction: dto.correctiveAction ?? null,
                investigatedBy: dto.investigatedBy ?? null,
                investigatedAt: new Date(),
                status: 'INVESTIGATED',
            },
            include: {
                task: { include: { material: true, session: true } },
            },
        })
    }

    async submitSessionReport(sessionId: string, dto: SubmitVarianceReportDto = {}) {
        const session = await this.prisma.mmCountSession.findUnique({
            where: { id: sessionId },
            include: {
                tasks: {
                    include: {
                        variances: { orderBy: { createdAt: 'desc' }, take: 1 },
                    },
                },
            },
        })
        if (!session) throw new NotFoundException('Count session not found')
        if (session.varianceReportSubmittedAt) {
            return session
        }

        const actionable = session.tasks.flatMap((t) => {
            const v = t.variances[0]
            if (!v) return []
            if (new Decimal(v.varianceQuantity).equals(0)) return []
            if (v.status === 'CLEARED' || v.status === 'ADJUSTED') return []
            return [v]
        })

        if (actionable.length === 0) {
            throw new BadRequestException('No variances require a formal report for this session')
        }

        const uninvestigated = actionable.filter((v) => v.status !== 'INVESTIGATED')
        if (uninvestigated.length) {
            throw new BadRequestException(
                'All variances must be investigated (root cause documented) before submitting the report',
            )
        }
        const missingRoot = actionable.filter((v) => !v.rootCause?.trim())
        if (missingRoot.length) {
            throw new BadRequestException(
                'Each variance line must include a documented root cause',
            )
        }

        const openRecounts = await this.prisma.mmCountRecount.count({
            where: { task: { sessionId }, status: 'OPEN' },
        })
        if (openRecounts > 0) {
            throw new BadRequestException(
                'Complete mandatory recounts before submitting the variance report',
            )
        }

        const reportNumber = await this.nextReportNumber()
        return this.prisma.mmCountSession.update({
            where: { id: sessionId },
            data: {
                varianceReportNumber: reportNumber,
                varianceReportSummary: dto.summary ?? null,
                varianceReportSubmittedBy: dto.submittedBy ?? null,
                varianceReportSubmittedAt: new Date(),
                status: session.status === 'RECOUNT_REQUIRED' ? 'VARIANCE' : session.status,
            },
            include: { warehouse: true, plan: true },
        })
    }

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

        const isPhysical = task.session.countType === 'PHYSICAL_INVENTORY'
        const firstCountOnly = entry.sequence === 1
        const forceRecount =
            isPhysical && !varianceQty.equals(0) && firstCountOnly

        await this.prisma.mmCountVariance.updateMany({
            where: { taskId, status: { in: ['OPEN', 'RECOUNT_REQUIRED', 'INVESTIGATED'] } },
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
                    : forceRecount || over
                      ? 'RECOUNT_REQUIRED'
                      : 'OPEN',
            },
        })

        if (varianceQty.equals(0)) {
            await this.prisma.mmCountTask.update({
                where: { id: taskId },
                data: { status: 'COUNTED' },
            })
        } else if (forceRecount || over) {
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
                    reason: forceRecount
                        ? 'ISO 9001: mandatory physical inventory recount'
                        : 'Variance exceeds policy threshold',
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

    private async nextReportNumber() {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `VR-${today}-`
        const last = await this.prisma.mmCountSession.findFirst({
            where: { varianceReportNumber: { startsWith: pfx } },
            orderBy: { varianceReportNumber: 'desc' },
        })
        let seq = 1
        if (last?.varianceReportNumber) {
            const n = parseInt(last.varianceReportNumber.replace(pfx, ''), 10)
            if (!isNaN(n)) seq = n + 1
        }
        return `${pfx}${String(seq).padStart(5, '0')}`
    }
}
