import { Injectable, BadRequestException, Inject, Optional } from '@nestjs/common'
import { InventoryAvailabilityService } from '../../inventory/inventory-availability.service'
import { ReservationEngineService } from '../../inventory/reservation-allocation/reservation-engine.service'
import {
    SdAdjustDemandDto,
    SdAvailabilityBatchDto,
    SdAvailabilityCheckDateDto,
    SdAvailabilityCheckDto,
    SdReleaseBySourceDto,
    SdReserveDemandDto,
} from './dto/sd-integration.dto'
import { SD_ORDER_GUARD_PORT, type SdOrderGuardPort } from './sd-order-guard.port'

const SD_SOURCE_MODULE = 'SD'
const SD_SOURCE_DOCUMENT_TYPE = 'SALES_ORDER'

@Injectable()
export class SdIntegrationService {
    constructor(
        private availability: InventoryAvailabilityService,
        private reservations: ReservationEngineService,
        @Optional()
        @Inject(SD_ORDER_GUARD_PORT)
        private sdGuard?: SdOrderGuardPort,
    ) {}

    async checkAvailability(dto: SdAvailabilityCheckDto) {
        const check = await this.availability.assertAvailable(
            dto.companyId,
            dto.warehouseId,
            dto.materialId,
            dto.quantity,
            {
                batchId: dto.batchId,
                serialNumberId: dto.serialNumberId,
            },
        )
        return {
            ok: check.ok,
            available: check.available,
            required: dto.quantity,
            shortage: check.ok ? 0 : Math.max(0, dto.quantity - check.available),
            materialId: dto.materialId,
            warehouseId: dto.warehouseId,
        }
    }

    async checkAvailabilityBatch(dto: SdAvailabilityBatchDto) {
        const lines = []
        let allOk = true
        for (const line of dto.lines) {
            const result = await this.checkAvailability({
                companyId: dto.companyId,
                warehouseId: dto.warehouseId,
                materialId: line.materialId,
                quantity: line.quantity,
            })
            if (!result.ok) allOk = false
            lines.push({ ...result, lineRef: line.lineRef ?? null })
        }
        return { ok: allOk, lines }
    }

    async checkAvailabilityByDate(dto: SdAvailabilityCheckDateDto) {
        const base = await this.checkAvailability(dto)
        return {
            ...base,
            requiredDate: dto.requiredDate,
            metadata: {
                note: 'Date-specific ATP uses current on-hand; projected date ATP is future enhancement.',
            },
        }
    }

    async reserveDemand(dto: SdReserveDemandDto) {
        await this.assertOrderActive(dto.sourceDocumentId)

        const header = await this.reservations.createIdempotent({
            companyId: dto.companyId,
            warehouseId: dto.warehouseId,
            sourceModule: SD_SOURCE_MODULE,
            sourceDocumentType: SD_SOURCE_DOCUMENT_TYPE,
            sourceDocumentId: dto.sourceDocumentId,
            demandReferenceType: SD_SOURCE_DOCUMENT_TYPE,
            demandReferenceId: dto.demandReferenceId ?? dto.sourceDocumentId,
            idempotencyKey: dto.idempotencyKey,
            allowPartialReservation: dto.allowPartialReservation ?? false,
            lines: dto.lines.map((line) => ({
                materialId: line.materialId,
                quantity: line.quantity,
                batchId: line.batchId,
                serialNumberId: line.serialNumberId,
                uomId: line.uomId,
                stockStatus: line.stockStatus,
                demandReferenceLineId: line.demandReferenceLineId,
            })),
        }, {
            correlationId: dto.correlationId,
            causationId: dto.causationId,
        })

        return {
            reservationHeaderId: header.id,
            reservationNumber: header.reservationNumber,
            status: header.status,
            lines: header.lines.map((l) => ({
                lineId: l.id,
                demandReferenceLineId: l.demandReferenceLineId,
                materialId: l.materialId,
                requestedQuantity: l.requestedQuantity.toString(),
                reservedQuantity: l.reservedQuantity.toString(),
                status: l.status,
            })),
        }
    }

    async releaseBySourceDocument(
        sourceDocumentId: string,
        dto?: SdReleaseBySourceDto,
    ) {
        const released = await this.reservations.releaseBySourceDocument({
            sourceModule: SD_SOURCE_MODULE,
            sourceDocumentType: SD_SOURCE_DOCUMENT_TYPE,
            sourceDocumentId,
            reason: dto?.reason ?? 'ORDER_CANCELLED',
        })
        return { releasedCount: released.length, headers: released }
    }

    async adjustBySourceDocument(
        sourceDocumentId: string,
        dto: SdAdjustDemandDto,
    ) {
        await this.assertOrderActive(sourceDocumentId)
        const results = []
        for (const line of dto.lines) {
            const result = await this.reservations.adjustLineQuantityBySource({
                sourceModule: SD_SOURCE_MODULE,
                sourceDocumentType: SD_SOURCE_DOCUMENT_TYPE,
                sourceDocumentId,
                demandReferenceLineId: line.demandReferenceLineId,
                newQuantity: line.newQuantity,
            })
            results.push(result)
        }
        return { adjustments: results }
    }

    async getStatusBySourceDocument(sourceDocumentId: string) {
        const headers = await this.reservations.findBySourceDocument({
            sourceModule: SD_SOURCE_MODULE,
            sourceDocumentType: SD_SOURCE_DOCUMENT_TYPE,
            sourceDocumentId,
        })
        return {
            sourceDocumentId,
            reservations: headers.map((h) => ({
                reservationHeaderId: h.id,
                reservationNumber: h.reservationNumber,
                status: h.status,
                lines: h.lines.map((l) => ({
                    lineId: l.id,
                    demandReferenceLineId: l.demandReferenceLineId,
                    materialId: l.materialId,
                    requestedQuantity: l.requestedQuantity.toString(),
                    reservedQuantity: l.reservedQuantity.toString(),
                    allocatedQuantity: l.allocatedQuantity.toString(),
                    issuedQuantity: l.issuedQuantity.toString(),
                    status: l.status,
                })),
                allocations: h.allocations.map((a) => ({
                    allocationId: a.id,
                    allocationNumber: a.allocationNumber,
                    status: a.status,
                })),
            })),
        }
    }

    async reserveFromSalesOrderPayload(payload: Record<string, unknown>) {
        const lines = (payload.lines as Array<Record<string, unknown>>) ?? []
        return this.reserveDemand({
            companyId: String(payload.companyId),
            warehouseId: String(payload.warehouseId),
            sourceDocumentId: String(payload.salesOrderId),
            demandReferenceId: String(payload.salesOrderId),
            idempotencyKey:
                typeof payload.idempotencyKey === 'string'
                    ? payload.idempotencyKey
                    : `confirm:${payload.salesOrderId}`,
            correlationId:
                typeof payload.correlationId === 'string'
                    ? payload.correlationId
                    : undefined,
            allowPartialReservation: false,
            lines: lines.map((l) => ({
                materialId: String(l.materialId),
                quantity: Number(l.quantity),
                demandReferenceLineId: String(l.demandReferenceLineId ?? l.lineId),
            })),
        })
    }

    private async assertOrderActive(sourceDocumentId: string) {
        if (!this.sdGuard) return
        const active = await this.sdGuard.isOrderActive(sourceDocumentId)
        if (!active) {
            throw new BadRequestException('Sales order cancelled or not active')
        }
    }
}
