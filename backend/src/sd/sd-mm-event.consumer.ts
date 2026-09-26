import { Injectable, Logger } from '@nestjs/common'

import { OnEvent } from '@nestjs/event-emitter'

import { MM_DOMAIN_EVENTS } from '../mm/common/mm-domain-events.types'

import type { MmIntegrationEventEnvelope } from '../mm/common/mm-integration-event.types'

import { MmEventConsumerService } from '../mm/common/mm-event-consumer.service'

import { SalesOrderService } from './sales-order.service'



@Injectable()

export class SdMmEventConsumer {

    private readonly logger = new Logger(SdMmEventConsumer.name)



    constructor(

        private consumer: MmEventConsumerService,

        private salesOrders: SalesOrderService,

    ) {}



    @OnEvent('mm.integration.event')

    async handleMmIntegrationEvent(envelope: MmIntegrationEventEnvelope) {

        if (envelope.eventType === MM_DOMAIN_EVENTS.GOODS_ISSUE_POSTED) {

            const soId =

                (envelope.payload.salesOrderId as string | undefined) ??

                (envelope.sourceEntityType === 'SALES_ORDER'

                    ? envelope.sourceEntityId

                    : undefined)

            if (soId) {

                await this.handleGoodsIssue(envelope, soId)

            }

            return

        }



        const isSdReservationEvent =

            envelope.sourceModule === 'SD' ||

            envelope.sourceEntityType === 'SALES_ORDER' ||

            envelope.payload.sourceDocumentType === 'SALES_ORDER'



        if (!isSdReservationEvent) return



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

            consumerId: 'SD_FULFILLMENT',

            envelope,

            handler: async () => {

                const payload = envelope.payload

                const salesOrderId = String(

                    payload.sourceDocumentId ?? envelope.sourceEntityId,

                )

                const reservationHeaderId = String(

                    payload.reservationHeaderId ?? envelope.payload.reservationId ?? '',

                )

                const lines = (payload.lines as Array<Record<string, unknown>>) ?? []

                await this.salesOrders.applyReservationCreated({

                    salesOrderId,

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

            consumerId: 'SD_FULFILLMENT',

            envelope,

            handler: async () => {

                const salesOrderId = String(

                    envelope.payload.sourceDocumentId ?? envelope.sourceEntityId,

                )

                if (envelope.payload.partialLineId) {

                    await this.salesOrders.applyPartialRelease({

                        salesOrderId,

                        lineId: String(envelope.payload.partialLineId),

                        newReservedQuantity: String(

                            envelope.payload.newReservedQuantity ?? 0,

                        ),

                    })

                    return

                }

                await this.salesOrders.applyReservationReleased(

                    salesOrderId,

                    String(envelope.payload.reason ?? 'RELEASED'),

                )

            },

        })

    }



    private async handleGoodsIssue(

        envelope: MmIntegrationEventEnvelope,

        salesOrderId: string,

    ) {

        await this.consumer.handleIdempotent({

            consumerId: 'SD_FULFILLMENT',

            envelope,

            handler: async () => {

                const lines =

                    (envelope.payload.lines as Array<Record<string, unknown>>) ??

                    []

                await this.salesOrders.applyGoodsIssuePosted({

                    salesOrderId,

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



    private async handleShortage(envelope: MmIntegrationEventEnvelope) {

        this.logger.warn(

            `Shortage detected for SO ${envelope.sourceEntityId}: ${JSON.stringify(envelope.payload)}`,

        )

        const lines = (envelope.payload.lines as Array<Record<string, unknown>>) ?? []

        const salesOrderId = String(

            envelope.payload.sourceDocumentId ?? envelope.sourceEntityId,

        )

        await this.salesOrders.applyReservationCreated({

            salesOrderId,

            reservationHeaderId: String(envelope.payload.reservationHeaderId ?? ''),

            lines: lines.map((l) => ({

                lineId: String(l.demandReferenceLineId ?? l.lineId),

                reservedQuantity: String(l.reservedQuantity ?? 0),

                integrationStatus: 'SHORT',

            })),

        })

    }

}



