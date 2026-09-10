import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { PrismaService } from '../../prisma/prisma.service'
import { WorkflowService } from '../workflow/workflow.service'
import { CreatePurchaseRequisitionDto } from './dto/create-purchase-requisition.dto'
import { UpdatePurchaseRequisitionDto } from './dto/update-purchase-requisition.dto'
import { PurchaseRequisitionQueryDto } from './dto/purchase-requisition-query.dto'
import { ConvertPurchaseRequisitionDto } from './dto/convert-pr-line.dto'
import { Decimal } from '@prisma/client/runtime/library'

const PR_INCLUDES = {
    lines: {
        include: {
            material: { select: { id: true, materialCode: true, materialName: true, materialCategoryId: true } },
            uom: { select: { id: true, code: true, name: true } },
            warehouse: { select: { id: true, name: true, code: true } },
            preferredSupplier: {
                select: { id: true, supplierCode: true, supplierName: true },
            },
        },
    },
    company: { select: { id: true, name: true } },
    workflowInstance: { include: { tasks: { orderBy: { stepNumber: 'asc' as const } } } },
    conversions: true,
}

@Injectable()
export class PurchaseRequisitionService {
    constructor(
        private prisma: PrismaService,
        private workflowService: WorkflowService,
    ) {}

    async create(dto: CreatePurchaseRequisitionDto) {
        if (!dto.lines || dto.lines.length === 0) {
            throw new BadRequestException('At least one line is required')
        }
        const { assertPurchasableMaterials } = await import('../materials/assert-purchasable-materials')
        await assertPurchasableMaterials(
            this.prisma,
            dto.lines.map((l) => l.materialId),
        )

        const requisitionNumber = await this.generateRequisitionNumber()

        const lines = dto.lines.map((l) => {
            const qty = new Decimal(l.requestedQuantity)
            const unitPrice = new Decimal(l.estimatedUnitPrice)
            return {
                materialId: l.materialId,
                description: l.description ?? '',
                requestedQuantity: qty,
                uomId: l.uomId,
                estimatedUnitPrice: unitPrice,
                estimatedTotal: qty.mul(unitPrice),
                requiredDate: l.requiredDate ? new Date(l.requiredDate) : new Date(dto.requiredDate),
                warehouseId: l.warehouseId ?? null,
                preferredSupplierId: l.preferredSupplierId ?? null,
                convertedQty: new Decimal(0),
                remarks: l.remarks ?? null,
            }
        })

        const pr = await this.prisma.mmPurchaseRequisition.create({
            data: {
                requisitionNumber,
                companyId: dto.companyId,
                businessUnitId: dto.businessUnitId ?? null,
                branchId: dto.branchId ?? null,
                departmentId: dto.departmentId ?? null,
                costCenterId: dto.costCenterId ?? null,
                projectId: dto.projectId ?? null,
                requesterId: dto.requesterId,
                requiredDate: new Date(dto.requiredDate),
                purpose: dto.purpose,
                status: 'DRAFT',
                createdBy: dto.createdBy ?? null,
                sourceMrpRunId: dto.sourceMrpRunId ?? null,
                lines: { create: lines },
            },
            include: PR_INCLUDES,
        })

        await this.audit(pr.id, 'CREATED', null, null, `Created PR ${requisitionNumber}`, dto.createdBy)
        return pr
    }

    async update(id: string, dto: UpdatePurchaseRequisitionDto, performedBy?: string) {
        const pr = await this.findOneOrFail(id)
        if (pr.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot update: PR is ${pr.status}`)
        }

        const data: any = {}
        const updatableKeys: (keyof UpdatePurchaseRequisitionDto)[] = [
            'businessUnitId', 'branchId', 'departmentId', 'costCenterId', 'projectId', 'requesterId', 'purpose',
        ]
        for (const key of updatableKeys) {
            if (dto[key] !== undefined) data[key] = dto[key]
        }
        if (dto.requiredDate) data.requiredDate = new Date(dto.requiredDate)

        if (dto.lines && dto.lines.length > 0) {
            await this.prisma.mmPurchaseRequisitionLine.deleteMany({ where: { requisitionId: id } })
            const lines = dto.lines.map((l) => {
                const qty = new Decimal(l.requestedQuantity ?? 0)
                const unitPrice = new Decimal(l.estimatedUnitPrice ?? 0)
                return {
                    materialId: l.materialId!,
                    description: l.description ?? '',
                    requestedQuantity: qty,
                    uomId: l.uomId!,
                    estimatedUnitPrice: unitPrice,
                    estimatedTotal: qty.mul(unitPrice),
                    requiredDate: l.requiredDate ? new Date(l.requiredDate) : pr.requiredDate,
                    warehouseId: l.warehouseId ?? null,
                    preferredSupplierId: l.preferredSupplierId ?? null,
                    remarks: l.remarks ?? null,
                }
            })
            data.lines = { create: lines }
        }

        const updated = await this.prisma.mmPurchaseRequisition.update({
            where: { id },
            data,
            include: PR_INCLUDES,
        })

        await this.audit(id, 'UPDATED', null, null, 'PR updated', performedBy)
        return updated
    }

    async findAll(query: PurchaseRequisitionQueryDto) {
        const where: any = {}
        if (query.status) where.status = query.status
        if (query.requesterId) where.requesterId = query.requesterId
        if (query.departmentId) where.departmentId = query.departmentId
        if (query.search) {
            where.OR = [
                { requisitionNumber: { contains: query.search, mode: 'insensitive' } },
                { purpose: { contains: query.search, mode: 'insensitive' } },
                { requesterId: { contains: query.search, mode: 'insensitive' } },
            ]
        }

        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20

        const [data, total] = await Promise.all([
            this.prisma.mmPurchaseRequisition.findMany({
                where,
                include: PR_INCLUDES,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmPurchaseRequisition.count({ where }),
        ])

        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        return this.findOneOrFail(id)
    }

    async submit(id: string, performedBy?: string) {
        const pr = await this.findOneOrFail(id)
        if (pr.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot submit: PR is ${pr.status}`)
        }
        if (pr.lines.length === 0) {
            throw new BadRequestException('Cannot submit PR with no lines')
        }
        if (performedBy && pr.requesterId !== performedBy) {
            throw new BadRequestException('Only the requester can submit this PR')
        }

        const total = pr.lines.reduce(
            (sum, l) => sum.plus(new Decimal(l.estimatedTotal)),
            new Decimal(0),
        )

        const materialCategoryIds = [
            ...new Set(
                pr.lines
                    .map((l) => (l.material as any)?.materialCategoryId)
                    .filter(Boolean) as string[],
            ),
        ]
        const preferredSupplierIds = [
            ...new Set(
                pr.lines
                    .map((l) => l.preferredSupplierId)
                    .filter(Boolean) as string[],
            ),
        ]

        const wf = await this.workflowService.start('PURCHASE_REQUISITION', id, {
            amount: total,
            initiatedBy: performedBy ?? pr.requesterId,
            notifyTarget: pr.requesterId,
            context: {
                companyId: pr.companyId,
                departmentId: pr.departmentId ?? undefined,
                costCenterId: pr.costCenterId ?? undefined,
                supplierId: preferredSupplierIds[0],
                materialCategoryIds,
            },
        })

        const updated = await this.prisma.mmPurchaseRequisition.update({
            where: { id },
            data: {
                status: 'SUBMITTED',
                submittedAt: new Date(),
                workflowInstanceId: wf.instance.id,
            },
            include: PR_INCLUDES,
        })

        await this.prisma.mmPurchaseRequisition.update({
            where: { id },
            data: { status: 'PENDING_APPROVAL' },
        })

        await this.audit(id, 'SUBMITTED', 'status', 'DRAFT', 'SUBMITTED -> PENDING_APPROVAL', performedBy)
        return { ...updated, status: 'PENDING_APPROVAL' }
    }

    @OnEvent('workflow.approved')
    async handleApproved(payload: { entityType: string; entityId: string; decidedBy?: string }) {
        if (payload.entityType !== 'PURCHASE_REQUISITION') return
        const updated = await this.prisma.mmPurchaseRequisition.update({
            where: { id: payload.entityId },
            data: { status: 'APPROVED', approvedBy: payload.decidedBy ?? null, approvedAt: new Date() },
            include: PR_INCLUDES,
        })
        await this.audit(payload.entityId, 'APPROVED', 'status', 'PENDING_APPROVAL', 'APPROVED', payload.decidedBy)
        return updated
    }

    @OnEvent('workflow.rejected')
    async handleRejected(payload: { entityType: string; entityId: string; comment?: string; decidedBy?: string }) {
        if (payload.entityType !== 'PURCHASE_REQUISITION') return
        const updated = await this.prisma.mmPurchaseRequisition.update({
            where: { id: payload.entityId },
            data: { status: 'REJECTED', rejectionReason: payload.comment ?? null },
            include: PR_INCLUDES,
        })
        await this.audit(payload.entityId, 'REJECTED', 'status', 'PENDING_APPROVAL', `REJECTED: ${payload.comment ?? ''}`, payload.decidedBy)
        return updated
    }

    @OnEvent('workflow.returned')
    async handleReturned(payload: { entityType: string; entityId: string; comment?: string; decidedBy?: string }) {
        if (payload.entityType !== 'PURCHASE_REQUISITION') return
        const updated = await this.prisma.mmPurchaseRequisition.update({
            where: { id: payload.entityId },
            data: { status: 'RETURNED', returnedReason: payload.comment ?? null },
            include: PR_INCLUDES,
        })
        await this.audit(payload.entityId, 'RETURNED', 'status', 'PENDING_APPROVAL', `RETURNED: ${payload.comment ?? ''}`, payload.decidedBy)
        return updated
    }

    async cancel(id: string, performedBy?: string) {
        const pr = await this.findOneOrFail(id)
        const cancellable = ['DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'REJECTED', 'RETURNED']
        if (!cancellable.includes(pr.status)) {
            throw new BadRequestException(`Cannot cancel: PR is ${pr.status}`)
        }

        await this.workflowService.cancel('PURCHASE_REQUISITION', id)

        const updated = await this.prisma.mmPurchaseRequisition.update({
            where: { id },
            data: { status: 'CANCELLED' },
            include: PR_INCLUDES,
        })
        await this.audit(id, 'CANCELLED', 'status', pr.status, 'CANCELLED', performedBy)
        return updated
    }

    async close(id: string, performedBy?: string) {
        const pr = await this.findOneOrFail(id)
        const closable = ['APPROVED', 'PARTIALLY_CONVERTED', 'FULLY_CONVERTED']
        if (!closable.includes(pr.status)) {
            throw new BadRequestException(`Cannot close: PR is ${pr.status}`)
        }

        const updated = await this.prisma.mmPurchaseRequisition.update({
            where: { id },
            data: { status: 'CLOSED' },
            include: PR_INCLUDES,
        })
        await this.audit(id, 'CLOSED', 'status', pr.status, 'CLOSED', performedBy)
        return updated
    }

    async convert(id: string, dto: ConvertPurchaseRequisitionDto, performedBy?: string) {
        const pr = await this.findOneOrFail(id)
        const convertible = ['APPROVED', 'PARTIALLY_CONVERTED', 'FULLY_CONVERTED']
        if (!convertible.includes(pr.status)) {
            throw new BadRequestException(`Cannot convert: PR is ${pr.status}`)
        }

        const lineMap = new Map(pr.lines.map((l) => [l.id, l]))

        for (const conv of dto.lines) {
            const line = lineMap.get(conv.lineId)
            if (!line) {
                throw new BadRequestException(`Line ${conv.lineId} not found on PR`)
            }

            const existing = new Decimal(line.convertedQty)
            const requested = new Decimal(line.requestedQuantity)
            const newConverted = new Decimal(conv.convertedQty)

            if (existing.plus(newConverted).gt(requested)) {
                throw new BadRequestException(
                    `Line ${conv.lineId}: converted (${existing.plus(newConverted)}) would exceed requested (${requested})`,
                )
            }

            const dup = await this.prisma.mmPrConversion.findFirst({
                where: { lineId: conv.lineId, targetType: conv.targetType, targetId: conv.targetId ?? null },
            })
            if (dup) {
                throw new BadRequestException(
                    `Line ${conv.lineId} already converted to ${conv.targetType}${conv.targetId ? ` (${conv.targetId})` : ''}`,
                )
            }

            await this.prisma.mmPrConversion.create({
                data: {
                    requisitionId: id,
                    lineId: conv.lineId,
                    targetType: conv.targetType,
                    targetId: conv.targetId ?? null,
                    convertedQty: newConverted,
                    convertedBy: performedBy ?? null,
                },
            })

            await this.prisma.mmPurchaseRequisitionLine.update({
                where: { id: conv.lineId },
                data: { convertedQty: existing.plus(newConverted) },
            })
        }

        const refreshed = await this.findOneOrFail(id)
        const allConverted = refreshed.lines.every(
            (l) => new Decimal(l.convertedQty).gte(new Decimal(l.requestedQuantity)),
        )

        const newStatus = allConverted ? 'FULLY_CONVERTED' : 'PARTIALLY_CONVERTED'
        const updated = await this.prisma.mmPurchaseRequisition.update({
            where: { id },
            data: { status: newStatus },
            include: PR_INCLUDES,
        })
        await this.audit(id, 'CONVERTED', 'status', pr.status, newStatus, performedBy)
        return updated
    }

    async getAudit(id: string) {
        return this.prisma.mmPurchaseRequisitionAudit.findMany({
            where: { requisitionId: id },
            orderBy: { performedAt: 'desc' },
        })
    }

    async approveViaWorkflow(id: string, userId?: string, comment?: string) {
        const pr = await this.findOneOrFail(id)
        if (pr.status !== 'PENDING_APPROVAL') {
            throw new BadRequestException(`Cannot approve: PR is ${pr.status}`)
        }
        const task = await this.getPendingTask(id)
        await this.workflowService.approveTask(task.id, { userId, comment })
        const updated = await this.prisma.mmPurchaseRequisition.update({
            where: { id },
            data: { status: 'APPROVED', approvedBy: userId ?? null, approvedAt: new Date() },
            include: PR_INCLUDES,
        })
        await this.audit(id, 'APPROVED', 'status', 'PENDING_APPROVAL', 'APPROVED', userId)
        return updated
    }

    async rejectViaWorkflow(id: string, reason?: string, userId?: string) {
        const pr = await this.findOneOrFail(id)
        if (pr.status !== 'PENDING_APPROVAL') {
            throw new BadRequestException(`Cannot reject: PR is ${pr.status}`)
        }
        const task = await this.getPendingTask(id)
        await this.workflowService.rejectTask(task.id, { userId, comment: reason })
        const updated = await this.prisma.mmPurchaseRequisition.update({
            where: { id },
            data: { status: 'REJECTED', rejectionReason: reason ?? null },
            include: PR_INCLUDES,
        })
        await this.audit(id, 'REJECTED', 'status', 'PENDING_APPROVAL', `REJECTED: ${reason ?? ''}`, userId)
        return updated
    }

    async returnViaWorkflow(id: string, comment?: string, userId?: string) {
        const pr = await this.findOneOrFail(id)
        if (pr.status !== 'PENDING_APPROVAL') {
            throw new BadRequestException(`Cannot return: PR is ${pr.status}`)
        }
        const task = await this.getPendingTask(id)
        await this.workflowService.returnTask(task.id, { userId, comment })
        const updated = await this.prisma.mmPurchaseRequisition.update({
            where: { id },
            data: { status: 'RETURNED', returnedReason: comment ?? null },
            include: PR_INCLUDES,
        })
        await this.audit(id, 'RETURNED', 'status', 'PENDING_APPROVAL', `RETURNED: ${comment ?? ''}`, userId)
        return updated
    }

    private async getPendingTask(id: string) {
        const pr = await this.findOneOrFail(id)
        const instance = pr.workflowInstance
        if (!instance) throw new BadRequestException('No workflow instance for this PR')
        const pending = (instance.tasks ?? []).find((t: any) => t.status === 'PENDING')
        if (!pending) throw new BadRequestException('No pending approval task')
        return pending
    }

    private async findOneOrFail(id: string) {
        const pr = await this.prisma.mmPurchaseRequisition.findUnique({
            where: { id },
            include: PR_INCLUDES,
        })
        if (!pr) throw new NotFoundException('Purchase requisition not found')
        return pr
    }

    private async audit(
        requisitionId: string,
        action: string,
        field: string | null,
        oldValue: string | null,
        newValue: string | null,
        performedBy?: string,
    ) {
        await this.prisma.mmPurchaseRequisitionAudit.create({
            data: {
                requisitionId,
                action,
                field,
                oldValue,
                newValue,
                performedBy: performedBy ?? null,
            },
        })
    }

    private async generateRequisitionNumber(): Promise<string> {
        const today = new Date()
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `REQ-${dateStr}-`

        const last = await this.prisma.mmPurchaseRequisition.findFirst({
            where: { requisitionNumber: { startsWith: pfx } },
            orderBy: { requisitionNumber: 'desc' },
        })

        let seq = 1
        if (last) {
            const lastSeq = parseInt(last.requisitionNumber.replace(pfx, ''), 10)
            if (!isNaN(lastSeq)) seq = lastSeq + 1
        }
        return `${pfx}${String(seq).padStart(5, '0')}`
    }
}