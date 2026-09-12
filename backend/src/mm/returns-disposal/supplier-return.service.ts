import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PrismaService } from '../../prisma/prisma.service'
import { InventoryPostingService } from '../inventory/inventory-posting.service'
import { postingKey } from '../common/idempotency.util'
import { MmDomainEventsService } from '../common/mm-domain-events.service'
import { ReturnsDisposalConfigService } from './returns-disposal-config.service'
import {
    CreateSupplierReturnDto,
    UpdateSupplierReturnDto,
    ReturnsQueryDto,
    ActionDto,
} from './dto/returns-disposal.dto'
import { Decimal } from '@prisma/client/runtime/library'

const LINE_INCLUDE = {
    material: true,
}

const DETAIL_INCLUDE = {
    lines: { include: LINE_INCLUDE },
    supplier: true,
    warehouse: true,
    goodsReceipt: true,
    audits: { orderBy: { performedAt: 'desc' as const } },
}

@Injectable()
export class SupplierReturnService {
    constructor(
        private prisma: PrismaService,
        private postingService: InventoryPostingService,
        private configService: ReturnsDisposalConfigService,
        private events: EventEmitter2,
        private domainEvents: MmDomainEventsService,
    ) {}

    async create(dto: CreateSupplierReturnDto) {
        const returnNumber = await this.generateDocNumber('RET')
        const lines = dto.lines.map((l, i) => ({
            lineNumber: i + 1,
            materialId: l.materialId,
            uomId: l.uomId,
            batchId: l.batchId ?? null,
            serialNumberId: l.serialNumberId ?? null,
            storageBinId: l.storageBinId ?? null,
            goodsReceiptLineId: l.goodsReceiptLineId ?? null,
            quantity: new Decimal(l.quantity),
            unitCost: new Decimal(l.unitCost ?? 0),
            reason: l.reason,
            stockStatus: l.stockStatus ?? 'BLOCKED',
            remarks: l.remarks ?? null,
        }))

        const estimatedValue = lines.reduce(
            (s, l) => s.plus(l.quantity.mul(l.unitCost)),
            new Decimal(0),
        )
        const totalQuantity = lines.reduce(
            (s, l) => s.plus(l.quantity),
            new Decimal(0),
        )

        const doc = await this.prisma.mmSupplierReturn.create({
            data: {
                returnNumber,
                companyId: dto.companyId,
                supplierId: dto.supplierId,
                warehouseId: dto.warehouseId,
                goodsReceiptId: dto.goodsReceiptId ?? null,
                purchaseOrderId: dto.purchaseOrderId ?? null,
                reason: dto.reason,
                remarks: dto.remarks ?? null,
                status: 'DRAFT',
                estimatedValue,
                totalQuantity,
                createdBy: dto.createdBy ?? null,
                lines: { create: lines },
            },
            include: DETAIL_INCLUDE,
        })

        await this.audit(doc.id, 'CREATED', undefined, undefined, undefined, dto.createdBy)
        return doc
    }

    async update(id: string, dto: UpdateSupplierReturnDto) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot update: status is ${doc.status}`)
        }

        const data: any = {}
        if (dto.reason) data.reason = dto.reason
        if (dto.remarks !== undefined) data.remarks = dto.remarks

        if (dto.lines) {
            await this.prisma.mmSupplierReturnLine.deleteMany({
                where: { returnId: id },
            })
            const newLines = dto.lines.map((l, i) => ({
                returnId: id,
                lineNumber: i + 1,
                materialId: l.materialId,
                uomId: l.uomId,
                batchId: l.batchId ?? null,
                serialNumberId: l.serialNumberId ?? null,
                storageBinId: l.storageBinId ?? null,
                goodsReceiptLineId: l.goodsReceiptLineId ?? null,
                quantity: new Decimal(l.quantity),
                unitCost: new Decimal(l.unitCost ?? 0),
                reason: l.reason,
                stockStatus: l.stockStatus ?? 'BLOCKED',
                remarks: l.remarks ?? null,
            }))
            await this.prisma.mmSupplierReturnLine.createMany({
                data: newLines,
            })

            data.estimatedValue = newLines.reduce(
                (s, l) => s.plus(l.quantity.mul(l.unitCost)),
                new Decimal(0),
            )
            data.totalQuantity = newLines.reduce(
                (s, l) => s.plus(l.quantity),
                new Decimal(0),
            )
        }

        return this.prisma.mmSupplierReturn.update({
            where: { id },
            data,
            include: DETAIL_INCLUDE,
        })
    }

    async submit(id: string, actor?: string) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot submit: status is ${doc.status}`)
        }

        const thresholds = await this.configService.getThresholds(doc.companyId)
        const needsApproval = this.configService.needsApproval(
            Number(doc.estimatedValue),
            Number(doc.totalQuantity),
            thresholds,
        )

        const newStatus = needsApproval ? 'PENDING_APPROVAL' : 'APPROVED'
        const updated = await this.prisma.mmSupplierReturn.update({
            where: { id },
            data: {
                status: newStatus,
                submittedBy: actor ?? null,
                submittedAt: new Date(),
                approvalThresholdSnapshot: new Decimal(thresholds.amountThreshold),
                ...(newStatus === 'APPROVED' && {
                    approvedAt: new Date(),
                }),
            },
            include: DETAIL_INCLUDE,
        })

        await this.audit(id, 'SUBMITTED', 'status', 'DRAFT', newStatus, actor)
        return updated
    }

    async approve(id: string, dto?: ActionDto) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'PENDING_APPROVAL') {
            throw new BadRequestException(`Cannot approve: status is ${doc.status}`)
        }

        const updated = await this.prisma.mmSupplierReturn.update({
            where: { id },
            data: {
                status: 'APPROVED',
                approvedBy: dto?.performedBy ?? null,
                approvedAt: new Date(),
            },
            include: DETAIL_INCLUDE,
        })

        await this.audit(id, 'APPROVED', 'status', 'PENDING_APPROVAL', 'APPROVED', dto?.performedBy)
        return updated
    }

    async reject(id: string, dto?: ActionDto) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'PENDING_APPROVAL') {
            throw new BadRequestException(`Cannot reject: status is ${doc.status}`)
        }

        const updated = await this.prisma.mmSupplierReturn.update({
            where: { id },
            data: {
                status: 'REJECTED',
                rejectedBy: dto?.performedBy ?? null,
                rejectedAt: new Date(),
            },
            include: DETAIL_INCLUDE,
        })

        await this.audit(id, 'REJECTED', 'status', 'PENDING_APPROVAL', 'REJECTED', dto?.performedBy, {
            reason: dto?.reason,
        })
        return updated
    }

    async ship(id: string, dto?: ActionDto) {
        return this.post(id, dto)
    }

    /** Canonical post: RETURN_OUT + status CLOSED (legacy SHIPPED mapped). */
    async post(id: string, dto?: ActionDto) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'APPROVED') {
            if (['SHIPPED', 'POSTED', 'CLOSED'].includes(doc.status)) {
                throw new BadRequestException('Duplicate return posting blocked')
            }
            throw new BadRequestException(`Cannot post: status is ${doc.status}`)
        }

        const claimed = await this.prisma.mmSupplierReturn.updateMany({
            where: { id, status: 'APPROVED' },
            data: {
                status: 'POSTED',
                shippedBy: dto?.performedBy ?? null,
                shippedAt: new Date(),
            },
        })
        if (claimed.count === 0) {
            throw new BadRequestException('Duplicate return posting blocked')
        }

        const now = new Date().toISOString()

        for (const line of doc.lines) {
            const txn = await this.postingService.postTransaction({
                companyId: doc.companyId,
                warehouseId: doc.warehouseId,
                storageBinId: line.storageBinId ?? undefined,
                materialId: line.materialId,
                batchId: line.batchId ?? undefined,
                serialNumberId: line.serialNumberId ?? undefined,
                stockStatus: line.stockStatus ?? 'BLOCKED',
                movementType: 'RETURN_OUT',
                quantity: Number(line.quantity),
                uomId: line.uomId,
                unitCost: Number(line.unitCost),
                postingDate: now,
                documentDate: now,
                sourceModule: 'RETURNS_DISPOSAL',
                sourceDocumentType: 'SUPPLIER_RETURN',
                sourceDocumentId: doc.id,
                sourceDocumentLineId: line.id,
                reasonCode: line.reason,
                idempotencyKey: postingKey('sup-ret', doc.id, line.id),
                createdBy: dto?.performedBy ?? undefined,
            })

            await this.prisma.mmSupplierReturnLine.update({
                where: { id: line.id },
                data: { inventoryTxnId: txn.id },
            })
        }

        void this.domainEvents.supplierReturnPosted({
            companyId: doc.companyId,
            returnId: doc.id,
            payload: {
                returnNumber: doc.returnNumber,
                supplierId: doc.supplierId,
                lines: doc.lines.map((l) => ({
                    materialId: l.materialId,
                    quantity: Number(l.quantity),
                    unitCost: Number(l.unitCost),
                })),
            },
        })

        const updated = await this.prisma.mmSupplierReturn.update({
            where: { id },
            data: {
                status: 'CLOSED',
                closedAt: new Date(),
            },
            include: DETAIL_INCLUDE,
        })

        await this.audit(id, 'POSTED', 'status', 'APPROVED', 'CLOSED', dto?.performedBy)
        return updated
    }

    async cancel(id: string, dto?: ActionDto) {
        const doc = await this.findOneOrFail(id)
        if (!['DRAFT', 'REJECTED'].includes(doc.status)) {
            throw new BadRequestException(`Cannot cancel: status is ${doc.status}`)
        }

        const updated = await this.prisma.mmSupplierReturn.update({
            where: { id },
            data: { status: 'CANCELLED' },
            include: DETAIL_INCLUDE,
        })

        await this.audit(id, 'CANCELLED', 'status', doc.status, 'CANCELLED', dto?.performedBy)
        return updated
    }

    async reverse(id: string, dto?: ActionDto) {
        const doc = await this.findOneOrFail(id)
        if (!['SHIPPED', 'POSTED', 'CLOSED'].includes(doc.status)) {
            throw new BadRequestException(`Cannot reverse: status is ${doc.status}`)
        }

        const txns = await this.prisma.mmInventoryTransaction.findMany({
            where: { sourceDocumentId: id, sourceDocumentType: 'SUPPLIER_RETURN' },
        })

        for (const txn of txns) {
            await this.postingService.reverseTransaction(txn.id, {
                reasonCode: 'REVERSAL',
                remarks: `Reversal of supplier return ${doc.returnNumber}`,
                createdBy: dto?.performedBy,
            })
        }

        await this.prisma.mmAccountingEvent.create({
            data: {
                eventType: 'SUPPLIER_RETURN_REVERSED',
                sourceModule: 'RETURNS_DISPOSAL',
                documentType: 'SUPPLIER_RETURN',
                documentId: doc.id,
                companyId: doc.companyId,
                payload: { returnNumber: doc.returnNumber },
                status: 'PENDING',
            },
        })

        this.events.emit('accounting.entry.requested', {
            sourceModule: 'RETURNS_DISPOSAL',
            documentType: 'SUPPLIER_RETURN',
            documentId: doc.id,
            companyId: doc.companyId,
            eventHint: 'REVERSAL',
        })

        const updated = await this.prisma.mmSupplierReturn.update({
            where: { id },
            data: { status: 'REVERSED' },
            include: DETAIL_INCLUDE,
        })

        await this.audit(id, 'REVERSED', 'status', doc.status, 'REVERSED', dto?.performedBy)
        return updated
    }

    async findAll(query: ReturnsQueryDto) {
        const where: any = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.warehouseId) where.warehouseId = query.warehouseId
        if (query.supplierId) where.supplierId = query.supplierId
        if (query.status) where.status = query.status
        if (query.reason) where.reason = query.reason
        if (query.search) {
            where.returnNumber = { contains: query.search, mode: 'insensitive' }
        }

        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20

        const [data, total] = await Promise.all([
            this.prisma.mmSupplierReturn.findMany({
                where,
                include: {
                    lines: { include: LINE_INCLUDE },
                    supplier: true,
                    warehouse: true,
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmSupplierReturn.count({ where }),
        ])

        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        return this.findOneOrFail(id)
    }

    private async findOneOrFail(id: string) {
        const doc = await this.prisma.mmSupplierReturn.findUnique({
            where: { id },
            include: DETAIL_INCLUDE,
        })
        if (!doc) throw new NotFoundException('Supplier return not found')
        return doc
    }

    private async audit(
        returnId: string,
        action: string,
        field?: string,
        oldValue?: string,
        newValue?: string,
        performedBy?: string,
        details?: any,
    ) {
        await this.prisma.mmSupplierReturnAudit.create({
            data: {
                returnId,
                action,
                field: field ?? null,
                oldValue: oldValue ?? null,
                newValue: newValue ?? null,
                performedBy: performedBy ?? null,
                details: details ?? undefined,
            },
        })
    }

    private async generateDocNumber(prefix: string): Promise<string> {
        const today = new Date()
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `${prefix}-${dateStr}-`
        const last = await this.prisma.mmSupplierReturn.findFirst({
            where: { returnNumber: { startsWith: pfx } },
            orderBy: { returnNumber: 'desc' },
        })
        let seq = 1
        if (last) {
            const lastSeq = parseInt(last.returnNumber.replace(pfx, ''), 10)
            if (!isNaN(lastSeq)) seq = lastSeq + 1
        }
        return `${pfx}${String(seq).padStart(5, '0')}`
    }
}
