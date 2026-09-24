import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { MM_DOMAIN_EVENTS } from '../mm/common/mm-domain-events.types'
import type { MmIntegrationEventEnvelope } from '../mm/common/mm-integration-event.types'
import { MmEventConsumerService } from '../mm/common/mm-event-consumer.service'
import { ProductionOrderService } from './production-order.service'

@Injectable()
export class PpMmEventConsumer {
    private readonly logger = new Logger(PpMmEventConsumer.name)

    constructor(
        private consumer: MmEventConsumerService,
        private productionOrders: ProductionOrderService,
    ) {}

    @OnEvent('mm.integration.event')
    async handleMmIntegrationEvent(envelope: MmIntegrationEventEnvelope) {
        if (envelope.eventType === MM_DOMAIN_EVENTS.GOODS_ISSUE_POSTED) {
            const poId =
                (envelope.payload.productionOrderId as string | undefined) ??
                (envelope.sourceEntityType === 'PRODUCTION_ORDER'
                    ? envelope.sourceEntityId
                    : undefined)
            if (poId) {
                await this.handleGoodsIssue(envelope, poId)
            }
        }

        if (envelope.eventType === MM_DOMAIN_EVENTS.GOODS_RECEIPT_POSTED) {
            const poId = envelope.payload.productionOrderId as string | undefined
            const outputId = envelope.payload.outputId as string | undefined
            if (poId && outputId) {
                await this.handleGoodsReceipt(envelope, poId, outputId)
            }
            return
        }

        const isPpReservationEvent =
            envelope.sourceModule === 'PRODUCTION' ||
            envelope.sourceEntityType === 'PRODUCTION_ORDER' ||
            envelope.payload.sourceDocumentType === 'PRODUCTION_ORDER'

        if (!isPpReservationEvent) return

        switch (envelope.eventType) {
            case MM_DOMAIN_EVENTS.RESERVATION_CREATED:
                await this.handleReservationCreated(envelope)
                break
            case MM_DOMAIN_EVENTS.RESERVATION_RELEASED:
                await this.handleReservationReleased(envelope)
                break
            case MM_DOMAIN_EVENTS.SHORTAGE_DETECTED:
                await this.handleShortage(envelope)
                break
            default:
                break
        }
    }

    private async handleReservationCreated(envelope: MmIntegrationEventEnvelope) {
        await this.consumer.handleIdempotent({
            consumerId: 'PP_FULFILLMENT',
            envelope,
            handler: async () => {
                const payload = envelope.payload
                const productionOrderId = String(
                    payload.sourceDocumentId ?? envelope.sourceEntityId,
                )
                const reservationHeaderId = String(payload.reservationHeaderId ?? '')
                const lines = (payload.lines as Array<Record<string, unknown>>) ?? []
                await this.productionOrders.applyReservationCreated({
                    productionOrderId,
                    reservationHeaderId,
                    lines: lines.map((l) => ({
                        lineId: String(l.demandReferenceLineId ?? l.lineId),
                        reservedQuantity: String(l.reservedQuantity ?? 0),
                        integrationStatus: String(
                            l.integrationStatus ?? payload.headerStatus ?? 'RESERVED',
                        ),
                    })),
                })
            },
        })
    }

    private async handleReservationReleased(envelope: MmIntegrationEventEnvelope) {
        await this.consumer.handleIdempotent({
            consumerId: 'PP_FULFILLMENT',
            envelope,
            handler: async () => {
                const productionOrderId = String(
                    envelope.payload.sourceDocumentId ?? envelope.sourceEntityId,
                )
                if (envelope.payload.partialLineId) {
                    await this.productionOrders.applyPartialRelease({
                        productionOrderId,
                        lineId: String(envelope.payload.partialLineId),
                        newReservedQuantity: String(
                            envelope.payload.newReservedQuantity ?? 0,
                        ),
                    })
                    return
                }
                await this.productionOrders.applyReservationReleased(productionOrderId)
            },
        })
    }

    private async handleGoodsIssue(
        envelope: MmIntegrationEventEnvelope,
        productionOrderId: string,
    ) {
        await this.consumer.handleIdempotent({
            consumerId: 'PP_FULFILLMENT',
            envelope,
            handler: async () => {
                const lines =
                    (envelope.payload.lines as Array<Record<string, unknown>>) ?? []
                await this.productionOrders.applyGoodsIssuePosted({
                    productionOrderId,
                    lines: lines
                        .map((l) => ({
                            lineId: String(l.demandReferenceLineId ?? l.lineId ?? ''),
                            issuedQuantity: String(l.quantity ?? 0),
                        }))
                        .filter((l) => l.lineId),
                })
            },
        })
    }

    private async handleGoodsReceipt(
        envelope: MmIntegrationEventEnvelope,
        productionOrderId: string,
        outputId: string,
    ) {
        await this.consumer.handleIdempotent({
            consumerId: 'PP_FULFILLMENT',
            envelope,
            handler: async () => {
                await this.productionOrders.applyGoodsReceiptPosted({
                    productionOrderId,
                    outputId,
                    goodsReceiptId: String(envelope.sourceEntityId),
                })
            },
        })
    }

    private async handleShortage(envelope: MmIntegrationEventEnvelope) {
        this.logger.warn(
            `Shortage detected for PO ${envelope.sourceEntityId}: ${JSON.stringify(envelope.payload)}`,
        )
        const lines = (envelope.payload.lines as Array<Record<string, unknown>>) ?? []
        const productionOrderId = String(
            envelope.payload.sourceDocumentId ?? envelope.sourceEntityId,
        )
        await this.productionOrders.applyReservationCreated({
            productionOrderId,
            reservationHeaderId: String(envelope.payload.reservationHeaderId ?? ''),
            lines: lines.map((l) => ({
                lineId: String(l.demandReferenceLineId ?? l.lineId),
                reservedQuantity: String(l.reservedQuantity ?? 0),
                integrationStatus: 'SHORT',
            })),
        })
    }
}
