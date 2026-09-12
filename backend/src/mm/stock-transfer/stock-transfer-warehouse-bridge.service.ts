import { Injectable, Inject, forwardRef } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { PutawayService } from '../warehouse/putaway/putaway.service'
import { WarehouseTaskService } from '../warehouse/tasks/warehouse-task.service'
import { Decimal } from '@prisma/client/runtime/library'

@Injectable()
export class StockTransferWarehouseBridgeService {
    constructor(
        private prisma: PrismaService,
        @Inject(forwardRef(() => PutawayService))
        private putaway: PutawayService,
        @Inject(forwardRef(() => WarehouseTaskService))
        private warehouseTasks: WarehouseTaskService,
    ) {}

    async createPickTasksForOrder(orderId: string) {
        const order = await this.prisma.mmStockTransferOrder.findUnique({
            where: { id: orderId },
            include: { lines: true },
        })
        if (!order) return []

        const tasks = []
        for (const line of order.lines) {
            if (!line.sourceBinId) continue
            const open = new Decimal(line.quantity).minus(line.dispatchedQty)
            if (open.lte(0)) continue

            const task = await this.warehouseTasks.create({
                companyId: order.companyId,
                warehouseId: order.sourceWarehouseId,
                taskType: 'TRANSFER',
                quantity: Number(open),
                sourceBinId: line.sourceBinId,
                destinationBinId: line.destinationBinId ?? undefined,
                materialId: line.materialId,
                batchId: line.batchId ?? undefined,
                serialId: line.serialNumberId ?? undefined,
                uomId: line.uomId,
                referenceType: 'STOCK_TRANSFER_LINE',
                referenceId: line.id,
                metadata: { orderId: order.id, orderNumber: order.orderNumber },
            })
            tasks.push(task)
        }

        if (tasks.length) {
            await this.prisma.mmStockTransferOrder.update({
                where: { id: orderId },
                data: { status: 'PICKING' },
            })
        }
        return tasks
    }

    async createPutawayFromReceipt(input: {
        companyId: string
        warehouseId: string
        materialId: string
        quantity: number
        batchId?: string
        serialId?: string
        uomId?: string
        sourceDocument?: string
    }) {
        return this.putaway.createFromEvent({
            companyId: input.companyId,
            warehouseId: input.warehouseId,
            materialId: input.materialId,
            quantity: input.quantity,
            stockStatus: 'UNRESTRICTED',
            goodsReceiptLineId: undefined,
            sourceBinId: undefined,
        })
    }
}
