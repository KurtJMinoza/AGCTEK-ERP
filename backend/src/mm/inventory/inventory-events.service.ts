import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { MM_DOMAIN_EVENTS, type MmDomainEventPayload } from '../common/mm-domain-events.types'

@Injectable()
export class InventoryEventsService {
    private readonly logger = new Logger(InventoryEventsService.name)

    @OnEvent('mm.domain.event')
    handleDomainEvent(event: MmDomainEventPayload) {
        this.logger.log(
            `Domain event: ${event.eventType} | doc=${event.documentType}:${event.documentId} | company=${event.companyId}`,
        )
    }

    @OnEvent(MM_DOMAIN_EVENTS.GOODS_RECEIPT_POSTED)
    handleGoodsReceiptPosted(event: MmDomainEventPayload) {
        this.logger.log(`Goods receipt posted: ${event.documentId}`)
    }

    @OnEvent(MM_DOMAIN_EVENTS.GOODS_ISSUE_POSTED)
    handleGoodsIssuePosted(event: MmDomainEventPayload) {
        this.logger.log(`Goods issue posted: ${event.documentId}`)
    }

    @OnEvent(MM_DOMAIN_EVENTS.INVENTORY_ADJUSTED)
    handleInventoryAdjusted(event: MmDomainEventPayload) {
        this.logger.log(`Inventory adjusted: ${event.documentId}`)
    }

    @OnEvent(MM_DOMAIN_EVENTS.INVENTORY_TRANSFERRED)
    handleInventoryTransferred(event: MmDomainEventPayload) {
        this.logger.log(`Inventory transferred: ${event.documentId}`)
    }

    @OnEvent(MM_DOMAIN_EVENTS.RESERVATION_CREATED)
    handleReservationCreated(event: MmDomainEventPayload) {
        this.logger.log(`Reservation created: ${event.documentId}`)
    }

    @OnEvent(MM_DOMAIN_EVENTS.RESERVATION_RELEASED)
    handleReservationReleased(event: MmDomainEventPayload) {
        this.logger.log(`Reservation released: ${event.documentId}`)
    }

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
