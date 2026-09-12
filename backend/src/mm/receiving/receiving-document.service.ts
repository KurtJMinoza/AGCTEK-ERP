import {
    Injectable,
    BadRequestException,
    NotFoundException,
    Inject,
    forwardRef,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { GoodsReceiptService } from '../stock-ops/goods-receipt.service'
import { ReceivingVarianceService } from './receiving-variance.service'
import { InspectionRequirementService } from './inspection-requirement.service'
import { MmDomainEventsService } from '../common/mm-domain-events.service'
import { MM_DOMAIN_EVENTS } from '../common/mm-domain-events.types'
import {
    CreateReceivingDocumentDto,
    ReceivingActionDto,
    ReceivingQueryDto,
} from './dto/receiving.dto'
import { Decimal } from '@prisma/client/runtime/library'
import { DetectedVariance } from './receiving-variance.util'

const DOC_INCLUDES = {
    lines: {
        include: {
            material: { select: { id: true, materialCode: true, materialName: true } },
            uom: { select: { id: true, code: true } },
        },
        orderBy: { lineNumber: 'asc' as const },
    },
    variances: true,
    expectedReceipt: { select: { id: true, documentNumber: true, status: true } },
    goodsReceipt: { select: { id: true, documentNumber: true, status: true } },
}

@Injectable()
export class ReceivingDocumentService {
    constructor(
        private prisma: PrismaService,
        @Inject(forwardRef(() => GoodsReceiptService))
        private goodsReceiptService: GoodsReceiptService,
        private varianceService: ReceivingVarianceService,
        private inspectionRequirement: InspectionRequirementService,
        private domainEvents: MmDomainEventsService,
    ) {}

    async create(dto: CreateReceivingDocumentDto) {
        const doc = await this.createDraft(dto)
        if (dto.autoPost) {
            await this.validate(doc.id, { performedBy: dto.createdBy })
            return this.post(doc.id, { performedBy: dto.createdBy })
        }
        return doc
    }

    /** Alias for inbound compat — creates receiving doc; autoPost creates+posts GR like legacy flow */
    async createFromEr(dto: CreateReceivingDocumentDto) {
        return this.create(dto)
    }

    async createDraft(dto: CreateReceivingDocumentDto) {
        const er = await this.prisma.mmExpectedReceipt.findUnique({
            where: { id: dto.expectedReceiptId },
            include: { lines: { include: { material: true } } },
        })
        if (!er) throw new NotFoundException('Expected receipt not found')
        if (['CLOSED', 'CANCELLED'].includes(er.status)) {
            throw new BadRequestException(`Cannot receive against ${er.status} expected receipt`)
        }
        if (!dto.lines?.length) throw new BadRequestException('At least one line is required')

        const lineMap = new Map(er.lines.map((l) => [l.id, l]))
        const documentNumber = await this.nextDocNumber()
        const receivingLines: any[] = []

        for (let i = 0; i < dto.lines.length; i++) {
            const recv = dto.lines[i]
            const erLine = lineMap.get(recv.expectedReceiptLineId)
            if (!erLine) {
                throw new BadRequestException(`Expected receipt line ${recv.expectedReceiptLineId} not found`)
            }
            if (recv.uomId && recv.uomId !== erLine.uomId) {
                // UOM mismatch allowed but flagged at validate
            }
            const received = Number(recv.receivedQuantity)
            if (received <= 0) throw new BadRequestException('Received quantity must be greater than zero')

            receivingLines.push({
                lineNumber: i + 1,
                expectedReceiptLineId: recv.expectedReceiptLineId,
                materialId: erLine.materialId,
                receivedQuantity: new Decimal(received),
                damagedQuantity: new Decimal(recv.damagedQuantity ?? 0),
                rejectedQuantity: new Decimal(recv.rejectedQuantity ?? 0),
                uomId: recv.uomId ?? erLine.uomId,
                storageBinId: recv.storageBinId ?? null,
                batchId: recv.batchId ?? null,
                serialNumberId: recv.serialNumberId ?? null,
                unitCost: new Decimal(recv.unitCost ?? 0),
                barcode: recv.barcode ?? null,
                remarks: recv.materialId && recv.materialId !== erLine.materialId
                    ? `Override material scan: ${recv.materialId}`
                    : null,
            })
        }

        const doc = await this.prisma.mmReceivingDocument.create({
            data: {
                documentNumber,
                companyId: er.companyId,
                expectedReceiptId: er.id,
                warehouseId: er.warehouseId,
                purchaseOrderId: er.purchaseOrderId,
                asnId: er.asnId,
                supplierId: er.supplierId,
                status: 'DRAFT',
                receiverId: dto.receiverId ?? null,
                postingDate: dto.postingDate ? new Date(dto.postingDate) : null,
                documentDate: dto.documentDate ? new Date(dto.documentDate) : null,
                createdBy: dto.createdBy ?? null,
                lines: { create: receivingLines },
            },
            include: DOC_INCLUDES,
        })

        if (er.status === 'OPEN') {
            await this.prisma.mmExpectedReceipt.update({
                where: { id: er.id },
                data: { status: 'IN_PROGRESS' },
            })
        }

        return doc
    }

    async findOne(id: string) {
        const doc = await this.prisma.mmReceivingDocument.findUnique({
            where: { id },
            include: DOC_INCLUDES,
        })
        if (!doc) throw new NotFoundException('Receiving document not found')
        return doc
    }

    async findAll(query: ReceivingQueryDto) {
        const where: any = {}
        if (query.status) where.status = query.status
        if (query.companyId) where.companyId = query.companyId
        if (query.expectedReceiptId) where.expectedReceiptId = query.expectedReceiptId
        if (query.search) {
            where.OR = [
                { documentNumber: { contains: query.search, mode: 'insensitive' } },
            ]
        }
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20
        const [data, total] = await Promise.all([
            this.prisma.mmReceivingDocument.findMany({
                where,
                include: DOC_INCLUDES,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmReceivingDocument.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async validate(id: string, dto?: ReceivingActionDto) {
        const doc = await this.findOne(id)
        if (doc.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot validate receiving document in status ${doc.status}`)
        }

        const er = await this.prisma.mmExpectedReceipt.findUnique({
            where: { id: doc.expectedReceiptId },
            include: { lines: { include: { material: true } } },
        })
        if (!er) throw new NotFoundException('Expected receipt not found')

        const erLineMap = new Map(er.lines.map((l) => [l.id, l]))
        await this.prisma.mmReceivingVariance.deleteMany({ where: { receivingDocumentId: id } })

        for (const line of doc.lines) {
            const erLine = erLineMap.get(line.expectedReceiptLineId)!
            const variances: DetectedVariance[] = await this.varianceService.detectLineVariances({
                expectedReceiptLineId: line.expectedReceiptLineId,
                materialId: line.materialId,
                uomId: line.uomId,
                expectedQuantity: Number(erLine.expectedQuantity),
                alreadyReceived: Number(erLine.receivedQuantity),
                receivedQuantity: Number(line.receivedQuantity),
                damagedQuantity: Number(line.damagedQuantity),
                rejectedQuantity: Number(line.rejectedQuantity),
                batchId: line.batchId ?? undefined,
                serialNumberId: line.serialNumberId ?? undefined,
                barcode: line.barcode ?? undefined,
                overrideMaterialId: line.remarks?.includes('Override') ? line.materialId : undefined,
                material: {
                    materialCode: erLine.material?.materialCode ?? undefined,
                    batchManaged: erLine.material?.batchManaged ?? false,
                    serialManaged: erLine.material?.serialManaged ?? false,
                },
            })

            if (line.uomId !== erLine.uomId) {
                variances.push({
                    varianceType: 'UOM_MISMATCH',
                    quantity: Number(line.receivedQuantity),
                    description: `Received UOM ${line.uomId} differs from expected ${erLine.uomId}`,
                })
            }

            await this.varianceService.persistVariances(id, line.id, variances)
        }

        const updated = await this.prisma.mmReceivingDocument.update({
            where: { id },
            data: {
                status: 'VALIDATED',
                validatedAt: new Date(),
                validatedBy: dto?.performedBy ?? null,
            },
            include: DOC_INCLUDES,
        })

        void this.domainEvents.emit({
            eventType: MM_DOMAIN_EVENTS.RECEIVING_VALIDATED,
            companyId: doc.companyId,
            sourceModule: 'INBOUND',
            documentType: 'RECEIVING_DOCUMENT',
            documentId: id,
            occurredAt: new Date().toISOString(),
            payload: { varianceCount: updated.variances.length },
        })

        return updated
    }

    async post(id: string, dto?: ReceivingActionDto) {
        let doc = await this.findOne(id)
        if (doc.status === 'DRAFT') {
            doc = await this.validate(id, dto)
        }
        if (doc.status !== 'VALIDATED') {
            throw new BadRequestException(`Cannot post receiving document in status ${doc.status}`)
        }
        if (doc.goodsReceiptId) {
            throw new BadRequestException('Receiving document already posted')
        }

        const er = await this.prisma.mmExpectedReceipt.findUnique({
            where: { id: doc.expectedReceiptId },
            include: { lines: { include: { material: true } } },
        })
        if (!er) throw new NotFoundException('Expected receipt not found')

        const erLineMap = new Map(er.lines.map((l) => [l.id, l]))
        const varianceMap = new Map<string, typeof doc.variances>()
        for (const v of doc.variances) {
            const key = v.receivingLineId ?? '_'
            if (!varianceMap.has(key)) varianceMap.set(key, [])
            varianceMap.get(key)!.push(v)
        }

        const today = new Date().toISOString()
        const grLines: any[] = []

        for (const line of doc.lines) {
            const erLine = erLineMap.get(line.expectedReceiptLineId)!
            const remaining = Math.max(0, Number(erLine.expectedQuantity) - Number(erLine.receivedQuantity))
            const received = Number(line.receivedQuantity)
            const damaged = Number(line.damagedQuantity)
            const rejected = Number(line.rejectedQuantity)
            const shortage = Math.max(0, remaining - received)
            const overage = Math.max(0, received - remaining)

            const lineVariances = varianceMap.get(line.id) ?? []
            const detected = lineVariances.map((v) => ({
                varianceType: v.varianceType as any,
                quantity: Number(v.quantity),
                description: v.description ?? '',
            }))
            const discrepancyFlag = this.varianceService.flagsFromVariances(detected)
            const wrongIdentity = discrepancyFlag?.includes('WRONG_')

            const needsQi = await this.inspectionRequirement.isInspectionRequired({
                materialId: line.materialId,
                supplierId: doc.supplierId,
                warehouseId: doc.warehouseId,
            })
            const goodQty = Math.max(0, received - damaged - rejected)

            grLines.push({
                materialId: line.materialId,
                quantity: received,
                expectedQuantity: remaining,
                shortageQuantity: shortage,
                overageQuantity: overage,
                damagedQuantity: damaged,
                rejectedQuantity: rejected,
                uomId: line.uomId,
                storageBinId: line.storageBinId ?? undefined,
                batchId: wrongIdentity ? undefined : line.batchId ?? undefined,
                serialNumberId: wrongIdentity ? undefined : line.serialNumberId ?? undefined,
                unitCost: Number(line.unitCost),
                purchaseOrderLineId: erLine.purchaseOrderLineId ?? undefined,
                expectedReceiptLineId: erLine.id,
                discrepancyFlag,
                stockStatus: goodQty > 0 && needsQi ? 'QUALITY_INSPECTION' : undefined,
                remarks: line.remarks ?? undefined,
            })
        }

        const gr = await this.goodsReceiptService.create({
            companyId: doc.companyId,
            warehouseId: doc.warehouseId,
            purchaseOrderId: doc.purchaseOrderId ?? undefined,
            expectedReceiptId: doc.expectedReceiptId,
            asnId: doc.asnId ?? undefined,
            supplierId: doc.supplierId ?? undefined,
            receiverId: doc.receiverId ?? undefined,
            postingDate: (doc.postingDate ?? new Date()).toISOString().slice(0, 10),
            documentDate: (doc.documentDate ?? new Date()).toISOString().slice(0, 10),
            createdBy: dto?.performedBy ?? doc.createdBy ?? undefined,
            lines: grLines,
        } as any)

        await this.prisma.mmGoodsReceipt.update({
            where: { id: gr.id },
            data: { receivingDocumentId: id },
        })

        const posted = await this.goodsReceiptService.post(gr.id)

        const updated = await this.prisma.mmReceivingDocument.update({
            where: { id },
            data: {
                status: 'POSTED',
                postedAt: new Date(),
                postedBy: dto?.performedBy ?? null,
                goodsReceiptId: gr.id,
            },
            include: DOC_INCLUDES,
        })

        void this.domainEvents.emit({
            eventType: MM_DOMAIN_EVENTS.RECEIVING_POSTED,
            companyId: doc.companyId,
            sourceModule: 'INBOUND',
            documentType: 'RECEIVING_DOCUMENT',
            documentId: id,
            occurredAt: new Date().toISOString(),
            payload: { goodsReceiptId: gr.id, goodsReceiptNumber: posted.documentNumber },
        })

        return { receivingDocument: updated, goodsReceipt: posted }
    }

    async cancel(id: string, dto?: ReceivingActionDto) {
        const doc = await this.findOne(id)
        if (!['DRAFT', 'VALIDATED'].includes(doc.status)) {
            throw new BadRequestException(`Cannot cancel receiving document in status ${doc.status}`)
        }
        return this.prisma.mmReceivingDocument.update({
            where: { id },
            data: { status: 'CANCELLED' },
            include: DOC_INCLUDES,
        })
    }

    private async nextDocNumber() {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `RCV-${today}-`
        const last = await this.prisma.mmReceivingDocument.findFirst({
            where: { documentNumber: { startsWith: pfx } },
            orderBy: { documentNumber: 'desc' },
        })
        let seq = 1
        if (last) {
            const n = parseInt(last.documentNumber.replace(pfx, ''), 10)
            if (!isNaN(n)) seq = n + 1
        }
        return `${pfx}${String(seq).padStart(5, '0')}`
    }
}
