import {
    Injectable,
    BadRequestException,
    NotFoundException,
    Inject,
    forwardRef,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PrismaService } from '../../prisma/prisma.service'
import { InventoryPostingService } from '../inventory/inventory-posting.service'
import { postingKey } from '../common/idempotency.util'
import { MmDomainEventsService } from '../common/mm-domain-events.service'
import { QualityInspectionService } from '../inbound/quality-inspection.service'
import { InspectionLotService } from '../receiving/inspection-lot.service'
import { InspectionRequirementService } from '../receiving/inspection-requirement.service'
import { PutawayService } from '../warehouse/putaway/putaway.service'
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto'
import { StockOpsQueryDto } from './dto/stock-ops-query.dto'
import { Decimal } from '@prisma/client/runtime/library'

@Injectable()
export class GoodsReceiptService {
    constructor(
        private prisma: PrismaService,
        private postingService: InventoryPostingService,
        private events: EventEmitter2,
        private domainEvents: MmDomainEventsService,
        @Inject(forwardRef(() => QualityInspectionService))
        private qualityService: QualityInspectionService,
        @Inject(forwardRef(() => InspectionLotService))
        private inspectionLotService: InspectionLotService,
        private inspectionRequirement: InspectionRequirementService,
        @Inject(forwardRef(() => PutawayService))
        private putawayService: PutawayService,
    ) {}

    async create(dto: CreateGoodsReceiptDto) {
        const docNumber = await this.generateDocNumber('GR')

        if (dto.purchaseOrderId) {
            const po = await this.prisma.mmPurchaseOrder.findUnique({
                where: { id: dto.purchaseOrderId },
            })
            if (!po) throw new BadRequestException('Purchase order not found')
            const receivable = ['SENT', 'PARTIALLY_RECEIVED', 'APPROVED']
            if (!receivable.includes(po.status)) {
                throw new BadRequestException(`Cannot receive against PO in status ${po.status}`)
            }
        }

        const lines = dto.lines.map((l) => {
            const unitCost = new Decimal(l.unitCost ?? 0)
            const totalCost = l.totalCost !== undefined
                ? new Decimal(l.totalCost)
                : unitCost.mul(l.quantity)
            return {
                materialId: l.materialId,
                quantity: new Decimal(l.quantity),
                expectedQuantity: l.expectedQuantity != null ? new Decimal(l.expectedQuantity) : null,
                shortageQuantity: new Decimal(l.shortageQuantity ?? 0),
                overageQuantity: new Decimal(l.overageQuantity ?? 0),
                damagedQuantity: new Decimal(l.damagedQuantity ?? 0),
                rejectedQuantity: new Decimal(l.rejectedQuantity ?? 0),
                uomId: l.uomId,
                storageBinId: l.storageBinId ?? null,
                batchId: l.batchId ?? null,
                serialNumberId: l.serialNumberId ?? null,
                unitCost,
                totalCost,
                stockStatus: l.stockStatus ?? null,
                remarks: l.remarks ?? null,
                purchaseOrderLineId: l.purchaseOrderLineId ?? null,
                expectedReceiptLineId: l.expectedReceiptLineId ?? null,
                discrepancyFlag: l.discrepancyFlag ?? null,
            }
        })

        return this.prisma.mmGoodsReceipt.create({
            data: {
                documentNumber: docNumber,
                companyId: dto.companyId,
                warehouseId: dto.warehouseId,
                purchaseOrderId: dto.purchaseOrderId ?? null,
                expectedReceiptId: dto.expectedReceiptId ?? null,
                asnId: dto.asnId ?? null,
                supplierId: dto.supplierId ?? null,
                receiverId: dto.receiverId ?? null,
                postingDate: new Date(dto.postingDate),
                documentDate: new Date(dto.documentDate),
                stockStatus: dto.stockStatus ?? 'UNRESTRICTED',
                remarks: dto.remarks ?? null,
                createdBy: dto.createdBy ?? null,
                status: 'DRAFT',
                lines: { create: lines },
            },
            include: {
                lines: { include: { material: true, uom: true } },
                warehouse: true,
                supplier: true,
            },
        })
    }

    async post(id: string) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot post: document is ${doc.status}`)
        }

        if (doc.purchaseOrderId) {
            await this.applyPoReceiptTolerances(doc)
        }

        const qiLines: Array<{ goodsReceiptLineId: string; materialId: string; quantity: number }> = []
        const putawayLines: Array<{
            goodsReceiptLineId: string
            materialId: string
            quantity: number
            uomId: string
            batchId?: string
            serialId?: string
            sourceBinId?: string
        }> = []

        for (const line of doc.lines) {
            const material = line.material
            const needsQi =
                line.stockStatus === 'QUALITY_INSPECTION' ||
                (line.stockStatus == null &&
                    (await this.inspectionRequirement.isInspectionRequired({
                        materialId: line.materialId,
                        supplierId: doc.supplierId,
                        warehouseId: doc.warehouseId,
                    })))
            const lineStatus = line.stockStatus ?? (needsQi ? 'QUALITY_INSPECTION' : doc.stockStatus)

            // Good qty posts to inventory; damaged/rejected excluded from unrestricted/QI stock
            const goodQty = Math.max(
                0,
                Number(line.quantity) -
                    Number(line.damagedQuantity ?? 0) -
                    Number(line.rejectedQuantity ?? 0),
            )
            const damagedQty = Number(line.damagedQuantity ?? 0)

            if (goodQty > 0) {
                await this.postingService.postTransaction({
                    companyId: doc.companyId,
                    warehouseId: doc.warehouseId,
                    storageBinId: line.storageBinId ?? undefined,
                    materialId: line.materialId,
                    batchId: line.batchId ?? undefined,
                    serialNumberId: line.serialNumberId ?? undefined,
                    stockStatus: lineStatus,
                    movementType: 'RECEIPT',
                    quantity: goodQty,
                    uomId: line.uomId,
                    unitCost: Number(line.unitCost),
                    totalCost: Number(line.unitCost) * goodQty,
                    postingDate: doc.postingDate.toISOString(),
                    documentDate: doc.documentDate.toISOString(),
                    sourceModule: 'STOCK_OPS',
                    sourceDocumentType: 'GOODS_RECEIPT',
                    sourceDocumentId: doc.id,
                    sourceDocumentLineId: line.id,
                    idempotencyKey: postingKey('gr', doc.id, line.id, 'good'),
                    createdBy: doc.createdBy ?? undefined,
                })

                if (lineStatus === 'QUALITY_INSPECTION') {
                    qiLines.push({
                        goodsReceiptLineId: line.id,
                        materialId: line.materialId,
                        quantity: goodQty,
                    })
                } else if (lineStatus === 'UNRESTRICTED') {
                    putawayLines.push({
                        goodsReceiptLineId: line.id,
                        materialId: line.materialId,
                        quantity: goodQty,
                        uomId: line.uomId,
                        batchId: line.batchId ?? undefined,
                        serialId: line.serialNumberId ?? undefined,
                        sourceBinId: line.storageBinId ?? undefined,
                    })
                }
            }

            if (damagedQty > 0) {
                await this.postingService.postTransaction({
                    companyId: doc.companyId,
                    warehouseId: doc.warehouseId,
                    storageBinId: line.storageBinId ?? undefined,
                    materialId: line.materialId,
                    batchId: line.batchId ?? undefined,
                    serialNumberId: line.serialNumberId ?? undefined,
                    stockStatus: 'BLOCKED',
                    movementType: 'RECEIPT',
                    quantity: damagedQty,
                    uomId: line.uomId,
                    unitCost: Number(line.unitCost),
                    totalCost: Number(line.unitCost) * damagedQty,
                    postingDate: doc.postingDate.toISOString(),
                    documentDate: doc.documentDate.toISOString(),
                    sourceModule: 'STOCK_OPS',
                    sourceDocumentType: 'GOODS_RECEIPT',
                    sourceDocumentId: doc.id,
                    sourceDocumentLineId: line.id,
                    reasonCode: 'DAMAGED',
                    idempotencyKey: postingKey('gr', doc.id, line.id, 'damaged'),
                    createdBy: doc.createdBy ?? undefined,
                })
            }
        }

        if (doc.purchaseOrderId) {
            await this.updatePoReceivedQuantities(doc)
        }

        if (doc.expectedReceiptId) {
            await this.updateExpectedReceiptQuantities(doc)
        }

        const updated = await this.prisma.mmGoodsReceipt.update({
            where: { id },
            data: { status: 'POSTED' },
            include: {
                lines: { include: { material: true, uom: true } },
                warehouse: true,
                supplier: true,
            },
        })

        if (qiLines.length) {
            await this.inspectionLotService.createFromGoodsReceipt(doc.id, qiLines)
        }
        for (const pl of putawayLines) {
            await this.putawayService.createFromGoodsReceiptLine({
                companyId: doc.companyId,
                warehouseId: doc.warehouseId,
                goodsReceiptId: doc.id,
                goodsReceiptLineId: pl.goodsReceiptLineId,
                materialId: pl.materialId,
                quantity: pl.quantity,
                uomId: pl.uomId,
                batchId: pl.batchId,
                serialId: pl.serialId,
                stockStatus: 'UNRESTRICTED',
                sourceBinId: pl.sourceBinId,
                sourceDocument: doc.documentNumber,
            })
        }

        const payload = {
            sourceModule: 'STOCK_OPS',
            documentType: 'GOODS_RECEIPT',
            documentId: doc.id,
            companyId: doc.companyId,
            lines: doc.lines.map((l) => ({
                materialId: l.materialId,
                quantity: Number(l.quantity),
                unitCost: Number(l.unitCost),
                totalCost: Number(l.totalCost),
            })),
        }
        this.events.emit('goods-receipt.posted', { goodsReceiptId: doc.id })
        void this.domainEvents.goodsReceiptPosted({
            companyId: doc.companyId,
            goodsReceiptId: doc.id,
            payload,
        })

        return updated
    }

    async cancel(id: string) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot cancel: document is ${doc.status}`)
        }
        return this.prisma.mmGoodsReceipt.update({
            where: { id },
            data: { status: 'CANCELLED' },
            include: { lines: true },
        })
    }

    async reverse(id: string, createdBy?: string) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'POSTED') {
            throw new BadRequestException(`Cannot reverse: document is ${doc.status}`)
        }

        const ledgerTxns = await this.prisma.mmInventoryTransaction.findMany({
            where: { sourceDocumentId: id, sourceDocumentType: 'GOODS_RECEIPT' },
        })

        for (const txn of ledgerTxns) {
            const alreadyReversed = await this.prisma.mmInventoryTransaction.findFirst({
                where: { reversalOfId: txn.id },
            })
            if (alreadyReversed) continue
            await this.postingService.reverseTransaction(txn.id, {
                reasonCode: 'REVERSAL',
                remarks: `Reversal of goods receipt ${doc.documentNumber}`,
                createdBy,
            })
        }

        // Roll back PO received quantities
        if (doc.purchaseOrderId) {
            for (const line of doc.lines) {
                if (!line.purchaseOrderLineId) continue
                const poLine = await this.prisma.mmPurchaseOrderLine.findUnique({
                    where: { id: line.purchaseOrderLineId },
                })
                if (!poLine) continue
                const nextQty = new Decimal(poLine.receivedQuantity).minus(line.quantity)
                await this.prisma.mmPurchaseOrderLine.update({
                    where: { id: poLine.id },
                    data: {
                        receivedQuantity: nextQty.lt(0) ? new Decimal(0) : nextQty,
                    },
                })
            }
            const po = await this.prisma.mmPurchaseOrder.findUnique({
                where: { id: doc.purchaseOrderId },
                include: { lines: true },
            })
            if (po) {
                const any = po.lines.some((l) => Number(l.receivedQuantity) > 0)
                const all = po.lines.every((l) =>
                    new Decimal(l.receivedQuantity).gte(l.quantity),
                )
                const status = all ? 'FULLY_RECEIVED' : any ? 'PARTIALLY_RECEIVED' : 'SENT'
                await this.prisma.mmPurchaseOrder.update({
                    where: { id: po.id },
                    data: { status },
                })
            }
        }

        // Cancel open putaway tasks for this GR
        await this.prisma.wmPutawayTask.updateMany({
            where: {
                goodsReceiptId: id,
                status: { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'] },
            },
            data: { status: 'CANCELLED' },
        })

        // Roll back expected receipt quantities / status
        if (doc.expectedReceiptId) {
            for (const line of doc.lines) {
                if (!line.expectedReceiptLineId) continue
                const erLine = await this.prisma.mmExpectedReceiptLine.findUnique({
                    where: { id: line.expectedReceiptLineId },
                })
                if (!erLine) continue
                const nextRecv = new Decimal(erLine.receivedQuantity).minus(line.quantity)
                const nextDamaged = new Decimal(erLine.damagedQuantity).minus(
                    line.damagedQuantity ?? 0,
                )
                const nextRejected = new Decimal(erLine.rejectedQuantity ?? 0).minus(
                    line.rejectedQuantity ?? 0,
                )
                const received = nextRecv.lt(0) ? new Decimal(0) : nextRecv
                const damaged = nextDamaged.lt(0) ? new Decimal(0) : nextDamaged
                const rejected = nextRejected.lt(0) ? new Decimal(0) : nextRejected
                const expected = new Decimal(erLine.expectedQuantity)
                let status = 'PARTIAL'
                if (received.eq(0)) status = 'OPEN'
                else if (received.gte(expected))
                    status = received.gt(expected) ? 'OVER' : 'COMPLETE'
                else status = 'SHORT'
                await this.prisma.mmExpectedReceiptLine.update({
                    where: { id: erLine.id },
                    data: {
                        receivedQuantity: received,
                        damagedQuantity: damaged,
                        rejectedQuantity: rejected,
                        status,
                    },
                })
            }
            const refreshed = await this.prisma.mmExpectedReceipt.findUnique({
                where: { id: doc.expectedReceiptId },
                include: { lines: true },
            })
            if (refreshed) {
                const anyRecv = refreshed.lines.some((l) => Number(l.receivedQuantity) > 0)
                await this.prisma.mmExpectedReceipt.update({
                    where: { id: refreshed.id },
                    data: {
                        status: anyRecv ? 'IN_PROGRESS' : 'OPEN',
                    },
                })
            }
        }

        // Cancel open QI docs for this GR
        await this.prisma.mmQualityInspection.updateMany({
            where: {
                goodsReceiptId: id,
                status: 'PENDING',
            },
            data: { status: 'CANCELLED' },
        })

        const payload = {
            sourceModule: 'STOCK_OPS',
            documentType: 'GOODS_RECEIPT',
            documentId: doc.id,
            companyId: doc.companyId,
            lines: doc.lines.map((l) => ({
                materialId: l.materialId,
                quantity: Number(l.quantity),
                unitCost: Number(l.unitCost),
                totalCost: Number(l.totalCost),
            })),
        }
        await this.prisma.mmAccountingEvent.create({
            data: {
                eventType: 'GOODS_RECEIPT_REVERSED',
                sourceModule: 'STOCK_OPS',
                documentType: 'GOODS_RECEIPT',
                documentId: doc.id,
                companyId: doc.companyId,
                payload,
                status: 'PENDING',
            },
        })
        this.events.emit('accounting.entry.requested', {
            ...payload,
            eventType: 'GOODS_RECEIPT_REVERSED',
        })

        return this.prisma.mmGoodsReceipt.update({
            where: { id },
            data: { status: 'REVERSED' },
            include: { lines: true },
        })
    }

    async findAll(query: StockOpsQueryDto) {
        const where: any = {}
        if (query.status) where.status = query.status
        if (query.warehouseId) where.warehouseId = query.warehouseId
        if (query.search) {
            where.documentNumber = { contains: query.search, mode: 'insensitive' }
        }
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20
        const [data, total] = await Promise.all([
            this.prisma.mmGoodsReceipt.findMany({
                where,
                include: {
                    lines: { include: { material: true, uom: true } },
                    warehouse: true,
                    supplier: true,
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmGoodsReceipt.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        return this.findOneOrFail(id)
    }

    private async applyPoReceiptTolerances(doc: {
        purchaseOrderId: string | null
        companyId: string
        lines: Array<{
            id: string
            quantity: Decimal
            purchaseOrderLineId: string | null
            unitCost: Decimal
        }>
    }) {
        const po = await this.prisma.mmPurchaseOrder.findUnique({
            where: { id: doc.purchaseOrderId! },
            include: { lines: true },
        })
        if (!po) throw new BadRequestException('Linked purchase order not found')
        const tol = await this.resolveTolerances(po)

        for (const line of doc.lines) {
            if (!line.purchaseOrderLineId) {
                throw new BadRequestException('PO-linked GR lines require purchaseOrderLineId')
            }
            const poLine = po.lines.find((l) => l.id === line.purchaseOrderLineId)
            if (!poLine) {
                throw new BadRequestException(`PO line ${line.purchaseOrderLineId} not found`)
            }
            const ordered = Number(poLine.quantity)
            const already = Number(poLine.receivedQuantity)
            const incoming = Number(line.quantity)
            const maxAllowed = ordered * (1 + tol.overDeliveryPct / 100)
            if (already + incoming > maxAllowed + 1e-9) {
                throw new BadRequestException(
                    `Over-delivery on PO line ${poLine.lineNumber}: exceeds tolerance`,
                )
            }
        }
    }

    private async updateExpectedReceiptQuantities(doc: {
        expectedReceiptId: string | null
        lines: Array<{
            quantity: Decimal
            damagedQuantity?: Decimal | null
            rejectedQuantity?: Decimal | null
            expectedReceiptLineId: string | null
        }>
    }) {
        const erId = doc.expectedReceiptId!
        for (const line of doc.lines) {
            if (!line.expectedReceiptLineId) continue
            const erLine = await this.prisma.mmExpectedReceiptLine.findUnique({
                where: { id: line.expectedReceiptLineId },
            })
            if (!erLine) continue
            const newReceived = new Decimal(erLine.receivedQuantity).plus(line.quantity)
            const newDamaged = new Decimal(erLine.damagedQuantity).plus(line.damagedQuantity ?? 0)
            const newRejected = new Decimal(erLine.rejectedQuantity ?? 0).plus(
                line.rejectedQuantity ?? 0,
            )
            const expected = new Decimal(erLine.expectedQuantity)
            let status = 'PARTIAL'
            if (newReceived.gte(expected)) status = newReceived.gt(expected) ? 'OVER' : 'COMPLETE'
            else if (newReceived.eq(0)) status = 'OPEN'
            else if (newReceived.lt(expected)) status = 'SHORT'
            await this.prisma.mmExpectedReceiptLine.update({
                where: { id: erLine.id },
                data: {
                    receivedQuantity: newReceived,
                    damagedQuantity: newDamaged,
                    rejectedQuantity: newRejected,
                    status,
                },
            })
        }
        const refreshed = await this.prisma.mmExpectedReceipt.findUnique({
            where: { id: erId },
            include: { lines: true },
        })
        if (!refreshed) return
        const allDone = refreshed.lines.every((l) => ['COMPLETE', 'OVER'].includes(l.status))
        const anyRecv = refreshed.lines.some((l) => Number(l.receivedQuantity) > 0)
        await this.prisma.mmExpectedReceipt.update({
            where: { id: erId },
            data: { status: allDone ? 'CLOSED' : anyRecv ? 'IN_PROGRESS' : 'OPEN' },
        })
    }

    private async updatePoReceivedQuantities(doc: {
        purchaseOrderId: string | null
        lines: Array<{ quantity: Decimal; purchaseOrderLineId: string | null }>
    }) {
        const poId = doc.purchaseOrderId!
        for (const line of doc.lines) {
            if (!line.purchaseOrderLineId) continue
            const poLine = await this.prisma.mmPurchaseOrderLine.findUnique({
                where: { id: line.purchaseOrderLineId },
            })
            if (!poLine) continue
            await this.prisma.mmPurchaseOrderLine.update({
                where: { id: poLine.id },
                data: {
                    receivedQuantity: new Decimal(poLine.receivedQuantity).plus(line.quantity),
                },
            })
        }

        const refreshed = await this.prisma.mmPurchaseOrder.findUnique({
            where: { id: poId },
            include: { lines: true },
        })
        if (!refreshed) return
        const tol = await this.resolveTolerances(refreshed)
        const allFully = refreshed.lines.every((l) => {
            const ordered = Number(l.quantity)
            const received = Number(l.receivedQuantity)
            return received + 1e-9 >= ordered * (1 - tol.underDeliveryPct / 100)
        })
        const anyReceived = refreshed.lines.some((l) => Number(l.receivedQuantity) > 0)
        let status = refreshed.status
        if (allFully) status = 'FULLY_RECEIVED'
        else if (anyReceived) status = 'PARTIALLY_RECEIVED'
        if (status !== refreshed.status) {
            await this.prisma.mmPurchaseOrder.update({
                where: { id: poId },
                data: { status },
            })
        }
    }

    private async resolveTolerances(po: {
        companyId: string
        overDeliveryPctOverride: Decimal | null
        underDeliveryPctOverride: Decimal | null
        priceTolerancePctOverride: Decimal | null
        quantityTolerancePctOverride: Decimal | null
    }) {
        const cfg = await this.prisma.mmPoToleranceConfig.findUnique({
            where: { companyId: po.companyId },
        })
        return {
            overDeliveryPct: po.overDeliveryPctOverride != null
                ? Number(po.overDeliveryPctOverride)
                : cfg ? Number(cfg.overDeliveryPct) : 0,
            underDeliveryPct: po.underDeliveryPctOverride != null
                ? Number(po.underDeliveryPctOverride)
                : cfg ? Number(cfg.underDeliveryPct) : 0,
            priceTolerancePct: po.priceTolerancePctOverride != null
                ? Number(po.priceTolerancePctOverride)
                : cfg ? Number(cfg.priceTolerancePct) : 0,
            quantityTolerancePct: po.quantityTolerancePctOverride != null
                ? Number(po.quantityTolerancePctOverride)
                : cfg ? Number(cfg.quantityTolerancePct) : 0,
        }
    }

    private async findOneOrFail(id: string) {
        const doc = await this.prisma.mmGoodsReceipt.findUnique({
            where: { id },
            include: {
                lines: { include: { material: true, uom: true, storageBin: true } },
                warehouse: true,
                supplier: true,
                purchaseOrder: { select: { id: true, poNumber: true, status: true } },
                expectedReceipt: { select: { id: true, documentNumber: true } },
                qualityInspections: true,
                putawayTasks: true,
            },
        })
        if (!doc) throw new NotFoundException('Goods receipt not found')
        return doc
    }

    private async generateDocNumber(prefix: string): Promise<string> {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `${prefix}-${dateStr}-`
        const last = await this.prisma.mmGoodsReceipt.findFirst({
            where: { documentNumber: { startsWith: pfx } },
            orderBy: { documentNumber: 'desc' },
        })
        let seq = 1
        if (last) {
            const lastSeq = parseInt(last.documentNumber.replace(pfx, ''), 10)
            if (!isNaN(lastSeq)) seq = lastSeq + 1
        }
        return `${pfx}${String(seq).padStart(5, '0')}`
    }
}
