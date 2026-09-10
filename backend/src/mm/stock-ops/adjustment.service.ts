import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PrismaService } from '../../prisma/prisma.service'
import { InventoryPostingService } from '../inventory/inventory-posting.service'
import { CreateAdjustmentDto } from './dto/create-adjustment.dto'
import { StockOpsQueryDto } from './dto/stock-ops-query.dto'
import { Decimal } from '@prisma/client/runtime/library'

@Injectable()
export class AdjustmentService {
    constructor(
        private prisma: PrismaService,
        private postingService: InventoryPostingService,
        private events: EventEmitter2,
    ) {}

    async create(dto: CreateAdjustmentDto) {
        const docNumber = await this.generateDocNumber('ADJ')
        const threshold = dto.approvalThreshold ?? 10000

        const lines = dto.lines.map((l) => ({
            materialId: l.materialId,
            quantity: new Decimal(l.quantity),
            uomId: l.uomId,
            storageBinId: l.storageBinId ?? null,
            batchId: l.batchId ?? null,
            serialNumberId: l.serialNumberId ?? null,
            unitCost: new Decimal(l.unitCost ?? 0),
            remarks: l.remarks ?? null,
        }))

        return this.prisma.mmInventoryAdjustment.create({
            data: {
                documentNumber: docNumber,
                companyId: dto.companyId,
                warehouseId: dto.warehouseId,
                sourceCountId: dto.sourceCountId ?? null,
                postingDate: new Date(dto.postingDate),
                adjustmentReason: dto.adjustmentReason,
                justification: dto.justification ?? null,
                approvalThreshold: new Decimal(threshold),
                createdBy: dto.createdBy ?? null,
                status: 'DRAFT',
                lines: { create: lines },
            },
            include: { lines: true },
        })
    }

    async submit(id: string) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot submit: document is ${doc.status}`)
        }

        const totalAbsCost = doc.lines.reduce((sum, l) => {
            const lineCost = new Decimal(l.unitCost).mul(new Decimal(l.quantity).abs())
            return sum.plus(lineCost)
        }, new Decimal(0))

        if (totalAbsCost.gt(doc.approvalThreshold)) {
            return this.prisma.mmInventoryAdjustment.update({
                where: { id },
                data: { status: 'PENDING_APPROVAL' },
                include: { lines: true },
            })
        }

        await this.postAdjustment(doc)

        return this.prisma.mmInventoryAdjustment.update({
            where: { id },
            data: { status: 'POSTED' },
            include: { lines: true },
        })
    }

    async approve(id: string, approvedBy?: string) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'PENDING_APPROVAL') {
            throw new BadRequestException(`Cannot approve: document is ${doc.status}`)
        }

        await this.postAdjustment(doc)

        const updated = await this.prisma.mmInventoryAdjustment.update({
            where: { id },
            data: { status: 'POSTED', approvedBy: approvedBy ?? null },
            include: { lines: true },
        })

        if (doc.sourceCountId) {
            await this.syncCountAfterAdjustmentPosted(doc.sourceCountId)
        }

        return updated
    }

    async reject(id: string, reason?: string) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'PENDING_APPROVAL') {
            throw new BadRequestException(`Cannot reject: document is ${doc.status}`)
        }

        return this.prisma.mmInventoryAdjustment.update({
            where: { id },
            data: { status: 'REJECTED', rejectionReason: reason ?? null },
            include: { lines: true },
        })
    }

    async cancel(id: string) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'DRAFT' && doc.status !== 'REJECTED') {
            throw new BadRequestException(`Cannot cancel: document is ${doc.status}`)
        }

        return this.prisma.mmInventoryAdjustment.update({
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
            where: {
                sourceDocumentId: id,
                sourceDocumentType: {
                    in: ['ADJUSTMENT', 'INVENTORY_COUNT_ADJUSTMENT'],
                },
            },
        })

        for (const txn of ledgerTxns) {
            await this.postingService.reverseTransaction(txn.id, {
                reasonCode: 'REVERSAL',
                remarks: `Reversal of adjustment ${doc.documentNumber}`,
                createdBy,
            })
        }

        return this.prisma.mmInventoryAdjustment.update({
            where: { id },
            data: { status: 'REVERSED' },
            include: { lines: true },
        })
    }

    private async postAdjustment(doc: any) {
        const fromCount = !!doc.sourceCountId

        for (const line of doc.lines) {
            const qty = new Decimal(line.quantity)
            const isPositive = qty.gte(0)
            const movementType = fromCount
                ? isPositive
                    ? 'COUNT_GAIN'
                    : 'COUNT_LOSS'
                : isPositive
                  ? 'ADJUSTMENT_IN'
                  : 'ADJUSTMENT_OUT'

            await this.postingService.postTransaction({
                companyId: doc.companyId,
                warehouseId: doc.warehouseId,
                storageBinId: line.storageBinId ?? undefined,
                materialId: line.materialId,
                batchId: line.batchId ?? undefined,
                serialNumberId: line.serialNumberId ?? undefined,
                stockStatus: 'UNRESTRICTED',
                movementType,
                quantity: Number(qty.abs()),
                uomId: line.uomId,
                unitCost: Number(line.unitCost),
                postingDate: doc.postingDate.toISOString(),
                documentDate: doc.postingDate.toISOString(),
                sourceModule: fromCount ? 'INVENTORY_CONTROL' : 'STOCK_OPS',
                sourceDocumentType: fromCount
                    ? 'INVENTORY_COUNT_ADJUSTMENT'
                    : 'ADJUSTMENT',
                sourceDocumentId: doc.id,
                sourceDocumentLineId: line.id,
                reasonCode: doc.adjustmentReason,
                createdBy: doc.createdBy ?? undefined,
            })
        }

        const payload = {
            sourceModule: fromCount ? 'INVENTORY_CONTROL' : 'STOCK_OPS',
            documentType: fromCount ? 'INVENTORY_COUNT_ADJUSTMENT' : 'ADJUSTMENT',
            documentId: doc.id,
            companyId: doc.companyId,
            eventHint: 'INVENTORY_ADJUSTMENT',
            lines: doc.lines.map((l: any) => ({
                materialId: l.materialId,
                quantity: Number(l.quantity),
                unitCost: Number(l.unitCost),
            })),
        }

        await this.prisma.mmAccountingEvent.create({
            data: {
                eventType: fromCount
                    ? 'INVENTORY_COUNT_ADJUSTMENT_POSTED'
                    : 'INVENTORY_ADJUSTMENT_POSTED',
                sourceModule: payload.sourceModule,
                documentType: payload.documentType,
                documentId: doc.id,
                companyId: doc.companyId,
                payload,
                status: 'PENDING',
            },
        })

        this.events.emit('accounting.entry.requested', payload)
    }

    private async syncCountAfterAdjustmentPosted(countId: string) {
        const lines = await this.prisma.mmInventoryCountLine.findMany({
            where: { countId },
        })
        for (const l of lines) {
            await this.prisma.mmInventoryCountLine.update({
                where: { id: l.id },
                data: {
                    status: 'ADJUSTED',
                    finalAdjustmentQty: l.varianceQuantity,
                },
            })
        }
        await this.prisma.mmInventoryCount.update({
            where: { id: countId },
            data: { status: 'POSTED' },
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
            this.prisma.mmInventoryAdjustment.findMany({
                where,
                include: {
                    lines: { include: { material: true, uom: true } },
                    warehouse: true,
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmInventoryAdjustment.count({ where }),
        ])

        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        return this.findOneOrFail(id)
    }

    private async findOneOrFail(id: string) {
        const doc = await this.prisma.mmInventoryAdjustment.findUnique({
            where: { id },
            include: {
                lines: { include: { material: true, uom: true, storageBin: true } },
                warehouse: true,
            },
        })
        if (!doc) throw new NotFoundException('Adjustment not found')
        return doc
    }

    private async generateDocNumber(prefix: string): Promise<string> {
        const today = new Date()
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `${prefix}-${dateStr}-`

        const last = await this.prisma.mmInventoryAdjustment.findFirst({
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
