import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PrismaService } from '../../prisma/prisma.service'
import { InventoryPostingService } from '../inventory/inventory-posting.service'
import { PutawayService } from '../warehouse/putaway/putaway.service'
import { QualityDecideDto, InboundQueryDto } from './dto/inbound.dto'
import { Decimal } from '@prisma/client/runtime/library'

const QI_INCLUDES = {
    lines: {
        include: {
            goodsReceiptLine: {
                include: {
                    material: { select: { id: true, materialCode: true, materialName: true } },
                    uom: { select: { id: true, code: true } },
                },
            },
        },
    },
    goodsReceipt: {
        select: {
            id: true,
            documentNumber: true,
            companyId: true,
            warehouseId: true,
            postingDate: true,
            documentDate: true,
        },
    },
}

@Injectable()
export class QualityInspectionService {
    constructor(
        private prisma: PrismaService,
        private posting: InventoryPostingService,
        private putaway: PutawayService,
        private events: EventEmitter2,
    ) {}

    async list(query: InboundQueryDto) {
        const where: any = {}
        if (query.status) where.status = query.status
        if (query.companyId) where.companyId = query.companyId
        if (query.search) {
            where.OR = [
                { inspectionNumber: { contains: query.search, mode: 'insensitive' } },
            ]
        }
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20
        const [data, total] = await Promise.all([
            this.prisma.mmQualityInspection.findMany({
                where,
                include: QI_INCLUDES,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmQualityInspection.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        const qi = await this.prisma.mmQualityInspection.findUnique({
            where: { id },
            include: QI_INCLUDES,
        })
        if (!qi) throw new NotFoundException('Quality inspection not found')
        return qi
    }

    async decide(id: string, dto: QualityDecideDto) {
        const qi = await this.findOne(id)
        if (qi.status !== 'PENDING') {
            throw new BadRequestException(`Cannot decide QI in status ${qi.status}`)
        }
        if (!dto.lines?.length) throw new BadRequestException('Decision lines required')

        const gr = await this.prisma.mmGoodsReceipt.findUnique({
            where: { id: qi.goodsReceiptId },
            include: { lines: { include: { material: true, uom: true } } },
        })
        if (!gr) throw new NotFoundException('Linked goods receipt not found')

        const lineMap = new Map(qi.lines.map((l) => [l.id, l]))
        let totalPass = 0
        let totalFail = 0
        let totalQty = 0

        for (const d of dto.lines) {
            const qiLine = lineMap.get(d.lineId)
            if (!qiLine) throw new BadRequestException(`QI line ${d.lineId} not found`)
            const qty = Number(qiLine.quantity)
            const pass = Number(d.passQuantity)
            const fail = Number(d.failQuantity)
            if (pass + fail > qty + 1e-9) {
                throw new BadRequestException(
                    `Pass+fail (${pass + fail}) exceeds inspected qty ${qty}`,
                )
            }
            totalPass += pass
            totalFail += fail
            totalQty += qty

            let result = 'PASS'
            if (fail > 0 && pass > 0) result = 'PARTIAL_PASS'
            else if (fail > 0 && pass === 0) result = 'FAIL'

            await this.prisma.mmQualityInspectionLine.update({
                where: { id: d.lineId },
                data: {
                    passQuantity: new Decimal(pass),
                    failQuantity: new Decimal(fail),
                    result,
                    remarks: d.remarks ?? null,
                },
            })

            const grLine = gr.lines.find((l) => l.id === qiLine.goodsReceiptLineId)
            if (!grLine) continue

            const postingDate = gr.postingDate.toISOString()
            const documentDate = gr.documentDate.toISOString()

            // Move PASS qty: QI → UNRESTRICTED
            if (pass > 0) {
                await this.posting.postTransaction({
                    companyId: gr.companyId,
                    warehouseId: gr.warehouseId,
                    storageBinId: grLine.storageBinId ?? undefined,
                    materialId: grLine.materialId,
                    batchId: grLine.batchId ?? undefined,
                    serialNumberId: grLine.serialNumberId ?? undefined,
                    stockStatus: 'QUALITY_INSPECTION',
                    movementType: 'TRANSFER_OUT',
                    quantity: pass,
                    uomId: grLine.uomId,
                    unitCost: Number(grLine.unitCost),
                    postingDate,
                    documentDate,
                    sourceModule: 'QUALITY',
                    sourceDocumentType: 'QUALITY_INSPECTION',
                    sourceDocumentId: qi.id,
                    sourceDocumentLineId: d.lineId,
                    createdBy: dto.inspectedBy,
                })
                await this.posting.postTransaction({
                    companyId: gr.companyId,
                    warehouseId: gr.warehouseId,
                    storageBinId: grLine.storageBinId ?? undefined,
                    materialId: grLine.materialId,
                    batchId: grLine.batchId ?? undefined,
                    serialNumberId: grLine.serialNumberId ?? undefined,
                    stockStatus: 'UNRESTRICTED',
                    movementType: 'TRANSFER_IN',
                    quantity: pass,
                    uomId: grLine.uomId,
                    unitCost: Number(grLine.unitCost),
                    postingDate,
                    documentDate,
                    sourceModule: 'QUALITY',
                    sourceDocumentType: 'QUALITY_INSPECTION',
                    sourceDocumentId: qi.id,
                    sourceDocumentLineId: d.lineId,
                    createdBy: dto.inspectedBy,
                })

                await this.putaway.createFromGoodsReceiptLine({
                    companyId: gr.companyId,
                    warehouseId: gr.warehouseId,
                    goodsReceiptId: gr.id,
                    goodsReceiptLineId: grLine.id,
                    materialId: grLine.materialId,
                    quantity: pass,
                    uomId: grLine.uomId,
                    batchId: grLine.batchId ?? undefined,
                    serialId: grLine.serialNumberId ?? undefined,
                    stockStatus: 'UNRESTRICTED',
                    sourceBinId: grLine.storageBinId ?? undefined,
                    sourceDocument: gr.documentNumber,
                })
            }

            // Move FAIL qty: QI → BLOCKED
            if (fail > 0) {
                await this.posting.postTransaction({
                    companyId: gr.companyId,
                    warehouseId: gr.warehouseId,
                    storageBinId: grLine.storageBinId ?? undefined,
                    materialId: grLine.materialId,
                    batchId: grLine.batchId ?? undefined,
                    serialNumberId: grLine.serialNumberId ?? undefined,
                    stockStatus: 'QUALITY_INSPECTION',
                    movementType: 'TRANSFER_OUT',
                    quantity: fail,
                    uomId: grLine.uomId,
                    unitCost: Number(grLine.unitCost),
                    postingDate,
                    documentDate,
                    sourceModule: 'QUALITY',
                    sourceDocumentType: 'QUALITY_INSPECTION',
                    sourceDocumentId: qi.id,
                    sourceDocumentLineId: d.lineId,
                    createdBy: dto.inspectedBy,
                })
                await this.posting.postTransaction({
                    companyId: gr.companyId,
                    warehouseId: gr.warehouseId,
                    storageBinId: grLine.storageBinId ?? undefined,
                    materialId: grLine.materialId,
                    batchId: grLine.batchId ?? undefined,
                    serialNumberId: grLine.serialNumberId ?? undefined,
                    stockStatus: 'BLOCKED',
                    movementType: 'TRANSFER_IN',
                    quantity: fail,
                    uomId: grLine.uomId,
                    unitCost: Number(grLine.unitCost),
                    postingDate,
                    documentDate,
                    sourceModule: 'QUALITY',
                    sourceDocumentType: 'QUALITY_INSPECTION',
                    sourceDocumentId: qi.id,
                    sourceDocumentLineId: d.lineId,
                    createdBy: dto.inspectedBy,
                })
            }
        }

        let overall = 'PASS'
        if (totalFail > 0 && totalPass > 0) overall = 'PARTIAL_PASS'
        else if (totalFail > 0 && totalPass === 0) overall = 'FAIL'

        const updated = await this.prisma.mmQualityInspection.update({
            where: { id },
            data: {
                status: 'COMPLETED',
                result: overall,
                inspectedBy: dto.inspectedBy ?? null,
                inspectedAt: new Date(),
                remarks: dto.remarks ?? null,
            },
            include: QI_INCLUDES,
        })

        this.events.emit('quality.inspection.completed', {
            inspectionId: id,
            result: overall,
            passQuantity: totalPass,
            failQuantity: totalFail,
            totalQuantity: totalQty,
            /** PARTIAL_PASS: pass qty → UNRESTRICTED (+ putaway); fail qty → BLOCKED */
            statusSplit:
                overall === 'PARTIAL_PASS'
                    ? { unrestrictedQty: totalPass, blockedQty: totalFail }
                    : overall === 'PASS'
                      ? { unrestrictedQty: totalPass, blockedQty: 0 }
                      : { unrestrictedQty: 0, blockedQty: totalFail },
        })

        return updated
    }

    async createFromGoodsReceipt(grId: string, qiLines: Array<{
        goodsReceiptLineId: string
        materialId: string
        quantity: number
    }>) {
        if (!qiLines.length) return null
        const gr = await this.prisma.mmGoodsReceipt.findUnique({ where: { id: grId } })
        if (!gr) return null

        const inspectionNumber = await this.nextNumber()
        return this.prisma.mmQualityInspection.create({
            data: {
                inspectionNumber,
                companyId: gr.companyId,
                goodsReceiptId: grId,
                warehouseId: gr.warehouseId,
                status: 'PENDING',
                lines: {
                    create: qiLines.map((l) => ({
                        goodsReceiptLineId: l.goodsReceiptLineId,
                        materialId: l.materialId,
                        quantity: new Decimal(l.quantity),
                    })),
                },
            },
            include: QI_INCLUDES,
        })
    }

    private async nextNumber() {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `QI-${today}-`
        const last = await this.prisma.mmQualityInspection.findFirst({
            where: { inspectionNumber: { startsWith: pfx } },
            orderBy: { inspectionNumber: 'desc' },
        })
        let seq = 1
        if (last) {
            const n = parseInt(last.inspectionNumber.replace(pfx, ''), 10)
            if (!isNaN(n)) seq = n + 1
        }
        return `${pfx}${String(seq).padStart(5, '0')}`
    }
}
