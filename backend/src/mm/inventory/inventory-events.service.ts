import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'

@Injectable()
export class InventoryEventsService {
    private readonly logger = new Logger(InventoryEventsService.name)

    @OnEvent('inventory.transaction.posted')
    handleTransactionPosted(payload: any) {
        this.logger.log(
            `Transaction posted: ${payload.transactionNumber} | ` +
            `${payload.movementType} | qty=${payload.quantity} | ` +
            `material=${payload.materialId}`,
        )
    }

    @OnEvent('inventory.transaction.reversed')
    handleTransactionReversed(payload: { reversal: any; original: any }) {
        this.logger.log(
            `Transaction reversed: ${payload.original.transactionNumber} → ` +
            `${payload.reversal.transactionNumber}`,
        )
    }

    @OnEvent('inventory.stock.changed')
    handleStockChanged(payload: {
        materialId: string
        warehouseId: string
        storageBinId?: string | null
        stockStatus: string
        oldQty?: string
        newQty?: string
    }) {
        this.logger.log(
            `Stock changed: material=${payload.materialId} ` +
            `warehouse=${payload.warehouseId} ` +
            `status=${payload.stockStatus} ` +
            `${payload.oldQty ?? '?'} → ${payload.newQty ?? '?'}`,
        )
    }
}
