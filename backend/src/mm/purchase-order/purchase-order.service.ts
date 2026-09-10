import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { PrismaService } from '../../prisma/prisma.service'
import { WorkflowService } from '../workflow/workflow.service'
import { CreatePurchaseOrderDto, CreatePurchaseOrderLineDto } from './dto/create-purchase-order.dto'
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto'
import { PurchaseOrderQueryDto } from './dto/purchase-order-query.dto'
import {
    CreatePoFromAwardDto,
    CreatePoFromPrDto,
    CreatePoAttachmentDto,
    UpsertPoToleranceDto,
} from './dto/po-actions.dto'
import { Decimal } from '@prisma/client/runtime/library'

const PO_INCLUDES = {
    lines: {
        include: {
            material: { select: { id: true, materialCode: true, materialName: true, materialCategoryId: true } },
            uom: { select: { id: true, code: true, name: true } },
            warehouse: { select: { id: true, name: true, code: true } },
            storageBin: { select: { id: true, code: true } },
        },
        orderBy: { lineNumber: 'asc' as const },
    },
    company: { select: { id: true, name: true } },
    supplier: { select: { id: true, supplierCode: true, supplierName: true } },
    currency: { select: { id: true, code: true, name: true } },
    paymentTerms: { select: { id: true, code: true, name: true } },
    warehouse: { select: { id: true, code: true, name: true } },
    workflowInstance: { include: { tasks: { orderBy: { stepNumber: 'asc' as const } } } },
    purchaseRequisition: { select: { id: true, requisitionNumber: true } },
    rfq: { select: { id: true, rfqNumber: true } },
    quotation: { select: { id: true, quotationNumber: true } },
    award: { select: { id: true } },
    attachments: true,
    goodsReceipts: { select: { id: true, documentNumber: true, status: true, postingDate: true } },
}

function calcLineTotal(l: {
    quantity: number | Decimal
    unitPrice: number | Decimal
    discount?: number | Decimal
    tax?: number | Decimal
    freight?: number | Decimal
}) {
    const qty = new Decimal(l.quantity)
    const price = new Decimal(l.unitPrice ?? 0)
    const discount = new Decimal(l.discount ?? 0)
    const tax = new Decimal(l.tax ?? 0)
    const freight = new Decimal(l.freight ?? 0)
    return qty.mul(price).minus(discount).plus(tax).plus(freight)
}

@Injectable()
export class PurchaseOrderService {
    constructor(
        private prisma: PrismaService,
        private workflowService: WorkflowService,
    ) {}

    async create(dto: CreatePurchaseOrderDto) {
        if (!dto.lines?.length) {
            throw new BadRequestException('At least one line is required')
        }
        const { assertSupplierUsableById } = await import('../supplier/assert-supplier-usable')
        await assertSupplierUsableById(this.prisma, dto.supplierId)
        const { assertPurchasableMaterials } = await import('../materials/assert-purchasable-materials')
        await assertPurchasableMaterials(
            this.prisma,
            dto.lines.map((l) => l.materialId),
        )
        const poNumber = await this.generatePoNumber()
        const lines = this.mapLines(dto.lines)
        const totalAmount = lines.reduce((s, l) => s.plus(l.lineTotal), new Decimal(0))

        const po = await this.prisma.mmPurchaseOrder.create({
            data: {
                poNumber,
                companyId: dto.companyId,
                branchId: dto.branchId ?? null,
                departmentId: dto.departmentId ?? null,
                supplierId: dto.supplierId,
                buyerId: dto.buyerId,
                currencyId: dto.currencyId ?? null,
                paymentTermsId: dto.paymentTermsId ?? null,
                deliveryTerms: dto.deliveryTerms ?? null,
                warehouseId: dto.warehouseId ?? null,
                expectedDeliveryDate: dto.expectedDeliveryDate
                    ? new Date(dto.expectedDeliveryDate)
                    : null,
                status: 'DRAFT',
                totalAmount,
                purchaseRequisitionId: dto.purchaseRequisitionId ?? null,
                rfqId: dto.rfqId ?? null,
                quotationId: dto.quotationId ?? null,
                awardId: dto.awardId ?? null,
                overDeliveryPctOverride: dto.overDeliveryPctOverride ?? null,
                underDeliveryPctOverride: dto.underDeliveryPctOverride ?? null,
                priceTolerancePctOverride: dto.priceTolerancePctOverride ?? null,
                quantityTolerancePctOverride: dto.quantityTolerancePctOverride ?? null,
                createdBy: dto.createdBy ?? null,
                lines: { create: lines },
            },
            include: PO_INCLUDES,
        })

        await this.audit(po.id, 'CREATED', null, null, `Created PO ${poNumber}`, dto.createdBy)
        return po
    }

    async createFromAward(dto: CreatePoFromAwardDto) {
        const award = await this.prisma.mmRfqAward.findUnique({
            where: { id: dto.awardId },
            include: {
                rfq: { include: { lines: true } },
                quotation: { include: { lines: true, paymentTerms: true } },
                supplier: true,
            },
        })
        if (!award) throw new NotFoundException('Award not found')
        if (!award.quotationId || !award.quotation) {
            throw new BadRequestException('Award has no linked quotation')
        }

        const quotation = award.quotation
        const lines: CreatePurchaseOrderLineDto[] = quotation.lines.map((ql) => {
            const rfqLine = award.rfq.lines.find((rl) => rl.id === ql.rfqLineId)
            return {
                materialId: ql.materialId,
                description: '',
                quantity: Number(ql.quantity),
                uomId: ql.uomId,
                unitPrice: Number(ql.unitPrice),
                discount: Number(ql.discount),
                tax: Number(ql.tax),
                freight: 0,
                rfqLineId: ql.rfqLineId ?? undefined,
                quotationLineId: ql.id,
                prLineId: rfqLine?.prLineId ?? undefined,
                warehouseId: dto.warehouseId,
            }
        })

        return this.create({
            companyId: award.rfq.companyId,
            supplierId: award.supplierId,
            buyerId: dto.buyerId ?? award.rfq.buyerId,
            branchId: dto.branchId,
            currencyId: quotation.currencyId ?? award.rfq.currencyId ?? undefined,
            paymentTermsId: quotation.paymentTermsId ?? undefined,
            deliveryTerms: quotation.deliveryTerms ?? undefined,
            warehouseId: dto.warehouseId,
            purchaseRequisitionId: award.rfq.purchaseRequisitionId ?? undefined,
            rfqId: award.rfqId,
            quotationId: quotation.id,
            awardId: award.id,
            createdBy: dto.createdBy,
            lines,
        })
    }

    async createFromPr(dto: CreatePoFromPrDto) {
        const pr = await this.prisma.mmPurchaseRequisition.findUnique({
            where: { id: dto.purchaseRequisitionId },
            include: { lines: true },
        })
        if (!pr) throw new NotFoundException('Purchase requisition not found')
        if (!['APPROVED', 'PARTIALLY_CONVERTED'].includes(pr.status)) {
            throw new BadRequestException(`Cannot create PO from PR in status ${pr.status}`)
        }
        if (!dto.lineIds?.length) {
            throw new BadRequestException('At least one PR line is required')
        }

        const lineMap = new Map(pr.lines.map((l) => [l.id, l]))
        const lines: CreatePurchaseOrderLineDto[] = []

        for (const sel of dto.lineIds) {
            const prLine = lineMap.get(sel.lineId)
            if (!prLine) throw new BadRequestException(`PR line ${sel.lineId} not found`)
            const remaining = new Decimal(prLine.requestedQuantity).minus(prLine.convertedQty)
            const qty = sel.quantity != null ? new Decimal(sel.quantity) : remaining
            if (qty.lte(0)) {
                throw new BadRequestException(`PR line ${sel.lineId} has no remaining quantity`)
            }
            if (qty.gt(remaining)) {
                throw new BadRequestException(
                    `PR line ${sel.lineId}: qty ${qty} exceeds remaining ${remaining}`,
                )
            }
            lines.push({
                materialId: prLine.materialId,
                description: prLine.description,
                quantity: Number(qty),
                uomId: prLine.uomId,
                unitPrice: Number(prLine.estimatedUnitPrice),
                warehouseId: dto.warehouseId ?? prLine.warehouseId ?? undefined,
                requiredDate: prLine.requiredDate?.toISOString(),
                prLineId: prLine.id,
            })
        }

        const po = await this.create({
            companyId: pr.companyId,
            supplierId: dto.supplierId,
            buyerId: dto.buyerId,
            branchId: dto.branchId ?? pr.branchId ?? undefined,
            departmentId: (pr as any).departmentId ?? undefined,
            currencyId: dto.currencyId,
            paymentTermsId: dto.paymentTermsId,
            warehouseId: dto.warehouseId,
            purchaseRequisitionId: pr.id,
            createdBy: dto.createdBy,
            lines,
        })

        for (const sel of dto.lineIds) {
            const prLine = lineMap.get(sel.lineId)!
            const remaining = new Decimal(prLine.requestedQuantity).minus(prLine.convertedQty)
            const qty = sel.quantity != null ? new Decimal(sel.quantity) : remaining
            await this.prisma.mmPrConversion.create({
                data: {
                    requisitionId: pr.id,
                    lineId: sel.lineId,
                    targetType: 'PO',
                    targetId: po.id,
                    convertedQty: qty,
                    convertedBy: dto.createdBy ?? null,
                },
            })
            await this.prisma.mmPurchaseRequisitionLine.update({
                where: { id: sel.lineId },
                data: { convertedQty: new Decimal(prLine.convertedQty).plus(qty) },
            })
        }

        const refreshed = await this.prisma.mmPurchaseRequisition.findUnique({
            where: { id: pr.id },
            include: { lines: true },
        })
        if (refreshed) {
            const allConverted = refreshed.lines.every((l) =>
                new Decimal(l.convertedQty).gte(new Decimal(l.requestedQuantity)),
            )
            await this.prisma.mmPurchaseRequisition.update({
                where: { id: pr.id },
                data: { status: allConverted ? 'FULLY_CONVERTED' : 'PARTIALLY_CONVERTED' },
            })
        }

        return this.findOneOrFail(po.id)
    }

    async update(id: string, dto: UpdatePurchaseOrderDto, performedBy?: string) {
        const po = await this.findOneOrFail(id)
        if (po.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot update: PO is ${po.status}`)
        }

        if (dto.supplierId && dto.supplierId !== po.supplierId) {
            const { assertSupplierUsableById } = await import('../supplier/assert-supplier-usable')
            await assertSupplierUsableById(this.prisma, dto.supplierId)
        }
        if (dto.lines?.length) {
            const { assertPurchasableMaterials } = await import('../materials/assert-purchasable-materials')
            await assertPurchasableMaterials(
                this.prisma,
                dto.lines.map((l) => l.materialId),
            )
        }

        const data: any = {}
        const keys: (keyof UpdatePurchaseOrderDto)[] = [
            'branchId', 'departmentId', 'supplierId', 'buyerId', 'currencyId', 'paymentTermsId',
            'deliveryTerms', 'warehouseId',
            'overDeliveryPctOverride', 'underDeliveryPctOverride',
            'priceTolerancePctOverride', 'quantityTolerancePctOverride',
        ]
        for (const key of keys) {
            if (dto[key] !== undefined) data[key] = dto[key]
        }
        if (dto.expectedDeliveryDate) data.expectedDeliveryDate = new Date(dto.expectedDeliveryDate)

        if (dto.lines && dto.lines.length > 0) {
            await this.prisma.mmPurchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } })
            const lines = this.mapLines(dto.lines as CreatePurchaseOrderLineDto[])
            data.lines = { create: lines }
            data.totalAmount = lines.reduce((s, l) => s.plus(l.lineTotal), new Decimal(0))
        }

        const updated = await this.prisma.mmPurchaseOrder.update({
            where: { id },
            data,
            include: PO_INCLUDES,
        })
        await this.audit(id, 'UPDATED', null, null, 'PO updated', performedBy)
        return updated
    }

    async findAll(query: PurchaseOrderQueryDto) {
        const where: any = {}
        if (query.status) where.status = query.status
        if (query.supplierId) where.supplierId = query.supplierId
        if (query.buyerId) where.buyerId = query.buyerId
        if (query.companyId) where.companyId = query.companyId
        if (query.search) {
            where.OR = [
                { poNumber: { contains: query.search, mode: 'insensitive' } },
                { buyerId: { contains: query.search, mode: 'insensitive' } },
                { supplier: { supplierName: { contains: query.search, mode: 'insensitive' } } },
            ]
        }

        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20

        const [data, total] = await Promise.all([
            this.prisma.mmPurchaseOrder.findMany({
                where,
                include: PO_INCLUDES,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmPurchaseOrder.count({ where }),
        ])

        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        return this.findOneOrFail(id)
    }

    async submit(id: string, performedBy?: string) {
        const po = await this.findOneOrFail(id)
        if (po.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot submit: PO is ${po.status}`)
        }
        if (po.lines.length === 0) {
            throw new BadRequestException('Cannot submit PO with no lines')
        }

        const total = po.lines.reduce(
            (sum, l) => sum.plus(new Decimal(l.lineTotal)),
            new Decimal(0),
        )

        const materialCategoryIds = [
            ...new Set(
                po.lines
                    .map((l) => (l.material as any)?.materialCategoryId)
                    .filter(Boolean) as string[],
            ),
        ]
        const costCenterIds = [
            ...new Set(
                po.lines
                    .map((l) => l.costCenterId)
                    .filter(Boolean) as string[],
            ),
        ]

        const wf = await this.workflowService.start('PURCHASE_ORDER', id, {
            amount: total,
            initiatedBy: performedBy ?? po.buyerId,
            notifyTarget: po.buyerId,
            context: {
                companyId: po.companyId,
                departmentId: po.departmentId ?? undefined,
                costCenterId: costCenterIds[0] ?? undefined,
                supplierId: po.supplierId,
                materialCategoryIds,
            },
        })

        await this.prisma.mmPurchaseOrder.update({
            where: { id },
            data: {
                status: 'PENDING_APPROVAL',
                submittedAt: new Date(),
                totalAmount: total,
                workflowInstanceId: wf.instance.id,
            },
        })

        await this.audit(id, 'SUBMITTED', 'status', 'DRAFT', 'PENDING_APPROVAL', performedBy)
        return this.findOneOrFail(id)
    }

    @OnEvent('workflow.approved')
    async handleApproved(payload: { entityType: string; entityId: string; decidedBy?: string }) {
        if (payload.entityType !== 'PURCHASE_ORDER') return
        await this.prisma.mmPurchaseOrder.update({
            where: { id: payload.entityId },
            data: {
                status: 'APPROVED',
                approvedBy: payload.decidedBy ?? null,
                approvedAt: new Date(),
            },
        })
        await this.audit(payload.entityId, 'APPROVED', 'status', 'PENDING_APPROVAL', 'APPROVED', payload.decidedBy)
    }

    @OnEvent('workflow.rejected')
    async handleRejected(payload: {
        entityType: string
        entityId: string
        comment?: string
        decidedBy?: string
    }) {
        if (payload.entityType !== 'PURCHASE_ORDER') return
        await this.prisma.mmPurchaseOrder.update({
            where: { id: payload.entityId },
            data: { status: 'REJECTED', rejectionReason: payload.comment ?? null },
        })
        await this.audit(
            payload.entityId,
            'REJECTED',
            'status',
            'PENDING_APPROVAL',
            `REJECTED: ${payload.comment ?? ''}`,
            payload.decidedBy,
        )
    }

    @OnEvent('workflow.returned')
    async handleReturned(payload: {
        entityType: string
        entityId: string
        comment?: string
        decidedBy?: string
    }) {
        if (payload.entityType !== 'PURCHASE_ORDER') return
        await this.prisma.mmPurchaseOrder.update({
            where: { id: payload.entityId },
            data: { status: 'DRAFT', returnedReason: payload.comment ?? null },
        })
        await this.audit(
            payload.entityId,
            'RETURNED',
            'status',
            'PENDING_APPROVAL',
            `RETURNED: ${payload.comment ?? ''}`,
            payload.decidedBy,
        )
    }

    async approveViaWorkflow(id: string, userId?: string, comment?: string) {
        const po = await this.findOneOrFail(id)
        if (po.status !== 'PENDING_APPROVAL') {
            throw new BadRequestException(`Cannot approve: PO is ${po.status}`)
        }
        const task = await this.getPendingTask(id)
        await this.workflowService.approveTask(task.id, { userId, comment })
        const updated = await this.prisma.mmPurchaseOrder.update({
            where: { id },
            data: { status: 'APPROVED', approvedBy: userId ?? null, approvedAt: new Date() },
            include: PO_INCLUDES,
        })
        await this.audit(id, 'APPROVED', 'status', 'PENDING_APPROVAL', 'APPROVED', userId)
        return updated
    }

    async rejectViaWorkflow(id: string, reason?: string, userId?: string) {
        const po = await this.findOneOrFail(id)
        if (po.status !== 'PENDING_APPROVAL') {
            throw new BadRequestException(`Cannot reject: PO is ${po.status}`)
        }
        const task = await this.getPendingTask(id)
        await this.workflowService.rejectTask(task.id, { userId, comment: reason })
        const updated = await this.prisma.mmPurchaseOrder.update({
            where: { id },
            data: { status: 'REJECTED', rejectionReason: reason ?? null },
            include: PO_INCLUDES,
        })
        await this.audit(id, 'REJECTED', 'status', 'PENDING_APPROVAL', `REJECTED: ${reason ?? ''}`, userId)
        return updated
    }

    async returnViaWorkflow(id: string, comment?: string, userId?: string) {
        const po = await this.findOneOrFail(id)
        if (po.status !== 'PENDING_APPROVAL') {
            throw new BadRequestException(`Cannot return: PO is ${po.status}`)
        }
        const task = await this.getPendingTask(id)
        await this.workflowService.returnTask(task.id, { userId, comment })
        const updated = await this.prisma.mmPurchaseOrder.update({
            where: { id },
            data: { status: 'DRAFT', returnedReason: comment ?? null },
            include: PO_INCLUDES,
        })
        await this.audit(id, 'RETURNED', 'status', 'PENDING_APPROVAL', `RETURNED: ${comment ?? ''}`, userId)
        return updated
    }

    async send(id: string, performedBy?: string) {
        const po = await this.findOneOrFail(id)
        if (po.status !== 'APPROVED') {
            throw new BadRequestException(`Cannot send: PO is ${po.status}`)
        }
        const updated = await this.prisma.mmPurchaseOrder.update({
            where: { id },
            data: { status: 'SENT', sentAt: new Date() },
            include: PO_INCLUDES,
        })
        await this.audit(id, 'SENT', 'status', 'APPROVED', 'SENT', performedBy, {
            transmission: 'stub',
        })
        return updated
    }

    async cancel(id: string, reason?: string, performedBy?: string) {
        const po = await this.findOneOrFail(id)
        const allowed = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'REJECTED']
        if (!allowed.includes(po.status)) {
            throw new BadRequestException(`Cannot cancel: PO is ${po.status}`)
        }
        const anyReceived = po.lines.some((l) => Number(l.receivedQuantity) > 0)
        if (anyReceived) {
            throw new BadRequestException('Cannot cancel: goods already received against this PO')
        }

        await this.workflowService.cancel('PURCHASE_ORDER', id)

        const updated = await this.prisma.mmPurchaseOrder.update({
            where: { id },
            data: {
                status: 'CANCELLED',
                cancelledAt: new Date(),
                cancelReason: reason ?? null,
            },
            include: PO_INCLUDES,
        })
        await this.audit(id, 'CANCELLED', 'status', po.status, 'CANCELLED', performedBy)
        return updated
    }

    async close(id: string, performedBy?: string) {
        const po = await this.findOneOrFail(id)
        if (!['FULLY_RECEIVED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
            throw new BadRequestException(`Cannot close: PO is ${po.status}`)
        }
        const updated = await this.prisma.mmPurchaseOrder.update({
            where: { id },
            data: { status: 'CLOSED', closedAt: new Date() },
            include: PO_INCLUDES,
        })
        await this.audit(id, 'CLOSED', 'status', po.status, 'CLOSED', performedBy)
        return updated
    }

    async getAudit(id: string) {
        await this.findOneOrFail(id)
        return this.prisma.mmPurchaseOrderAudit.findMany({
            where: { purchaseOrderId: id },
            orderBy: { performedAt: 'desc' },
        })
    }

    async getDocumentFlow(id: string) {
        const po = await this.findOneOrFail(id)
        return {
            purchaseOrder: { id: po.id, number: po.poNumber, status: po.status },
            purchaseRequisition: po.purchaseRequisition
                ? {
                      id: po.purchaseRequisition.id,
                      number: po.purchaseRequisition.requisitionNumber,
                  }
                : null,
            rfq: po.rfq ? { id: po.rfq.id, number: po.rfq.rfqNumber } : null,
            quotation: po.quotation
                ? { id: po.quotation.id, number: po.quotation.quotationNumber }
                : null,
            award: po.award ? { id: po.award.id } : null,
            goodsReceipts: po.goodsReceipts.map((gr) => ({
                id: gr.id,
                number: gr.documentNumber,
                status: gr.status,
                postingDate: gr.postingDate,
            })),
        }
    }

    async listAttachments(id: string) {
        await this.findOneOrFail(id)
        return this.prisma.mmPurchaseOrderAttachment.findMany({
            where: { purchaseOrderId: id },
            orderBy: { uploadedAt: 'desc' },
        })
    }

    async addAttachment(id: string, dto: CreatePoAttachmentDto) {
        await this.findOneOrFail(id)
        const att = await this.prisma.mmPurchaseOrderAttachment.create({
            data: {
                purchaseOrderId: id,
                fileName: dto.fileName,
                fileUrl: dto.fileUrl ?? null,
                storageKey: dto.storageKey ?? null,
                uploadedBy: dto.uploadedBy ?? null,
            },
        })
        await this.audit(id, 'ATTACHMENT_ADDED', null, null, dto.fileName, dto.uploadedBy)
        return att
    }

    async deleteAttachment(id: string, attachmentId: string, performedBy?: string) {
        const att = await this.prisma.mmPurchaseOrderAttachment.findFirst({
            where: { id: attachmentId, purchaseOrderId: id },
        })
        if (!att) throw new NotFoundException('Attachment not found')
        await this.prisma.mmPurchaseOrderAttachment.delete({ where: { id: attachmentId } })
        await this.audit(id, 'ATTACHMENT_REMOVED', null, null, att.fileName, performedBy)
        return { deleted: true }
    }

    async getTolerances(companyId: string) {
        const existing = await this.prisma.mmPoToleranceConfig.findUnique({
            where: { companyId },
        })
        if (existing) return existing
        return {
            companyId,
            overDeliveryPct: 0,
            underDeliveryPct: 0,
            priceTolerancePct: 0,
            quantityTolerancePct: 0,
            absoluteToleranceAmount: 0,
        }
    }

    async upsertTolerances(dto: UpsertPoToleranceDto) {
        return this.prisma.mmPoToleranceConfig.upsert({
            where: { companyId: dto.companyId },
            create: {
                companyId: dto.companyId,
                overDeliveryPct: dto.overDeliveryPct ?? 0,
                underDeliveryPct: dto.underDeliveryPct ?? 0,
                priceTolerancePct: dto.priceTolerancePct ?? 0,
                quantityTolerancePct: dto.quantityTolerancePct ?? 0,
                absoluteToleranceAmount: dto.absoluteToleranceAmount ?? 0,
            },
            update: {
                ...(dto.overDeliveryPct !== undefined
                    ? { overDeliveryPct: dto.overDeliveryPct }
                    : {}),
                ...(dto.underDeliveryPct !== undefined
                    ? { underDeliveryPct: dto.underDeliveryPct }
                    : {}),
                ...(dto.priceTolerancePct !== undefined
                    ? { priceTolerancePct: dto.priceTolerancePct }
                    : {}),
                ...(dto.quantityTolerancePct !== undefined
                    ? { quantityTolerancePct: dto.quantityTolerancePct }
                    : {}),
                ...(dto.absoluteToleranceAmount !== undefined
                    ? { absoluteToleranceAmount: dto.absoluteToleranceAmount }
                    : {}),
            },
        })
    }

    private mapLines(lines: CreatePurchaseOrderLineDto[]) {
        return lines.map((l, idx) => {
            const unitPrice = new Decimal(l.unitPrice ?? 0)
            const discount = new Decimal(l.discount ?? 0)
            const tax = new Decimal(l.tax ?? 0)
            const freight = new Decimal(l.freight ?? 0)
            const quantity = new Decimal(l.quantity)
            return {
                lineNumber: idx + 1,
                materialId: l.materialId,
                description: l.description ?? '',
                quantity,
                uomId: l.uomId,
                unitPrice,
                discount,
                tax,
                freight,
                lineTotal: calcLineTotal({ quantity, unitPrice, discount, tax, freight }),
                requiredDate: l.requiredDate ? new Date(l.requiredDate) : null,
                expectedDeliveryDate: l.expectedDeliveryDate
                    ? new Date(l.expectedDeliveryDate)
                    : null,
                warehouseId: l.warehouseId ?? null,
                storageBinId: l.storageBinId ?? null,
                costCenterId: l.costCenterId ?? null,
                projectId: l.projectId ?? null,
                prLineId: l.prLineId ?? null,
                rfqLineId: l.rfqLineId ?? null,
                quotationLineId: l.quotationLineId ?? null,
                remarks: l.remarks ?? null,
            }
        })
    }

    private async getPendingTask(id: string) {
        const instance = await this.workflowService.findByEntity('PURCHASE_ORDER', id)
        if (!instance) throw new BadRequestException('No workflow instance for this PO')
        const task = instance.tasks.find((t) => t.status === 'PENDING')
        if (!task) throw new BadRequestException('No pending approval task')
        return task
    }

    private async findOneOrFail(id: string) {
        const po = await this.prisma.mmPurchaseOrder.findUnique({
            where: { id },
            include: PO_INCLUDES,
        })
        if (!po) throw new NotFoundException('Purchase order not found')
        return po
    }

    private async generatePoNumber(): Promise<string> {
        const today = new Date()
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `PO-${dateStr}-`
        const last = await this.prisma.mmPurchaseOrder.findFirst({
            where: { poNumber: { startsWith: pfx } },
            orderBy: { poNumber: 'desc' },
        })
        let seq = 1
        if (last) {
            const lastSeq = parseInt(last.poNumber.replace(pfx, ''), 10)
            if (!isNaN(lastSeq)) seq = lastSeq + 1
        }
        return `${pfx}${String(seq).padStart(5, '0')}`
    }

    private async audit(
        purchaseOrderId: string,
        action: string,
        field?: string | null,
        oldValue?: string | null,
        newValue?: string | null,
        performedBy?: string | null,
        details?: any,
    ) {
        await this.prisma.mmPurchaseOrderAudit.create({
            data: {
                purchaseOrderId,
                action,
                field: field ?? null,
                oldValue: oldValue ?? null,
                newValue: newValue ?? null,
                performedBy: performedBy ?? null,
                details: details ?? undefined,
            },
        })
    }
}
