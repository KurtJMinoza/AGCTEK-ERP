import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PrismaService } from '../../prisma/prisma.service'
import { InventoryPostingService } from '../inventory/inventory-posting.service'
import { postingKey } from '../common/idempotency.util'
import { ReturnsDisposalConfigService } from './returns-disposal-config.service'
import {
    CreateDisposalDto,
    UpdateDisposalDto,
    DisposalQueryDto,
    ActionDto,
} from './dto/returns-disposal.dto'
import { Decimal } from '@prisma/client/runtime/library'

const LINE_INCLUDE = {
    material: true,
}

const DETAIL_INCLUDE = {
    lines: { include: LINE_INCLUDE },
    warehouse: true,
    audits: { orderBy: { performedAt: 'desc' as const } },
}

@Injectable()
export class DisposalService {
    constructor(
        private prisma: PrismaService,
        private postingService: InventoryPostingService,
        private configService: ReturnsDisposalConfigService,
        private events: EventEmitter2,
    ) {}

    async create(dto: CreateDisposalDto) {
        if (!dto.lines?.length) {
            throw new BadRequestException('At least one disposal line is required')
        }
        if (!dto.reason) {
            throw new BadRequestException('Disposal reason is required')
        }
        if (!dto.warehouseId || !dto.companyId) {
            throw new BadRequestException('Company and warehouse are required')
        }

        await this.assertControlledLines(dto.lines)

        const disposalNumber = await this.generateDocNumber(
            dto.disposalType === 'SCRAP' ? 'SCR' : 'DSP',
        )
        const lines = dto.lines.map((l, i) => ({
            lineNumber: i + 1,
            materialId: l.materialId,
            uomId: l.uomId,
            batchId: l.batchId ?? null,
            serialNumberId: l.serialNumberId ?? null,
            storageBinId: l.storageBinId ?? null,
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
        if (estimatedValue.lte(0)) {
            throw new BadRequestException(
                'Disposal value (qty × unit cost) must be greater than zero',
            )
        }
        const totalQuantity = lines.reduce(
            (s, l) => s.plus(l.quantity),
            new Decimal(0),
        )

        const doc = await this.prisma.mmDisposal.create({
            data: {
                disposalNumber,
                companyId: dto.companyId,
                warehouseId: dto.warehouseId,
                disposalType: dto.disposalType,
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

    async update(id: string, dto: UpdateDisposalDto) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot update: status is ${doc.status}`)
        }

        const data: any = {}
        if (dto.reason) data.reason = dto.reason
        if (dto.remarks !== undefined) data.remarks = dto.remarks

        if (dto.lines) {
            await this.prisma.mmDisposalLine.deleteMany({
                where: { disposalId: id },
            })
            const newLines = dto.lines.map((l, i) => ({
                disposalId: id,
                lineNumber: i + 1,
                materialId: l.materialId,
                uomId: l.uomId,
                batchId: l.batchId ?? null,
                serialNumberId: l.serialNumberId ?? null,
                storageBinId: l.storageBinId ?? null,
                quantity: new Decimal(l.quantity),
                unitCost: new Decimal(l.unitCost ?? 0),
                reason: l.reason,
                stockStatus: l.stockStatus ?? 'BLOCKED',
                remarks: l.remarks ?? null,
            }))
            await this.prisma.mmDisposalLine.createMany({ data: newLines })
            data.estimatedValue = newLines.reduce(
                (s, l) => s.plus(l.quantity.mul(l.unitCost)),
                new Decimal(0),
            )
            data.totalQuantity = newLines.reduce(
                (s, l) => s.plus(l.quantity),
                new Decimal(0),
            )
        }

        return this.prisma.mmDisposal.update({
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
        const updated = await this.prisma.mmDisposal.update({
            where: { id },
            data: {
                status: newStatus,
                submittedBy: actor ?? null,
                submittedAt: new Date(),
                approvalThresholdSnapshot: new Decimal(thresholds.amountThreshold),
                ...(newStatus === 'APPROVED' && { approvedAt: new Date() }),
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

        const updated = await this.prisma.mmDisposal.update({
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

        const updated = await this.prisma.mmDisposal.update({
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

    async post(id: string, dto?: ActionDto) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'APPROVED') {
            if (['POSTED', 'CLOSED'].includes(doc.status)) {
                throw new BadRequestException('Duplicate disposal posting blocked')
            }
            throw new BadRequestException(`Cannot post: status is ${doc.status}`)
        }

        const claimed = await this.prisma.mmDisposal.updateMany({
            where: { id, status: 'APPROVED' },
            data: {
                status: 'POSTED',
                postedBy: dto?.performedBy ?? null,
                postedAt: new Date(),
            },
        })
        if (claimed.count === 0) {
            throw new BadRequestException('Duplicate disposal posting blocked')
        }

        const now = new Date().toISOString()
        const txnIds: string[] = []

        for (const line of doc.lines) {
            const txn = await this.postingService.postTransaction({
                companyId: doc.companyId,
                warehouseId: doc.warehouseId,
                storageBinId: line.storageBinId ?? undefined,
                materialId: line.materialId,
                batchId: line.batchId ?? undefined,
                serialNumberId: line.serialNumberId ?? undefined,
                stockStatus: line.stockStatus ?? 'BLOCKED',
                movementType: 'SCRAP',
                quantity: Number(line.quantity),
                uomId: line.uomId,
                unitCost: Number(line.unitCost),
                postingDate: now,
                documentDate: now,
                sourceModule: 'RETURNS_DISPOSAL',
                sourceDocumentType: 'DISPOSAL',
                sourceDocumentId: doc.id,
                sourceDocumentLineId: line.id,
                reasonCode: line.reason,
                createdBy: dto?.performedBy ?? undefined,
                idempotencyKey: postingKey('disposal', doc.id, line.id),
            })

            txnIds.push(txn.id)
            await this.prisma.mmDisposalLine.update({
                where: { id: line.id },
                data: { inventoryTxnId: txn.id },
            })
        }

        const scrapNumber = `SCP-${doc.disposalNumber}`
        await this.prisma.mmScrapTransaction.upsert({
            where: { legacyDisposalId: id },
            create: {
                scrapNumber,
                companyId: doc.companyId,
                warehouseId: doc.warehouseId,
                legacyDisposalId: id,
                postedBy: dto?.performedBy ?? null,
                idempotencyKey: postingKey('scrap-doc', id),
                inventoryTxnIds: txnIds,
            },
            update: {
                inventoryTxnIds: txnIds,
                postedBy: dto?.performedBy ?? null,
                postedAt: new Date(),
            },
        })

        await this.prisma.mmAccountingEvent.create({
            data: {
                eventType: 'DISPOSAL_POSTED',
                sourceModule: 'RETURNS_DISPOSAL',
                documentType: 'DISPOSAL',
                documentId: doc.id,
                companyId: doc.companyId,
                payload: {
                    disposalNumber: doc.disposalNumber,
                    disposalType: doc.disposalType,
                    lines: doc.lines.map((l) => ({
                        materialId: l.materialId,
                        quantity: Number(l.quantity),
                        unitCost: Number(l.unitCost),
                    })),
                },
                status: 'PENDING',
            },
        })

        this.events.emit('accounting.entry.requested', {
            sourceModule: 'RETURNS_DISPOSAL',
            documentType: 'DISPOSAL',
            documentId: doc.id,
            companyId: doc.companyId,
        })

        const updated = await this.prisma.mmDisposal.update({
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

        const updated = await this.prisma.mmDisposal.update({
            where: { id },
            data: { status: 'CANCELLED' },
            include: DETAIL_INCLUDE,
        })

        await this.audit(id, 'CANCELLED', 'status', doc.status, 'CANCELLED', dto?.performedBy)
        return updated
    }

    async reverse(id: string, dto?: ActionDto) {
        const doc = await this.findOneOrFail(id)
        if (!['POSTED', 'CLOSED'].includes(doc.status)) {
            throw new BadRequestException(`Cannot reverse: status is ${doc.status}`)
        }

        const txns = await this.prisma.mmInventoryTransaction.findMany({
            where: { sourceDocumentId: id, sourceDocumentType: 'DISPOSAL' },
        })

        for (const txn of txns) {
            await this.postingService.reverseTransaction(txn.id, {
                reasonCode: 'REVERSAL',
                remarks: `Reversal of disposal ${doc.disposalNumber}`,
                createdBy: dto?.performedBy,
            })
        }

        await this.prisma.mmAccountingEvent.create({
            data: {
                eventType: 'DISPOSAL_REVERSED',
                sourceModule: 'RETURNS_DISPOSAL',
                documentType: 'DISPOSAL',
                documentId: doc.id,
                companyId: doc.companyId,
                payload: { disposalNumber: doc.disposalNumber },
                status: 'PENDING',
            },
        })

        this.events.emit('accounting.entry.requested', {
            sourceModule: 'RETURNS_DISPOSAL',
            documentType: 'DISPOSAL',
            documentId: doc.id,
            companyId: doc.companyId,
            eventHint: 'REVERSAL',
        })

        const updated = await this.prisma.mmDisposal.update({
            where: { id },
            data: { status: 'REVERSED' },
            include: DETAIL_INCLUDE,
        })

        await this.audit(id, 'REVERSED', 'status', 'POSTED', 'REVERSED', dto?.performedBy)
        return updated
    }

    async findAll(query: DisposalQueryDto) {
        const where: any = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.warehouseId) where.warehouseId = query.warehouseId
        if (query.disposalType) where.disposalType = query.disposalType
        if (query.status) where.status = query.status
        if (query.reason) where.reason = query.reason
        if (query.search) {
            where.disposalNumber = { contains: query.search, mode: 'insensitive' }
        }

        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20

        const [data, total] = await Promise.all([
            this.prisma.mmDisposal.findMany({
                where,
                include: {
                    lines: { include: LINE_INCLUDE },
                    warehouse: true,
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmDisposal.count({ where }),
        ])

        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        return this.findOneOrFail(id)
    }

    private async findOneOrFail(id: string) {
        const doc = await this.prisma.mmDisposal.findUnique({
            where: { id },
            include: DETAIL_INCLUDE,
        })
        if (!doc) throw new NotFoundException('Disposal not found')
        return doc
    }

    private async assertControlledLines(
        lines: Array<{
            materialId: string
            batchId?: string
            serialNumberId?: string
            quantity: number
            unitCost?: number
            reason: string
        }>,
    ) {
        const materials = await this.prisma.mmMaterial.findMany({
            where: { id: { in: lines.map((l) => l.materialId) } },
            select: { id: true, batchManaged: true, serialManaged: true },
        })
        const byId = new Map(materials.map((m) => [m.id, m]))
        for (const l of lines) {
            if (!l.materialId) {
                throw new BadRequestException('Material is required on each line')
            }
            if (!l.reason) {
                throw new BadRequestException('Reason is required on each line')
            }
            if (!(l.quantity > 0)) {
                throw new BadRequestException('Quantity must be positive')
            }
            const m = byId.get(l.materialId)
            if (!m) throw new BadRequestException(`Material ${l.materialId} not found`)
            if (m.batchManaged && !l.batchId) {
                throw new BadRequestException('Batch required for batch-managed material')
            }
            if (m.serialManaged && !l.serialNumberId) {
                throw new BadRequestException('Serial required for serial-managed material')
            }
        }
    }

    private async audit(
        disposalId: string,
        action: string,
        field?: string,
        oldValue?: string,
        newValue?: string,
        performedBy?: string,
        details?: any,
    ) {
        await this.prisma.mmDisposalAudit.create({
            data: {
                disposalId,
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
        const last = await this.prisma.mmDisposal.findFirst({
            where: { disposalNumber: { startsWith: pfx } },
            orderBy: { disposalNumber: 'desc' },
        })
        let seq = 1
        if (last) {
            const lastSeq = parseInt(last.disposalNumber.replace(pfx, ''), 10)
            if (!isNaN(lastSeq)) seq = lastSeq + 1
        }
        return `${pfx}${String(seq).padStart(5, '0')}`
    }
}
