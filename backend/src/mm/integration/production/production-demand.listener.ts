import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { PP_EVENTS } from '../../../pp/pp-event.types'
import { MmEventConsumerService } from '../../common/mm-event-consumer.service'
import { buildIntegrationEnvelope } from '../../common/mm-integration-event.builder'
import { PrismaService } from '../../../prisma/prisma.service'
import { MM_DEMAND_MODULES } from '../demand/mm-demand.types'
import {
    productionChangedLinesFromPayload,
    productionLinesFromOrderPayload,
} from '../demand/mm-demand-from-events.util'
import { MmDemandSyncService } from '../demand/mm-demand-sync.service'
import { ProductionIntegrationService } from './production-integration.service'

@Injectable()
export class ProductionDemandListener {
    private readonly logger = new Logger(ProductionDemandListener.name)

    constructor(
        private ppIntegration: ProductionIntegrationService,
        private consumer: MmEventConsumerService,
        private demandSync: MmDemandSyncService,
        private prisma: PrismaService,
    ) {}

    @OnEvent(PP_EVENTS.PRODUCTION_ORDER_RELEASED)
    async onProductionOrderReleased(envelope: { payload: Record<string, unknown> }) {
        const mmEnvelope = buildIntegrationEnvelope({
            eventType: PP_EVENTS.PRODUCTION_ORDER_RELEASED,
            companyId: String(envelope.payload.companyId),
            sourceModule: 'PRODUCTION',
            sourceEntityType: 'PRODUCTION_ORDER',
            sourceEntityId: String(envelope.payload.productionOrderId),
            payload: envelope.payload,
            correlationId:
                typeof envelope.payload.correlationId === 'string'
                    ? envelope.payload.correlationId
                    : undefined,
        })

        await this.consumer.handleIdempotent({
            consumerId: 'MM_PP_DEMAND',
            envelope: mmEnvelope,
            handler: async () => {
                const materials =
                    (envelope.payload.materials as Array<Record<string, unknown>>) ?? []
                const batch = await this.ppIntegration.checkAvailabilityBatch({
                    companyId: String(envelope.payload.companyId),
                    warehouseId: String(envelope.payload.warehouseId),
                    lines: materials.map((m) => ({
                        materialId: String(m.materialId),
                        quantity: Number(m.quantity),
                        lineRef: String(m.lineId),
                    })),
                })
                if (!batch.ok) {
                    this.logger.warn(
                        `ATP short for PO ${envelope.payload.productionOrderId}`,
                    )
                }
            },
        })
    }

    @OnEvent(PP_EVENTS.PRODUCTION_MATERIAL_REQUIREMENT_CREATED)
    async onMaterialRequirementCreated(envelope: {
        payload: Record<string, unknown>
    }) {
        const mmEnvelope = buildIntegrationEnvelope({
            eventType: PP_EVENTS.PRODUCTION_MATERIAL_REQUIREMENT_CREATED,
            companyId: String(envelope.payload.companyId),
            sourceModule: 'PRODUCTION',
            sourceEntityType: 'PRODUCTION_ORDER',
            sourceEntityId: String(envelope.payload.productionOrderId),
            payload: envelope.payload,
            correlationId:
                typeof envelope.payload.correlationId === 'string'
                    ? envelope.payload.correlationId
                    : undefined,
        })

        await this.consumer.handleIdempotent({
            consumerId: 'MM_PP_DEMAND',
            envelope: mmEnvelope,
            handler: async () => {
                await this.ppIntegration.reserveFromProductionOrderPayload(
                    envelope.payload,
                )
                await this.syncDemandFromPayload(envelope.payload)
            },
        })
    }

    private async syncDemandFromPayload(payload: Record<string, unknown>) {
        const materialIds = (
            (payload.materials as Array<Record<string, unknown>>) ?? []
        ).map((m) => String(m.materialId))
        const materials = materialIds.length
            ? await this.prisma.mmMaterial.findMany({
                  where: { id: { in: materialIds } },
                  select: { id: true, baseUomId: true },
              })
            : []
        const uomMap = new Map(materials.map((m) => [m.id, m.baseUomId]))
        const lines = productionLinesFromOrderPayload(payload, uomMap)
        await this.demandSync.upsertMany(lines)
    }

    @OnEvent(PP_EVENTS.PRODUCTION_ORDER_CANCELLED)
    async onProductionOrderCancelled(envelope: { payload: Record<string, unknown> }) {
        const mmEnvelope = buildIntegrationEnvelope({
            eventType: PP_EVENTS.PRODUCTION_ORDER_CANCELLED,
            companyId: String(envelope.payload.companyId),
            sourceModule: 'PRODUCTION',
            sourceEntityType: 'PRODUCTION_ORDER',
            sourceEntityId: String(envelope.payload.productionOrderId),
            payload: envelope.payload,
            correlationId:
                typeof envelope.payload.correlationId === 'string'
                    ? envelope.payload.correlationId
                    : undefined,
        })

        await this.consumer.handleIdempotent({
            consumerId: 'MM_PP_DEMAND',
            envelope: mmEnvelope,
            handler: async () => {
                await this.ppIntegration.releaseBySourceDocument(
                    String(envelope.payload.productionOrderId),
                    { reason: 'ORDER_CANCELLED' },
                )
                await this.demandSync.cancelBySourceDocument(
                    MM_DEMAND_MODULES.PRODUCTION,
                    'PRODUCTION_ORDER',
                    String(envelope.payload.productionOrderId),
                )
            },
        })
    }

    @OnEvent(PP_EVENTS.PRODUCTION_MATERIAL_REQUIREMENT_CHANGED)
    async onMaterialRequirementChanged(envelope: {
        payload: Record<string, unknown> & {
            changedMaterials?: Array<Record<string, unknown>>
        }
    }) {
        const mmEnvelope = buildIntegrationEnvelope({
            eventType: PP_EVENTS.PRODUCTION_MATERIAL_REQUIREMENT_CHANGED,
            companyId: String(envelope.payload.companyId),
            sourceModule: 'PRODUCTION',
            sourceEntityType: 'PRODUCTION_ORDER',
            sourceEntityId: String(envelope.payload.productionOrderId),
            payload: envelope.payload,
            correlationId:
                typeof envelope.payload.correlationId === 'string'
                    ? envelope.payload.correlationId
                    : undefined,
        })

        await this.consumer.handleIdempotent({
            consumerId: 'MM_PP_DEMAND',
            envelope: mmEnvelope,
            handler: async () => {
                const changed = envelope.payload.changedMaterials ?? []
                await this.ppIntegration.adjustBySourceDocument(
                    String(envelope.payload.productionOrderId),
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
            changedMaterials?: Array<Record<string, unknown>>
        },
    ) {
        const materialIds = (
            (payload.changedMaterials as Array<Record<string, unknown>>) ?? []
        )
            .map((c) => {
                const lineId = String(c.lineId)
                const fullLine = (
                    (payload.materials as Array<Record<string, unknown>>) ?? []
                ).find((m) => String(m.lineId) === lineId)
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
        const lines = productionChangedLinesFromPayload(payload, uomMap)
        await this.demandSync.upsertMany(lines)
    }
}
