import {
    Injectable,
    BadRequestException,
    Inject,
    forwardRef,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { InventoryPostingService } from '../inventory/inventory-posting.service'
import { Decimal } from '@prisma/client/runtime/library'
import { postInterWarehouseReceive } from '../warehouse/transfers/inter-warehouse-posting'
import { ReceiveStoDto } from './dto/stock-transfer.dto'
import { RECEIVABLE_STATUSES } from './stock-transfer.constants'
import { StockTransferWarehouseBridgeService } from './stock-transfer-warehouse-bridge.service'

@Injectable()
export class StockTransferReceiptService {
    constructor(
        private prisma: PrismaService,
        @Inject(forwardRef(() => InventoryPostingService))
        private posting: InventoryPostingService,
        private warehouseBridge: StockTransferWarehouseBridgeService,
    ) {}

    async receive(orderId: string, dto: ReceiveStoDto) {
        const order = await this.prisma.mmStockTransferOrder.findUnique({
            where: { id: orderId },
            include: { lines: true, shipments: true },
        })
        if (!order) throw new BadRequestException('Stock transfer order not found')
        if (!RECEIVABLE_STATUSES.has(order.status)) {
            throw new BadRequestException(`Cannot receive: order is ${order.status}`)
        }
        if (order.transferType === 'BIN_TO_BIN') {
            throw new BadRequestException('BIN_TO_BIN completes on dispatch; no separate receive')
        }
        if (!dto.lines?.length) {
            throw new BadRequestException('Receive lines are required')
        }

        // Duplicate receipt: reject when all lines already fully received and another POST arrives
        const alreadyFull = order.lines.every((l) =>
            new Decimal(l.receivedQty).gte(l.dispatchedQty),
        )
        if (alreadyFull && new Decimal(order.lines.reduce((s, l) => s + Number(l.dispatchedQty), 0)).gt(0)) {
            const allOrderFull = order.lines.every((l) =>
                new Decimal(l.receivedQty).gte(l.quantity),
            )
            if (allOrderFull) {
                throw new BadRequestException('Duplicate receipt: order already fully received')
            }
        }

        for (const rl of dto.lines) {
            const line = order.lines.find((l) => l.id === rl.orderLineId)
            if (!line) throw new BadRequestException(`Unknown order line ${rl.orderLineId}`)
            const open = new Decimal(line.dispatchedQty).minus(line.receivedQty)
            if (new Decimal(rl.quantity).gt(open)) {
                throw new BadRequestException(
                    `Receive qty exceeds open dispatched qty for line ${line.lineNumber}`,
                )
            }
        }

        const receiptNumber = await this.nextReceiptNumber()
        const receipt = await this.prisma.mmTransferReceipt.create({
            data: {
                receiptNumber,
                orderId,
                shipmentId: dto.shipmentId ?? order.shipments[0]?.id ?? null,
                status: 'POSTED',
                receivedAt: new Date(),
                receivedBy: dto.receivedBy ?? null,
                lines: {
                    create: dto.lines.map((l) => ({
                        orderLineId: l.orderLineId,
                        quantity: l.quantity,
                        destinationBinId: l.destinationBinId ?? null,
                    })),
                },
            },
            include: { lines: true },
        })

        const postingDate = order.postingDate.toISOString()
        for (const rl of dto.lines) {
            const line = order.lines.find((l) => l.id === rl.orderLineId)!
            const receiptLine = receipt.lines.find((x) => x.orderLineId === rl.orderLineId)!
            const destBin = rl.destinationBinId ?? line.destinationBinId

            await postInterWarehouseReceive({
                posting: this.posting,
                companyId: order.companyId,
                destinationWarehouseId: order.destinationWarehouseId,
                documentId: receipt.id,
                sourceDocumentType: 'STOCK_TRANSFER_RECEIPT',
                sourceModule: 'STOCK_TRANSFER',
                postingDate,
                createdBy: dto.receivedBy ?? undefined,
                line: {
                    id: receiptLine.id,
                    materialId: line.materialId,
                    quantity: rl.quantity,
                    uomId: line.uomId,
                    destinationBinId: destBin,
                    batchId: line.batchId,
                    serialNumberId: line.serialNumberId,
                },
                receivedQty: rl.quantity,
                idempotencyKey: `${receipt.id}:${receiptLine.id}:${Number(line.receivedQty)}`,
            })

            const newReceived = new Decimal(line.receivedQty).plus(rl.quantity)
            await this.prisma.mmStockTransferOrderLine.update({
                where: { id: line.id },
                data: {
                    receivedQty: newReceived,
                    status: newReceived.gte(line.quantity)
                        ? 'RECEIVED'
                        : 'PARTIALLY_RECEIVED',
                },
            })

            if (!destBin) {
                await this.warehouseBridge.createPutawayFromReceipt({
                    companyId: order.companyId,
                    warehouseId: order.destinationWarehouseId,
                    materialId: line.materialId,
                    quantity: rl.quantity,
                    batchId: line.batchId ?? undefined,
                    serialId: line.serialNumberId ?? undefined,
                    uomId: line.uomId,
                    sourceDocument: order.orderNumber,
                })
            }
        }

        const refreshed = await this.prisma.mmStockTransferOrderLine.findMany({
            where: { orderId },
        })
        const allReceived = refreshed.every((l) =>
            new Decimal(l.receivedQty).gte(l.quantity),
        )
        const anyReceived = refreshed.some((l) => new Decimal(l.receivedQty).gt(0))

        return this.prisma.mmStockTransferOrder.update({
            where: { id: orderId },
            data: {
                status: allReceived
                    ? 'CLOSED'
                    : anyReceived
                      ? 'PARTIALLY_RECEIVED'
                      : order.status,
                closedAt: allReceived ? new Date() : null,
            },
            include: {
                lines: true,
                shipments: { include: { lines: true } },
                receipts: { include: { lines: true } },
                sourceWarehouse: true,
                destinationWarehouse: true,
            },
        })
    }

    private async nextReceiptNumber() {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `TRC-${today}-`
        const last = await this.prisma.mmTransferReceipt.findFirst({
            where: { receiptNumber: { startsWith: pfx } },
            orderBy: { receiptNumber: 'desc' },
        })
        let seq = 1
        if (last) {
            const n = parseInt(last.receiptNumber.replace(pfx, ''), 10)
            if (!isNaN(n)) seq = n + 1
        }
        return `${pfx}${String(seq).padStart(5, '0')}`
    }
}
