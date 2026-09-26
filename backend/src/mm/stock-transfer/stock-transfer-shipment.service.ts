import {
    Injectable,
    BadRequestException,
    Inject,
    forwardRef,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { InventoryPostingService } from '../inventory/inventory-posting.service'
import { Decimal } from '@prisma/client/runtime/library'
import {
    postInterWarehouseDispatch,
} from '../warehouse/transfers/inter-warehouse-posting'
import { DispatchStoDto } from './dto/stock-transfer.dto'
import { DISPATCHABLE_STATUSES } from './stock-transfer.constants'

@Injectable()
export class StockTransferShipmentService {
    constructor(
        private prisma: PrismaService,
        @Inject(forwardRef(() => InventoryPostingService))
        private posting: InventoryPostingService,
    ) {}

    async dispatch(orderId: string, dto: DispatchStoDto = {}) {
        const order = await this.prisma.mmStockTransferOrder.findUnique({
            where: { id: orderId },
            include: { lines: true, shipments: { where: { status: 'DISPATCHED' } } },
        })
        if (!order) throw new BadRequestException('Stock transfer order not found')
        if (!DISPATCHABLE_STATUSES.has(order.status)) {
            throw new BadRequestException(`Cannot dispatch: order is ${order.status}`)
        }

        // Duplicate full dispatch guard
        if (order.status === 'IN_TRANSIT' || order.status === 'DISPATCHED') {
            throw new BadRequestException('Duplicate dispatch: order already dispatched')
        }

        const shipLines = (dto.lines?.length
            ? dto.lines
            : order.lines.map((l) => ({
                  orderLineId: l.id,
                  quantity: Number(new Decimal(l.quantity).minus(l.dispatchedQty)),
              }))
        ).filter((l) => l.quantity > 0)

        if (!shipLines.length) {
            throw new BadRequestException('Nothing left to dispatch')
        }

        for (const sl of shipLines) {
            const line = order.lines.find((l) => l.id === sl.orderLineId)
            if (!line) throw new BadRequestException(`Unknown order line ${sl.orderLineId}`)
            const remaining = new Decimal(line.quantity).minus(line.dispatchedQty)
            if (new Decimal(sl.quantity).gt(remaining)) {
                throw new BadRequestException(
                    `Dispatch qty exceeds remaining for line ${line.lineNumber}`,
                )
            }
        }

        const shipmentNumber = await this.nextShipmentNumber()
        const postingDate = order.postingDate.toISOString()

        if (order.transferType === 'BIN_TO_BIN') {
            return this.dispatchBinToBin(order, shipLines, shipmentNumber, dto.dispatchedBy)
        }

        const claimed = await this.prisma.mmStockTransferOrder.updateMany({
            where: {
                id: orderId,
                status: { in: [...DISPATCHABLE_STATUSES] },
            },
            data: { status: 'DISPATCHED' },
        })
        if (claimed.count === 0) {
            throw new BadRequestException('Duplicate dispatch: concurrent claim failed')
        }

        const shipment = await this.prisma.mmTransferShipment.create({
            data: {
                shipmentNumber,
                orderId,
                status: 'DISPATCHED',
                dispatchedAt: new Date(),
                dispatchedBy: dto.dispatchedBy ?? null,
                lines: {
                    create: shipLines.map((l) => ({
                        orderLineId: l.orderLineId,
                        quantity: l.quantity,
                    })),
                },
            },
            include: { lines: true },
        })

        const postLines = shipLines.map((sl) => {
            const line = order.lines.find((l) => l.id === sl.orderLineId)!
            return {
                id: shipment.lines.find((x) => x.orderLineId === sl.orderLineId)!.id,
                materialId: line.materialId,
                quantity: sl.quantity,
                uomId: line.uomId,
                sourceBinId: line.sourceBinId,
                destinationBinId: line.destinationBinId,
                batchId: line.batchId,
                serialNumberId: line.serialNumberId,
            }
        })

        await postInterWarehouseDispatch({
            posting: this.posting,
            companyId: order.companyId,
            sourceWarehouseId: order.sourceWarehouseId,
            destinationWarehouseId: order.destinationWarehouseId,
            documentId: shipment.id,
            sourceDocumentType: 'STOCK_TRANSFER_SHIPMENT',
            sourceModule: 'STOCK_TRANSFER',
            postingDate,
            createdBy: dto.dispatchedBy ?? order.requestedBy ?? undefined,
            lines: postLines,
            idempotencyPrefix: shipment.id,
        })

        for (const sl of shipLines) {
            const line = order.lines.find((l) => l.id === sl.orderLineId)!
            const newDispatched = new Decimal(line.dispatchedQty).plus(sl.quantity)
            await this.prisma.mmStockTransferOrderLine.update({
                where: { id: line.id },
                data: {
                    dispatchedQty: newDispatched,
                    status: newDispatched.gte(line.quantity) ? 'DISPATCHED' : 'ALLOCATED',
                },
            })
        }

        const refreshed = await this.prisma.mmStockTransferOrderLine.findMany({
            where: { orderId },
        })
        const allDispatched = refreshed.every((l) =>
            new Decimal(l.dispatchedQty).gte(l.quantity),
        )

        return this.prisma.mmStockTransferOrder.update({
            where: { id: orderId },
            data: { status: allDispatched ? 'IN_TRANSIT' : 'DISPATCHED' },
            include: {
                lines: true,
                shipments: { include: { lines: true } },
                receipts: true,
                sourceWarehouse: true,
                destinationWarehouse: true,
            },
        })
    }

    private async dispatchBinToBin(
        order: {
            id: string
            companyId: string
            sourceWarehouseId: string
            postingDate: Date
            requestedBy: string | null
            lines: Array<{
                id: string
                materialId: string
                quantity: any
                uomId: string
                sourceBinId: string | null
                destinationBinId: string | null
                batchId: string | null
                serialNumberId: string | null
                dispatchedQty: any
            }>
        },
        shipLines: Array<{ orderLineId: string; quantity: number }>,
        shipmentNumber: string,
        dispatchedBy?: string,
    ) {
        const claimed = await this.prisma.mmStockTransferOrder.updateMany({
            where: { id: order.id, status: { in: [...DISPATCHABLE_STATUSES] } },
            data: { status: 'DISPATCHED' },
        })
        if (claimed.count === 0) {
            throw new BadRequestException('Duplicate dispatch: concurrent claim failed')
        }

        const shipment = await this.prisma.mmTransferShipment.create({
            data: {
                shipmentNumber,
                orderId: order.id,
                status: 'DISPATCHED',
                dispatchedAt: new Date(),
                dispatchedBy: dispatchedBy ?? null,
                lines: {
                    create: shipLines.map((l) => ({
                        orderLineId: l.orderLineId,
                        quantity: l.quantity,
                    })),
                },
            },
            include: { lines: true },
        })

        const postingDate = order.postingDate.toISOString()
        for (const sl of shipLines) {
            const line = order.lines.find((l) => l.id === sl.orderLineId)!
            const shipLineId = shipment.lines.find((x) => x.orderLineId === sl.orderLineId)!.id
            const base = {
                companyId: order.companyId,
                warehouseId: order.sourceWarehouseId,
                materialId: line.materialId,
                batchId: line.batchId ?? undefined,
                serialNumberId: line.serialNumberId ?? undefined,
                stockStatus: 'UNRESTRICTED' as const,
                quantity: sl.quantity,
                uomId: line.uomId,
                postingDate,
                documentDate: postingDate,
                sourceModule: 'STOCK_TRANSFER',
                sourceDocumentType: 'STOCK_TRANSFER_SHIPMENT',
                sourceDocumentId: shipment.id,
                sourceDocumentLineId: shipLineId,
                createdBy: dispatchedBy ?? order.requestedBy ?? undefined,
            }
            await this.posting.postTransaction({
                ...base,
                storageBinId: line.sourceBinId!,
                movementType: 'TRANSFER_OUT',
                idempotencyKey: `${shipment.id}:${shipLineId}:out`,
            })
            await this.posting.postTransaction({
                ...base,
                storageBinId: line.destinationBinId!,
                movementType: 'TRANSFER_IN',
                idempotencyKey: `${shipment.id}:${shipLineId}:in`,
            })

            const newDispatched = new Decimal(line.dispatchedQty).plus(sl.quantity)
            await this.prisma.mmStockTransferOrderLine.update({
                where: { id: line.id },
                data: {
                    dispatchedQty: newDispatched,
                    receivedQty: newDispatched,
                    status: newDispatched.gte(line.quantity) ? 'RECEIVED' : 'PARTIALLY_RECEIVED',
                },
            })
        }

        const refreshed = await this.prisma.mmStockTransferOrderLine.findMany({
            where: { orderId: order.id },
        })
        const allDone = refreshed.every((l) => new Decimal(l.receivedQty).gte(l.quantity))

        return this.prisma.mmStockTransferOrder.update({
            where: { id: order.id },
            data: {
                status: allDone ? 'CLOSED' : 'PARTIALLY_RECEIVED',
                closedAt: allDone ? new Date() : null,
            },
            include: {
                lines: true,
                shipments: { include: { lines: true } },
                receipts: true,
                sourceWarehouse: true,
                destinationWarehouse: true,
            },
        })
    }

    private async nextShipmentNumber() {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `TSH-${today}-`
        const last = await this.prisma.mmTransferShipment.findFirst({
            where: { shipmentNumber: { startsWith: pfx } },
            orderBy: { shipmentNumber: 'desc' },
        })
        let seq = 1
        if (last) {
            const n = parseInt(last.shipmentNumber.replace(pfx, ''), 10)
            if (!isNaN(n)) seq = n + 1
        }
        return `${pfx}${String(seq).padStart(5, '0')}`
    }
}
