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
import { CountConfigurationService } from './count-configuration.service'

@Injectable()
export class CountAdjustmentRequestService {
    constructor(
        private prisma: PrismaService,
        @Inject(forwardRef(() => AdjustmentService))
        private adjustments: AdjustmentService,
        private plans: CountPlanService,
        private countConfig: CountConfigurationService,
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

        if (!session.varianceReportSubmittedAt) {
            throw new BadRequestException(
                'ISO control: submit a formal variance report before creating an adjustment request',
            )
        }

        const tasksForValue = await this.prisma.mmCountTask.findMany({
            where: { id: { in: lines.map((l) => l.taskId) } },
        })
        const taskMapVal = new Map(tasksForValue.map((t) => [t.id, t]))
        let totalValue = new Decimal(0)
        for (const l of lines) {
            const t = taskMapVal.get(l.taskId)
            if (t) {
                totalValue = totalValue.plus(
                    new Decimal(Math.abs(l.quantity)).times(t.unitCost),
                )
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
                totalAdjustmentValue: totalValue,
                lines: {
                    create: await Promise.all(
                        lines.map(async (l) => {
                            let rootCause = l.rootCause ?? null
                            let correctiveAction = l.correctiveAction ?? null
                            if (l.varianceId && (!rootCause || !correctiveAction)) {
                                const v = await this.prisma.mmCountVariance.findUnique({
                                    where: { id: l.varianceId },
                                })
                                rootCause = rootCause ?? v?.rootCause ?? null
                                correctiveAction =
                                    correctiveAction ?? v?.correctiveAction ?? null
                            }
                            return {
                                taskId: l.taskId,
                                varianceId: l.varianceId ?? null,
                                quantity: new Decimal(l.quantity),
                                reasonCodeId: l.reasonCodeId ?? null,
                                rootCause,
                                correctiveAction,
                                managerRemarks: l.managerRemarks ?? null,
                            }
                        }),
                    ),
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

        const config = await this.countConfig.getForCompany(req.companyId)
        const approver = dto.approvedBy ?? null
        if (config.separationOfDutiesEnabled && approver) {
            if (req.submittedBy && approver === req.submittedBy) {
                throw new BadRequestException(
                    'Separation of duties: submitter cannot approve their own adjustment request',
                )
            }
            const counterHit = await this.prisma.mmCountEntry.findFirst({
                where: {
                    counterId: approver,
                    task: { sessionId: req.sessionId },
                },
            })
            if (counterHit) {
                throw new BadRequestException(
                    'Separation of duties: counter cannot approve adjustments for the same count session',
                )
            }
        }

        const total = new Decimal(req.totalAdjustmentValue ?? 0)
        const financeThreshold = new Decimal(config.financeApprovalValueThreshold ?? 0)
        const needsFinance =
            financeThreshold.gt(0) && total.abs().gte(financeThreshold)
        const nextStatus = needsFinance ? 'PENDING_FINANCE_APPROVAL' : 'APPROVED'

        const claimed = await this.prisma.mmCountAdjustmentRequest.updateMany({
            where: { id, status: { in: ['PENDING_APPROVAL', 'DRAFT'] } },
            data: {
                status: nextStatus,
                approvedBy: needsFinance ? null : approver,
                warehouseApprovedBy: approver,
                warehouseApprovedAt: new Date(),
            },
        })
        if (claimed.count === 0) {
            throw new BadRequestException('Concurrent approve failed')
        }

        if (!needsFinance) {
            await this.prisma.mmCountSession.update({
                where: { id: req.sessionId },
                data: { status: 'APPROVED' },
            })
            await this.plans.syncLegacyStatus(req.session.planId, 'APPROVED')
        }

        return this.findOne(id)
    }

    async approveFinance(id: string, dto: ApproveAdjustmentRequestDto = {}) {
        const req = await this.findOne(id)
        if (req.status !== 'PENDING_FINANCE_APPROVAL') {
            throw new BadRequestException(
                `Finance approval requires PENDING_FINANCE_APPROVAL (current: ${req.status})`,
            )
        }
        const config = await this.countConfig.getForCompany(req.companyId)
        const approver = dto.approvedBy ?? null
        if (config.separationOfDutiesEnabled && approver) {
            if (req.submittedBy && approver === req.submittedBy) {
                throw new BadRequestException(
                    'Separation of duties: submitter cannot provide finance approval',
                )
            }
            if (req.warehouseApprovedBy && approver === req.warehouseApprovedBy) {
                throw new BadRequestException(
                    'Separation of duties: warehouse approver cannot provide finance approval',
                )
            }
        }
        const claimed = await this.prisma.mmCountAdjustmentRequest.updateMany({
            where: { id, status: 'PENDING_FINANCE_APPROVAL' },
            data: {
                status: 'APPROVED',
                approvedBy: approver,
                financeApprovedBy: approver,
                financeApprovedAt: new Date(),
            },
        })
        if (claimed.count === 0) {
            throw new BadRequestException('Concurrent finance approve failed')
        }
        await this.prisma.mmCountSession.update({
            where: { id: req.sessionId },
            data: { status: 'APPROVED' },
        })
        await this.plans.syncLegacyStatus(req.session.planId, 'APPROVED')
        return this.findOne(id)
    }

    async post(id: string, dto: ApproveAdjustmentRequestDto = {}) {
        const req = await this.findOne(id)
        if (req.status !== 'APPROVED') {
            throw new BadRequestException(
                `Cannot post: request must be APPROVED (current: ${req.status})`,
            )
        }

        const claimed = await this.prisma.mmCountAdjustmentRequest.updateMany({
            where: { id, status: 'APPROVED' },
            data: { approvedBy: dto.approvedBy ?? req.approvedBy ?? null },
        })
        if (claimed.count === 0) {
            throw new BadRequestException('Concurrent post failed')
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

    /** @deprecated Use approve() then post() for ISO 9001 separation of duties */
    async approveAndPost(id: string, dto: ApproveAdjustmentRequestDto = {}) {
        await this.approve(id, dto)
        return this.post(id, dto)
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
