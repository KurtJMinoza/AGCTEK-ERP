import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { SD_EVENTS } from '../../../sd/sd-event.types'
import { MmEventConsumerService } from '../../common/mm-event-consumer.service'
import { buildIntegrationEnvelope } from '../../common/mm-integration-event.builder'
import { PrismaService } from '../../../prisma/prisma.service'
import { MM_DEMAND_MODULES } from '../demand/mm-demand.types'
import {
    sdChangedLinesFromPayload,
    sdLinesFromSalesOrderPayload,
} from '../demand/mm-demand-from-events.util'
import { MmDemandSyncService } from '../demand/mm-demand-sync.service'
import { SdIntegrationService } from './sd-integration.service'

@Injectable()
export class SdDemandListener {
    private readonly logger = new Logger(SdDemandListener.name)

    constructor(
        private sdIntegration: SdIntegrationService,
        private consumer: MmEventConsumerService,
        private demandSync: MmDemandSyncService,
        private prisma: PrismaService,
    ) {}

    @OnEvent(SD_EVENTS.SALES_ORDER_CONFIRMED)
    async onSalesOrderConfirmed(envelope: { payload: Record<string, unknown> }) {
        const mmEnvelope = buildIntegrationEnvelope({
            eventType: SD_EVENTS.SALES_ORDER_CONFIRMED,
            companyId: String(envelope.payload.companyId),
            sourceModule: 'SD',
            sourceEntityType: 'SALES_ORDER',
            sourceEntityId: String(envelope.payload.salesOrderId),
            payload: envelope.payload,
            correlationId:
                typeof envelope.payload.correlationId === 'string'
                    ? envelope.payload.correlationId
                    : undefined,
        })

        await this.consumer.handleIdempotent({
            consumerId: 'MM_SD_DEMAND',
            envelope: mmEnvelope,
            handler: async () => {
                const batch = await this.sdIntegration.checkAvailabilityBatch({
                    companyId: String(envelope.payload.companyId),
                    warehouseId: String(envelope.payload.warehouseId),
                    lines: (
                        (envelope.payload.lines as Array<Record<string, unknown>>) ?? []
                    ).map((l) => ({
                        materialId: String(l.materialId),
                        quantity: Number(l.quantity),
                        lineRef: String(l.lineId),
                    })),
                })
                if (!batch.ok) {
                    this.logger.warn(
                        `ATP short for SO ${envelope.payload.salesOrderId}`,
                    )
                }
                await this.sdIntegration.reserveFromSalesOrderPayload(
                    envelope.payload,
                )
                await this.syncDemandFromPayload(envelope.payload)
            },
        })
    }

    private async syncDemandFromPayload(payload: Record<string, unknown>) {
        const materialIds = (
            (payload.lines as Array<Record<string, unknown>>) ?? []
        ).map((l) => String(l.materialId))
        const materials = materialIds.length
            ? await this.prisma.mmMaterial.findMany({
                  where: { id: { in: materialIds } },
                  select: { id: true, baseUomId: true },
              })
            : []
        const uomMap = new Map(materials.map((m) => [m.id, m.baseUomId]))
        const lines = sdLinesFromSalesOrderPayload(payload, uomMap)
        await this.demandSync.upsertMany(lines)
    }

    @OnEvent(SD_EVENTS.SALES_ORDER_CANCELLED)
    async onSalesOrderCancelled(envelope: { payload: Record<string, unknown> }) {
        const mmEnvelope = buildIntegrationEnvelope({
            eventType: SD_EVENTS.SALES_ORDER_CANCELLED,
            companyId: String(envelope.payload.companyId),
            sourceModule: 'SD',
            sourceEntityType: 'SALES_ORDER',
            sourceEntityId: String(envelope.payload.salesOrderId),
            payload: envelope.payload,
            correlationId:
                typeof envelope.payload.correlationId === 'string'
                    ? envelope.payload.correlationId
                    : undefined,
        })

        await this.consumer.handleIdempotent({
            consumerId: 'MM_SD_DEMAND',
            envelope: mmEnvelope,
            handler: async () => {
                await this.sdIntegration.releaseBySourceDocument(
                    String(envelope.payload.salesOrderId),
                    { reason: 'ORDER_CANCELLED' },
                )
                await this.demandSync.cancelBySourceDocument(
                    MM_DEMAND_MODULES.SD,
                    'SALES_ORDER',
                    String(envelope.payload.salesOrderId),
                )
            },
        })
    }

    @OnEvent(SD_EVENTS.SALES_DEMAND_CHANGED)
    async onSalesDemandChanged(envelope: {
        payload: Record<string, unknown> & {
            changedLines?: Array<Record<string, unknown>>
        }
    }) {
        const mmEnvelope = buildIntegrationEnvelope({
            eventType: SD_EVENTS.SALES_DEMAND_CHANGED,
            companyId: String(envelope.payload.companyId),
            sourceModule: 'SD',
            sourceEntityType: 'SALES_ORDER',
            sourceEntityId: String(envelope.payload.salesOrderId),
            payload: envelope.payload,
            correlationId:
                typeof envelope.payload.correlationId === 'string'
                    ? envelope.payload.correlationId
                    : undefined,
        })

        await this.consumer.handleIdempotent({
            consumerId: 'MM_SD_DEMAND',
            envelope: mmEnvelope,
            handler: async () => {
                const changed = envelope.payload.changedLines ?? []
                await this.sdIntegration.adjustBySourceDocument(
                    String(envelope.payload.salesOrderId),
                    {
                        lines: changed.map((c) => ({
                            demandReferenceLineId: String(c.demandReferenceLineId),
                            newQuantity: Number(c.newQuantity),
                        })),
                    },
                )
                await this.syncChangedDemandFromPayload(envelope.payload)
            },
        })
    }

    private async syncChangedDemandFromPayload(
        payload: Record<string, unknown> & {
            changedLines?: Array<Record<string, unknown>>
        },
    ) {
        const materialIds = (
            (payload.changedLines as Array<Record<string, unknown>>) ?? []
        )
            .map((c) => {
                const lineId = String(c.lineId)
                const fullLine = (
                    (payload.lines as Array<Record<string, unknown>>) ?? []
                ).find((l) => String(l.lineId) === lineId)
                return fullLine ? String(fullLine.materialId) : null
            })
            .filter(Boolean) as string[]
        const materials = materialIds.length
            ? await this.prisma.mmMaterial.findMany({
                  where: { id: { in: materialIds } },
                  select: { id: true, baseUomId: true },
              })
            : []
        const uomMap = new Map(materials.map((m) => [m.id, m.baseUomId]))
        const lines = sdChangedLinesFromPayload(payload, uomMap)
        await this.demandSync.upsertMany(lines)
    }
}
