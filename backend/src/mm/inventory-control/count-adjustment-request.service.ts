import {
    Injectable,
    NotFoundException,
    BadRequestException,
    Inject,
    forwardRef,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { AdjustmentService } from '../stock-ops/adjustment.service'
import {
    CreateAdjustmentRequestDto,
    ApproveAdjustmentRequestDto,
    RejectAdjustmentRequestDto,
    AdjustmentRequestQueryDto,
} from './dto/count-engine.dto'
import { CountPlanService } from './count-plan.service'

@Injectable()
export class CountAdjustmentRequestService {
    constructor(
        private prisma: PrismaService,
        @Inject(forwardRef(() => AdjustmentService))
        private adjustments: AdjustmentService,
        private plans: CountPlanService,
    ) {}

    async findAll(query: AdjustmentRequestQueryDto) {
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20
        const where: Record<string, unknown> = {}
        if (query.sessionId) where.sessionId = query.sessionId
        if (query.companyId) where.companyId = query.companyId
        if (query.warehouseId) where.warehouseId = query.warehouseId
        if (query.status) where.status = query.status
        const [data, total] = await Promise.all([
            this.prisma.mmCountAdjustmentRequest.findMany({
                where,
                include: {
                    lines: { include: { reasonCode: true, task: { include: { material: true } } } },
                    session: true,
                    warehouse: true,
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmCountAdjustmentRequest.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        const req = await this.prisma.mmCountAdjustmentRequest.findUnique({
            where: { id },
            include: {
                lines: {
                    include: {
                        reasonCode: true,
                        task: { include: { material: true, storageBin: true } },
                        variance: true,
                    },
                },
                session: { include: { plan: true } },
                warehouse: true,
                legacyAdjustment: true,
            },
        })
        if (!req) throw new NotFoundException('Adjustment request not found')
        return req
    }

    async create(dto: CreateAdjustmentRequestDto) {
        const session = await this.prisma.mmCountSession.findUnique({
            where: { id: dto.sessionId },
            include: {
                tasks: { include: { variances: { where: { status: 'PENDING_ADJUSTMENT' } } } },
                plan: true,
            },
        })
        if (!session) throw new NotFoundException('Count session not found')
        if (['CLOSED', 'ADJUSTED'].includes(session.status)) {
            throw new BadRequestException(`Cannot create adjustment for ${session.status}`)
        }

        let lines = dto.lines
        if (!lines?.length) {
            lines = []
            for (const task of session.tasks) {
                const v = task.variances[0]
                if (!v || new Decimal(v.varianceQuantity).equals(0)) continue
                lines.push({
                    taskId: task.id,
                    varianceId: v.id,
                    quantity: Number(v.varianceQuantity),
                })
            }
        }
        if (!lines.length) {
            await this.prisma.mmCountSession.update({
                where: { id: session.id },
                data: { status: 'CLOSED', closedAt: new Date() },
            })
            await this.plans.syncLegacyStatus(session.planId, 'CLOSED')
            return {
                zeroVariance: true,
                sessionId: session.id,
                status: 'CLOSED',
                message: 'No variances to adjust — session closed',
            }
        }

        const requestNumber = await this.nextRequestNumber()
        const created = await this.prisma.mmCountAdjustmentRequest.create({
            data: {
                requestNumber,
                sessionId: session.id,
                companyId: session.companyId,
                warehouseId: session.warehouseId,
                status: 'PENDING_APPROVAL',
                submittedBy: dto.submittedBy ?? null,
                lines: {
                    create: lines.map((l) => ({
                        taskId: l.taskId,
                        varianceId: l.varianceId ?? null,
                        quantity: new Decimal(l.quantity),
                        reasonCodeId: l.reasonCodeId ?? null,
                        rootCause: l.rootCause ?? null,
                        correctiveAction: l.correctiveAction ?? null,
                        managerRemarks: l.managerRemarks ?? null,
                    })),
                },
            },
            include: { lines: true },
        })

        await this.prisma.mmCountSession.update({
            where: { id: session.id },
            data: { status: 'PENDING_APPROVAL' },
        })
        await this.plans.syncLegacyStatus(session.planId, 'PENDING_APPROVAL')
        return this.findOne(created.id)
    }

    async approve(id: string, dto: ApproveAdjustmentRequestDto = {}) {
        const req = await this.findOne(id)
        if (req.status !== 'PENDING_APPROVAL' && req.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot approve: request is ${req.status}`)
        }

        const claimed = await this.prisma.mmCountAdjustmentRequest.updateMany({
            where: { id, status: { in: ['PENDING_APPROVAL', 'DRAFT'] } },
            data: { status: 'APPROVED', approvedBy: dto.approvedBy ?? null },
        })
        if (claimed.count === 0) {
            throw new BadRequestException('Concurrent approve failed')
        }

        const tasks = await this.prisma.mmCountTask.findMany({
            where: { id: { in: req.lines.map((l) => l.taskId) } },
        })
        const taskMap = new Map(tasks.map((t) => [t.id, t]))

        const adj = await this.adjustments.create({
            companyId: req.companyId,
            warehouseId: req.warehouseId,
            sourceCountId: req.session.plan.legacyInventoryCountId ?? undefined,
            postingDate: new Date().toISOString(),
            adjustmentReason: 'COUNT_VARIANCE',
            justification: `Count adjustment ${req.requestNumber}`,
            createdBy: dto.approvedBy,
            lines: req.lines.map((l) => {
                const task = taskMap.get(l.taskId)!
                return {
                    materialId: task.materialId,
                    quantity: Number(l.quantity),
                    uomId: task.uomId,
                    storageBinId: task.storageBinId ?? undefined,
                    batchId: task.batchId ?? undefined,
                    serialNumberId: task.serialNumberId ?? undefined,
                    unitCost: Number(task.unitCost),
                    remarks: l.rootCause ?? undefined,
                }
            }),
        })

        const submitted = await this.adjustments.submit(adj.id)
        let posted = submitted
        if (submitted.status === 'PENDING_APPROVAL') {
            posted = await this.adjustments.approve(adj.id, dto.approvedBy)
        }

        await this.prisma.mmCountAdjustmentRequest.update({
            where: { id },
            data: {
                status: 'POSTED',
                legacyAdjustmentId: posted.id,
            },
        })

        for (const line of req.lines) {
            await this.prisma.mmCountTask.update({
                where: { id: line.taskId },
                data: { status: 'ADJUSTED' },
            })
            if (line.varianceId) {
                await this.prisma.mmCountVariance.update({
                    where: { id: line.varianceId },
                    data: { status: 'ADJUSTED' },
                })
            }
        }

        await this.prisma.mmCountSession.update({
            where: { id: req.sessionId },
            data: { status: 'ADJUSTED' },
        })
        await this.plans.syncLegacyStatus(req.session.planId, 'ADJUSTED')

        // Auto-close
        await this.prisma.mmCountSession.update({
            where: { id: req.sessionId },
            data: { status: 'CLOSED', closedAt: new Date() },
        })
        await this.plans.syncLegacyStatus(req.session.planId, 'CLOSED')

        return this.findOne(id)
    }

    async reject(id: string, dto: RejectAdjustmentRequestDto = {}) {
        const req = await this.findOne(id)
        if (req.status !== 'PENDING_APPROVAL' && req.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot reject: request is ${req.status}`)
        }
        await this.prisma.mmCountAdjustmentRequest.update({
            where: { id },
            data: {
                status: 'REJECTED',
                rejectedBy: dto.rejectedBy ?? null,
                rejectionReason: dto.rejectionReason ?? null,
            },
        })
        await this.prisma.mmCountSession.update({
            where: { id: req.sessionId },
            data: { status: 'REJECTED' },
        })
        await this.plans.syncLegacyStatus(req.session.planId, 'REJECTED')
        return this.findOne(id)
    }

    private async nextRequestNumber() {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `CAR-${today}-`
        const last = await this.prisma.mmCountAdjustmentRequest.findFirst({
            where: { requestNumber: { startsWith: pfx } },
            orderBy: { requestNumber: 'desc' },
        })
        let seq = 1
        if (last) {
            const n = parseInt(last.requestNumber.replace(pfx, ''), 10)
            if (!isNaN(n)) seq = n + 1
        }
        return `${pfx}${String(seq).padStart(5, '0')}`
    }
}
