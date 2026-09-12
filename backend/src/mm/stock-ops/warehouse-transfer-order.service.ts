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
import { CreateWarehouseTransferOrderDto } from './dto/create-warehouse-transfer-order.dto'
import { StockOpsQueryDto } from './dto/stock-ops-query.dto'
import { Decimal } from '@prisma/client/runtime/library'
import {
    postInterWarehouseDispatch,
    postInterWarehouseReceive,
} from '../warehouse/transfers/inter-warehouse-posting'
import { StockTransferOrderService } from '../stock-transfer/stock-transfer-order.service'

/**
 * Inventory hub WTO API — bridges to canonical MmStockTransferOrder when possible.
 * Physical posts via shared inter-warehouse InventoryPostingService helper.
 */
@Injectable()
export class WarehouseTransferOrderService {
    constructor(
        private prisma: PrismaService,
        private postingService: InventoryPostingService,
        private events: EventEmitter2,
        @Inject(forwardRef(() => StockTransferOrderService))
        private sto: StockTransferOrderService,
    ) {}

    async create(dto: CreateWarehouseTransferOrderDto) {
        const sto = await this.sto.create({
            companyId: dto.companyId,
            transferType:
                dto.sourceWarehouseId === dto.destinationWarehouseId
                    ? 'BIN_TO_BIN'
                    : 'WAREHOUSE_TO_WAREHOUSE',
            sourceWarehouseId: dto.sourceWarehouseId,
            destinationWarehouseId: dto.destinationWarehouseId,
            postingDate: dto.postingDate,
            requestedBy: dto.requestedBy,
            notes: dto.notes,
            lines: dto.lines.map((l) => ({
                materialId: l.materialId,
                quantity: l.quantity,
                uomId: l.uomId,
                sourceBinId: l.sourceBinId,
                destinationBinId: l.destinationBinId,
                batchId: l.batchId,
                serialNumberId: l.serialNumberId,
            })),
        })

        const docNumber = await this.generateDocNumber('WTO')
        const lines = dto.lines.map((l) => ({
            materialId: l.materialId,
            quantity: new Decimal(l.quantity),
            uomId: l.uomId,
            sourceBinId: l.sourceBinId ?? null,
            destinationBinId: l.destinationBinId ?? null,
            batchId: l.batchId ?? null,
            serialNumberId: l.serialNumberId ?? null,
            dispatchedQty: new Decimal(0),
            receivedQty: new Decimal(0),
            status: 'PENDING',
        }))

        return this.prisma.mmWarehouseTransferOrder.create({
            data: {
                documentNumber: docNumber,
                companyId: dto.companyId,
                sourceWarehouseId: dto.sourceWarehouseId,
                destinationWarehouseId: dto.destinationWarehouseId,
                postingDate: new Date(dto.postingDate),
                requestedBy: dto.requestedBy ?? null,
                notes: dto.notes ?? null,
                status: 'DRAFT',
                legacyStoId: sto.id,
                lines: { create: lines },
            },
            include: { lines: true },
        })
    }

    async approve(id: string, approvedBy?: string) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot approve: document is ${doc.status}`)
        }
        if (doc.legacyStoId) {
            await this.sto.approve(doc.legacyStoId, { approvedBy })
        }

        return this.prisma.mmWarehouseTransferOrder.update({
            where: { id },
            data: { status: 'APPROVED', approvedBy: approvedBy ?? null },
            include: { lines: true },
        })
    }

    /** Soft pick — required before dispatch (same as Wm transfer). */
    async pick(id: string) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'APPROVED' && doc.status !== 'PICKED') {
            throw new BadRequestException(
                `Cannot pick: document must be APPROVED (status ${doc.status})`,
            )
        }

        for (const line of doc.lines) {
            await this.prisma.mmWarehouseTransferOrderLine.update({
                where: { id: line.id },
                data: { dispatchedQty: line.quantity },
            })
        }

        return this.prisma.mmWarehouseTransferOrder.update({
            where: { id },
            data: { status: 'PICKED' },
            include: { lines: true },
        })
    }

    async dispatch(id: string) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'PICKED') {
            throw new BadRequestException(
                `Cannot dispatch: document must be PICKED (status ${doc.status})`,
            )
        }

        if (doc.legacyStoId) {
            let sto = await this.prisma.mmStockTransferOrder.findUnique({
                where: { id: doc.legacyStoId },
            })
            if (sto?.status === 'APPROVED') {
                await this.sto.allocate(doc.legacyStoId)
                sto = await this.prisma.mmStockTransferOrder.findUnique({
                    where: { id: doc.legacyStoId },
                })
            }
            if (sto && ['ALLOCATED', 'PICKING'].includes(sto.status)) {
                await this.sto.dispatch(doc.legacyStoId, {
                    dispatchedBy: doc.requestedBy ?? undefined,
                })
            }
            for (const line of doc.lines) {
                await this.prisma.mmWarehouseTransferOrderLine.update({
                    where: { id: line.id },
                    data: { dispatchedQty: line.quantity, status: 'DISPATCHED' },
                })
            }
            return this.prisma.mmWarehouseTransferOrder.update({
                where: { id },
                data: { status: 'IN_TRANSIT', dispatchedAt: new Date() },
                include: { lines: true },
            })
        }

        const createdBy = doc.requestedBy ?? 'system'
        const postingDate = doc.postingDate.toISOString()

        await postInterWarehouseDispatch({
            posting: this.postingService,
            companyId: doc.companyId,
            sourceWarehouseId: doc.sourceWarehouseId,
            destinationWarehouseId: doc.destinationWarehouseId,
            documentId: doc.id,
            sourceDocumentType: 'WAREHOUSE_TRANSFER',
            sourceModule: 'STOCK_OPS',
            postingDate,
            createdBy,
            lines: doc.lines.map((line) => ({
                id: line.id,
                materialId: line.materialId,
                quantity: Number(line.quantity),
                uomId: line.uomId,
                sourceBinId: line.sourceBinId,
                destinationBinId: line.destinationBinId,
                batchId: line.batchId,
                serialNumberId: line.serialNumberId,
            })),
            idempotencyPrefix: `wto:${doc.id}`,
        })

        for (const line of doc.lines) {
            await this.prisma.mmWarehouseTransferOrderLine.update({
                where: { id: line.id },
                data: { dispatchedQty: line.quantity, status: 'DISPATCHED' },
            })
        }

        return this.prisma.mmWarehouseTransferOrder.update({
            where: { id },
            data: { status: 'IN_TRANSIT', dispatchedAt: new Date() },
            include: { lines: true },
        })
    }

    async receive(id: string, lineId: string, receivedQty: number) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'DISPATCHED' && doc.status !== 'IN_TRANSIT') {
            throw new BadRequestException(`Cannot receive: document is ${doc.status}`)
        }

        const line = doc.lines.find((l) => l.id === lineId)
        if (!line) throw new NotFoundException('Line not found')

        const newReceivedQty = new Decimal(line.receivedQty).plus(receivedQty)
        if (newReceivedQty.gt(line.quantity)) {
            throw new BadRequestException('Received quantity exceeds ordered quantity')
        }

        const createdBy = doc.requestedBy ?? 'system'
        const remainingTransit = new Decimal(line.dispatchedQty).minus(line.receivedQty)
        if (new Decimal(receivedQty).gt(remainingTransit)) {
            throw new BadRequestException('Received quantity exceeds in-transit quantity')
        }

        await postInterWarehouseReceive({
            posting: this.postingService,
            companyId: doc.companyId,
            destinationWarehouseId: doc.destinationWarehouseId,
            documentId: doc.id,
            sourceDocumentType: 'WAREHOUSE_TRANSFER',
            sourceModule: 'STOCK_OPS',
            postingDate: doc.postingDate.toISOString(),
            createdBy,
            line: {
                id: line.id,
                materialId: line.materialId,
                quantity: Number(line.quantity),
                uomId: line.uomId,
                destinationBinId: line.destinationBinId,
                batchId: line.batchId,
                serialNumberId: line.serialNumberId,
            },
            receivedQty,
            idempotencyKey: `wto-recv-${line.id}-${newReceivedQty.toString()}`,
        })

        await this.prisma.mmWarehouseTransferOrderLine.update({
            where: { id: lineId },
            data: {
                receivedQty: newReceivedQty,
                status: newReceivedQty.gte(line.quantity) ? 'RECEIVED' : 'DISPATCHED',
            },
        })

        const allLines = await this.prisma.mmWarehouseTransferOrderLine.findMany({
            where: { orderId: id },
        })
        const allReceived = allLines.every((l) => new Decimal(l.receivedQty).gte(l.quantity))

        return this.prisma.mmWarehouseTransferOrder.update({
            where: { id },
            data: {
                status: allReceived ? 'COMPLETED' : 'IN_TRANSIT',
                receivedAt: new Date(),
            },
            include: { lines: true },
        })
    }

    async complete(id: string) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'DISPATCHED' && doc.status !== 'IN_TRANSIT') {
            throw new BadRequestException(`Cannot complete: document is ${doc.status}`)
        }

        for (const line of doc.lines) {
            const already = Number(line.receivedQty)
            const target = Number(line.quantity)
            const remaining = target - already
            if (remaining <= 0) {
                await this.prisma.mmWarehouseTransferOrderLine.update({
                    where: { id: line.id },
                    data: { status: 'RECEIVED' },
                })
                continue
            }

            await this.receive(id, line.id, remaining)
            await this.prisma.mmWarehouseTransferOrderLine.update({
                where: { id: line.id },
                data: { status: 'RECEIVED' },
            })
        }

        const updated = await this.prisma.mmWarehouseTransferOrder.update({
            where: { id },
            data: { status: 'COMPLETED' },
            include: { lines: true },
        })

        this.events.emit('accounting.entry.requested', {
            sourceModule: 'STOCK_OPS',
            documentType: 'WAREHOUSE_TRANSFER',
            documentId: doc.id,
            lines: doc.lines.map((l) => ({
                materialId: l.materialId,
                quantity: Number(l.quantity),
            })),
        })

        return updated
    }

    async cancel(id: string) {
        const doc = await this.findOneOrFail(id)
        if (doc.status !== 'DRAFT' && doc.status !== 'APPROVED') {
            throw new BadRequestException(`Cannot cancel: document is ${doc.status}`)
        }
        if (doc.legacyStoId) {
            await this.sto.cancel(doc.legacyStoId)
        }

        return this.prisma.mmWarehouseTransferOrder.update({
            where: { id },
            data: { status: 'CANCELLED' },
            include: { lines: true },
        })
    }

    async findAll(query: StockOpsQueryDto) {
        const where: any = {}
        if (query.status) where.status = query.status
        if (query.warehouseId) {
            where.OR = [
                { sourceWarehouseId: query.warehouseId },
                { destinationWarehouseId: query.warehouseId },
            ]
        }
        if (query.search) {
            where.documentNumber = { contains: query.search, mode: 'insensitive' }
        }

        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20

        const [data, total] = await Promise.all([
            this.prisma.mmWarehouseTransferOrder.findMany({
                where,
                include: {
                    lines: { include: { material: true, uom: true } },
                    sourceWarehouse: true,
                    destinationWarehouse: true,
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmWarehouseTransferOrder.count({ where }),
        ])

        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        return this.findOneOrFail(id)
    }

    private async findOneOrFail(id: string) {
        const doc = await this.prisma.mmWarehouseTransferOrder.findUnique({
            where: { id },
            include: {
                lines: { include: { material: true, uom: true, sourceBin: true, destinationBin: true } },
                sourceWarehouse: true,
                destinationWarehouse: true,
            },
        })
        if (!doc) throw new NotFoundException('Warehouse transfer order not found')
        return doc
    }

    private async generateDocNumber(prefix: string): Promise<string> {
        const today = new Date()
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `${prefix}-${dateStr}-`

        const last = await this.prisma.mmWarehouseTransferOrder.findFirst({
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
