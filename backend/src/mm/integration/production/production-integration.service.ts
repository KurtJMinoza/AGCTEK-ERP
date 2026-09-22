import { Injectable, BadRequestException, Inject, Optional } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../../prisma/prisma.service'
import { InventoryAvailabilityService } from '../../inventory/inventory-availability.service'
import { ReservationEngineService } from '../../inventory/reservation-allocation/reservation-engine.service'
import { AllocationEngineService } from '../../inventory/reservation-allocation/allocation-engine.service'
import { GoodsIssueService } from '../../stock-ops/goods-issue.service'
import { GoodsReceiptService } from '../../stock-ops/goods-receipt.service'
import {
    PpAdjustDemandDto,
    PpAvailabilityBatchDto,
    PpAvailabilityCheckDateDto,
    PpAvailabilityCheckDto,
    PpIssueComponentsDto,
    PpReceiveOutputDto,
    PpReleaseBySourceDto,
    PpReserveDemandDto,
} from './dto/production-integration.dto'
import {
    PRODUCTION_ORDER_GUARD_PORT,
    type ProductionOrderGuardPort,
} from './production-order-guard.port'

const PP_SOURCE_MODULE = 'PRODUCTION'
const PP_SOURCE_DOCUMENT_TYPE = 'PRODUCTION_ORDER'

@Injectable()
export class ProductionIntegrationService {
    constructor(
        private prisma: PrismaService,
        private availability: InventoryAvailabilityService,
        private reservations: ReservationEngineService,
        private allocations: AllocationEngineService,
        private goodsIssue: GoodsIssueService,
        private goodsReceipt: GoodsReceiptService,
        @Optional()
        @Inject(PRODUCTION_ORDER_GUARD_PORT)
        private ppGuard?: ProductionOrderGuardPort,
    ) {}

    async checkAvailability(dto: PpAvailabilityCheckDto) {
        const check = await this.availability.assertAvailable(
            dto.companyId,
            dto.warehouseId,
            dto.materialId,
            dto.quantity,
            { batchId: dto.batchId, serialNumberId: dto.serialNumberId },
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

    async checkAvailabilityBatch(dto: PpAvailabilityBatchDto) {
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

    async checkAvailabilityByDate(dto: PpAvailabilityCheckDateDto) {
        const base = await this.checkAvailability(dto)
        return {
            ...base,
            requiredDate: dto.requiredDate,
            metadata: {
                note: 'Date-specific ATP uses current on-hand; projected date ATP is future enhancement.',
            },
        }
    }

    async reserveDemand(dto: PpReserveDemandDto) {
        await this.assertOrderActive(dto.sourceDocumentId)

        const header = await this.reservations.createIdempotent(
            {
                companyId: dto.companyId,
                warehouseId: dto.warehouseId,
                sourceModule: PP_SOURCE_MODULE,
                sourceDocumentType: PP_SOURCE_DOCUMENT_TYPE,
                sourceDocumentId: dto.sourceDocumentId,
                demandReferenceType: PP_SOURCE_DOCUMENT_TYPE,
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
            },
            {
                correlationId: dto.correlationId,
                causationId: dto.causationId,
            },
        )

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
        dto?: PpReleaseBySourceDto,
    ) {
        const released = await this.reservations.releaseBySourceDocument({
            sourceModule: PP_SOURCE_MODULE,
            sourceDocumentType: PP_SOURCE_DOCUMENT_TYPE,
            sourceDocumentId,
            reason: dto?.reason ?? 'ORDER_CANCELLED',
        })
        return { releasedCount: released.length, headers: released }
    }

    async adjustBySourceDocument(
        sourceDocumentId: string,
        dto: PpAdjustDemandDto,
    ) {
        await this.assertOrderActive(sourceDocumentId)
        const results = []
        for (const line of dto.lines) {
            const result = await this.reservations.adjustLineQuantityBySource({
                sourceModule: PP_SOURCE_MODULE,
                sourceDocumentType: PP_SOURCE_DOCUMENT_TYPE,
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
            sourceModule: PP_SOURCE_MODULE,
            sourceDocumentType: PP_SOURCE_DOCUMENT_TYPE,
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

    async reserveFromProductionOrderPayload(payload: Record<string, unknown>) {
        const materials =
            (payload.materials as Array<Record<string, unknown>>) ?? []
        return this.reserveDemand({
            companyId: String(payload.companyId),
            warehouseId: String(payload.warehouseId),
            sourceDocumentId: String(payload.productionOrderId),
            demandReferenceId: String(payload.productionOrderId),
            idempotencyKey:
                typeof payload.idempotencyKey === 'string'
                    ? payload.idempotencyKey
                    : `release:${payload.productionOrderId}`,
            correlationId:
                typeof payload.correlationId === 'string'
                    ? payload.correlationId
                    : undefined,
            allowPartialReservation: false,
            lines: materials.map((m) => ({
                materialId: String(m.materialId),
                quantity: Number(m.quantity),
                demandReferenceLineId: String(m.demandReferenceLineId ?? m.lineId),
            })),
        })
    }

    async issueComponents(dto: PpIssueComponentsDto) {
        const status = await this.getStatusBySourceDocument(dto.productionOrderId)
        const header = status.reservations[0]
        if (!header) {
            throw new BadRequestException('No active reservation for production order')
        }

        await this.allocations.allocateHeader(header.reservationHeaderId, {
            strategy: 'FIFO',
            generatePickTasks: false,
        })

        const reservationHeader =
            await this.prisma.mmInventoryReservationHeader.findUnique({
                where: { id: header.reservationHeaderId },
                include: { lines: { include: { material: true } } },
            })
        if (!reservationHeader) {
            throw new BadRequestException('Reservation header not found')
        }

        const gi = await this.goodsIssue.create({
            companyId: reservationHeader.companyId,
            warehouseId: reservationHeader.warehouseId,
            postingDate: new Date().toISOString(),
            documentDate: new Date().toISOString(),
            issuePurpose: 'PRODUCTION',
            sourceDocumentType: 'PRODUCTION_ORDER',
            sourceDocumentId: dto.productionOrderId,
            reservationHeaderId: header.reservationHeaderId,
            createdBy: dto.createdBy,
            lines: reservationHeader.lines.map((l) => ({
                materialId: l.materialId,
                quantity: Number(l.reservedQuantity || l.requestedQuantity),
                uomId: l.material.baseUomId,
                storageBinId: dto.storageBinId,
            })),
        })

        return this.goodsIssue.post(gi.id)
    }

    async receiveOutput(dto: PpReceiveOutputDto) {
        await this.assertOrderActive(dto.productionOrderId)

        let outputId = dto.outputId
        if (!outputId) {
            const output = await this.prisma.ppProductionOutput.create({
                data: {
                    productionOrderId: dto.productionOrderId,
                    materialId: dto.materialId,
                    quantity: new Decimal(dto.quantity),
                    status: 'REPORTED',
                },
            })
            outputId = output.id
        }

        const material = await this.prisma.mmMaterial.findUnique({
            where: { id: dto.materialId },
        })
        if (!material) throw new BadRequestException('Material not found')

        const gr = await this.goodsReceipt.create({
            companyId: dto.companyId,
            warehouseId: dto.warehouseId,
            postingDate: new Date().toISOString(),
            documentDate: new Date().toISOString(),
            receiptPurpose: 'PRODUCTION_OUTPUT',
            sourceDocumentType: 'PRODUCTION_ORDER',
            sourceDocumentId: dto.productionOrderId,
            createdBy: dto.createdBy,
            lines: [
                {
                    materialId: dto.materialId,
                    quantity: dto.quantity,
                    uomId: material.baseUomId,
                    storageBinId: dto.storageBinId,
                    unitCost: 0,
                },
            ],
        })

        const posted = await this.goodsReceipt.post(gr.id, {
            productionOrderId: dto.productionOrderId,
            outputId,
        })
        return { goodsReceipt: posted, outputId }
    }

    private async assertOrderActive(sourceDocumentId: string) {
        if (!this.ppGuard) return
        const active = await this.ppGuard.isOrderActive(sourceDocumentId)
        if (!active) {
            throw new BadRequestException('Production order cancelled or not active')
        }
    }
}
