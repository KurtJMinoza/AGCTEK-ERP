import {
    Injectable,
    BadRequestException,
    ConflictException,
    Inject,
    forwardRef,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PrismaService } from '../../prisma/prisma.service'
import { InventoryPostingService } from '../inventory/inventory-posting.service'
import { MmDomainEventsService } from '../common/mm-domain-events.service'
import { MM_DOMAIN_EVENTS } from '../common/mm-domain-events.types'
import { SupplierReturnService } from '../returns-disposal/supplier-return.service'
import { UsageDecisionDto } from './dto/receiving.dto'
import { Decimal } from '@prisma/client/runtime/library'
import { postingKey } from '../common/idempotency.util'
import { DECISION_STOCK_TARGETS } from '../quality/quality.constants'
import { NonconformanceService } from '../quality/nonconformance.service'
import { QualityWorkflowService } from '../quality/quality-workflow.service'

@Injectable()
export class QualityDecisionService {
    constructor(
        private prisma: PrismaService,
        private posting: InventoryPostingService,
        private events: EventEmitter2,
        private domainEvents: MmDomainEventsService,
        @Inject(forwardRef(() => SupplierReturnService))
        private supplierReturn: SupplierReturnService,
        @Inject(forwardRef(() => NonconformanceService))
        private nonconformance: NonconformanceService,
        private qualityWorkflow: QualityWorkflowService,
    ) {}

    async applyDecision(
        lot: {
            id: string
            companyId: string
            warehouseId: string
            goodsReceiptId: string
            goodsReceiptLineId: string
            materialId: string
            quantity: any
            decidedQuantity?: any
            legacyQualityInspectionId?: string | null
        },
        dto: UsageDecisionDto & { idempotencyKey?: string; reason?: string },
    ) {
        let code = dto.decisionCode.toUpperCase()
        if (code === 'REJECT') code = 'BLOCK'

        const targetMap = DECISION_STOCK_TARGETS
        if (!targetMap[code]) {
            throw new BadRequestException(`Invalid decision code: ${dto.decisionCode}`)
        }

        if (dto.idempotencyKey) {
            const existing = await this.prisma.mmQualityDecision.findUnique({
                where: { idempotencyKey: dto.idempotencyKey },
            })
            if (existing) {
                const existingLot = await this.prisma.mmInspectionLot.findUnique({
                    where: { id: lot.id },
                })
                return { lot: existingLot, decision: existing, idempotent: true }
            }
        }

        const qty = new Decimal(dto.quantity)
        if (qty.lte(0)) throw new BadRequestException('Decision quantity must be positive')

        const lotQty = new Decimal(lot.quantity)
        const alreadyDecided = new Decimal(lot.decidedQuantity ?? 0)
        const remaining = lotQty.minus(alreadyDecided)
        if (qty.gt(remaining)) {
            throw new BadRequestException(
                `Decision quantity exceeds remaining lot quantity (${remaining})`,
            )
        }

        const workflowId = await this.qualityWorkflow.requireApprovalIfConfigured({
            companyId: lot.companyId,
            entityType: 'INSPECTION_LOT_DECISION',
            entityId: lot.id,
            decisionCode: code,
            quantity: Number(qty),
            initiatedBy: dto.decidedBy,
        })
        if (workflowId) {
            throw new BadRequestException(
                `Usage decision requires workflow approval (instance ${workflowId})`,
            )
        }

        const gr = await this.prisma.mmGoodsReceipt.findUnique({
            where: { id: lot.goodsReceiptId },
            include: {
                lines: { include: { material: true, uom: true } },
                supplier: true,
            },
        })
        if (!gr) throw new BadRequestException('Linked goods receipt not found')

        const grLine = gr.lines.find((l) => l.id === lot.goodsReceiptLineId)
        if (!grLine) throw new BadRequestException('GR line not found for inspection lot')

        const targetStatus = targetMap[code]
        const postingDate = gr.postingDate.toISOString()
        const documentDate = gr.documentDate.toISOString()
        const idemSuffix = dto.idempotencyKey ?? `${code}-${Date.now()}`

        await this.posting.postTransaction({
            companyId: gr.companyId,
            warehouseId: gr.warehouseId,
            storageBinId: grLine.storageBinId ?? undefined,
            materialId: grLine.materialId,
            batchId: grLine.batchId ?? undefined,
            serialNumberId: grLine.serialNumberId ?? undefined,
            stockStatus: 'QUALITY_INSPECTION',
            movementType: 'TRANSFER_OUT',
            quantity: Number(qty),
            uomId: grLine.uomId,
            unitCost: Number(grLine.unitCost),
            postingDate,
            documentDate,
            sourceModule: 'QUALITY',
            sourceDocumentType: 'INSPECTION_LOT',
            sourceDocumentId: lot.id,
            idempotencyKey: postingKey('il', lot.id, grLine.id, `${idemSuffix}-out`),
            createdBy: dto.decidedBy,
        })

        await this.posting.postTransaction({
            companyId: gr.companyId,
            warehouseId: gr.warehouseId,
            storageBinId: grLine.storageBinId ?? undefined,
            materialId: grLine.materialId,
            batchId: grLine.batchId ?? undefined,
            serialNumberId: grLine.serialNumberId ?? undefined,
            stockStatus: targetStatus,
            movementType: 'TRANSFER_IN',
            quantity: Number(qty),
            uomId: grLine.uomId,
            unitCost: Number(grLine.unitCost),
            postingDate,
            documentDate,
            sourceModule: 'QUALITY',
            sourceDocumentType: 'INSPECTION_LOT',
            sourceDocumentId: lot.id,
            idempotencyKey: postingKey('il', lot.id, grLine.id, `${idemSuffix}-in`),
            createdBy: dto.decidedBy,
        })

        let supplierReturnId: string | null = null
        if (code === 'RETURN' && gr.supplierId) {
            const ret = await this.supplierReturn.create({
                companyId: gr.companyId,
                supplierId: gr.supplierId,
                warehouseId: gr.warehouseId,
                goodsReceiptId: gr.id,
                purchaseOrderId: gr.purchaseOrderId ?? undefined,
                reason: dto.notes ?? dto.reason ?? 'Quality inspection return',
                lines: [
                    {
                        materialId: grLine.materialId,
                        uomId: grLine.uomId,
                        quantity: Number(qty),
                        unitCost: Number(grLine.unitCost),
                        batchId: grLine.batchId ?? undefined,
                        serialNumberId: grLine.serialNumberId ?? undefined,
                        storageBinId: grLine.storageBinId ?? undefined,
                        goodsReceiptLineId: grLine.id,
                        reason: 'QUALITY_RETURN',
                        stockStatus: 'QUARANTINE',
                    },
                ],
            })
            supplierReturnId = ret.id
            void this.domainEvents.emit({
                eventType: MM_DOMAIN_EVENTS.SUPPLIER_RETURN_REQUESTED,
                companyId: gr.companyId,
                sourceModule: 'QUALITY',
                documentType: 'SUPPLIER_RETURN',
                documentId: ret.id,
                occurredAt: new Date().toISOString(),
                payload: { inspectionLotId: lot.id, quantity: Number(qty) },
            })
        }

        let decision
        try {
            decision = await this.prisma.mmQualityDecision.create({
                data: {
                    inspectionLotId: lot.id,
                    decisionCode: code,
                    quantity: qty,
                    reason: dto.reason ?? null,
                    deviationReason: dto.deviationReason ?? null,
                    decidedBy: dto.decidedBy ?? null,
                    targetStockStatus: targetStatus,
                    supplierReturnId,
                    idempotencyKey: dto.idempotencyKey ?? null,
                    notes: dto.notes ?? null,
                },
            })
        } catch (e: any) {
            if (e?.code === 'P2002' && dto.idempotencyKey) {
                throw new ConflictException('Duplicate usage decision request')
            }
            throw e
        }

        let result = 'PASS'
        if (['BLOCK', 'RETURN'].includes(code)) result = 'FAIL'
        else if (code === 'REWORK') result = 'PARTIAL_PASS'
        else if (code === 'ACCEPT_WITH_DEVIATION') result = 'PARTIAL_PASS'

        const newDecidedQty = alreadyDecided.plus(qty)
        const lotClosed = newDecidedQty.gte(lotQty)
        const nextStatus = lotClosed ? 'CLOSED' : 'DECIDED'

        const updatedLot = await this.prisma.mmInspectionLot.update({
            where: { id: lot.id },
            data: {
                status: nextStatus,
                result,
                decidedQuantity: newDecidedQty,
                inspectedBy: dto.decidedBy ?? null,
                inspectedAt: new Date(),
                remarks: dto.notes ?? null,
            },
        })

        if (lot.legacyQualityInspectionId) {
            await this.prisma.mmQualityInspection.update({
                where: { id: lot.legacyQualityInspectionId },
                data: {
                    status: 'COMPLETED',
                    result,
                    inspectedBy: dto.decidedBy ?? null,
                    inspectedAt: new Date(),
                },
            })
        }

        if (['ACCEPT', 'ACCEPT_WITH_DEVIATION'].includes(code)) {
            void this.domainEvents.emit({
                eventType: MM_DOMAIN_EVENTS.PUTAWAY_REQUESTED,
                companyId: gr.companyId,
                sourceModule: 'QUALITY',
                documentType: 'INSPECTION_LOT',
                documentId: lot.id,
                occurredAt: new Date().toISOString(),
                payload: {
                    warehouseId: gr.warehouseId,
                    materialId: grLine.materialId,
                    quantity: Number(qty),
                    storageBinId: grLine.storageBinId,
                    goodsReceiptLineId: grLine.id,
                    stockStatus: 'UNRESTRICTED',
                },
            })
            void this.domainEvents.emit({
                eventType: MM_DOMAIN_EVENTS.QUALITY_ACCEPTED,
                companyId: gr.companyId,
                sourceModule: 'QUALITY',
                documentType: 'INSPECTION_LOT',
                documentId: lot.id,
                occurredAt: new Date().toISOString(),
                payload: {
                    decisionCode: code,
                    quantity: Number(qty),
                    supplierId: gr.supplierId,
                },
            })
        }

        if (['BLOCK', 'RETURN', 'REWORK'].includes(code)) {
            void this.domainEvents.emit({
                eventType: MM_DOMAIN_EVENTS.QUALITY_REJECTED,
                companyId: gr.companyId,
                sourceModule: 'QUALITY',
                documentType: 'INSPECTION_LOT',
                documentId: lot.id,
                occurredAt: new Date().toISOString(),
                payload: {
                    decisionCode: code,
                    quantity: Number(qty),
                    supplierId: gr.supplierId,
                },
            })
            if (gr.supplierId) {
                void this.domainEvents.emit({
                    eventType: MM_DOMAIN_EVENTS.SUPPLIER_QUALITY_INCIDENT,
                    companyId: gr.companyId,
                    sourceModule: 'QUALITY',
                    documentType: 'INSPECTION_LOT',
                    documentId: lot.id,
                    occurredAt: new Date().toISOString(),
                    payload: {
                        supplierId: gr.supplierId,
                        decisionCode: code,
                        quantity: Number(qty),
                        materialId: grLine.materialId,
                    },
                })
            }
            if (code === 'BLOCK') {
                await this.nonconformance.create({
                    companyId: gr.companyId,
                    inspectionLotId: lot.id,
                    cause: dto.reason ?? 'Quality block decision',
                    severity: 'HIGH',
                    affectedQuantity: Number(qty),
                    responsibleParty: gr.supplierId ?? undefined,
                    createdBy: dto.decidedBy,
                })
            }
        }

        void this.domainEvents.emit({
            eventType: MM_DOMAIN_EVENTS.USAGE_DECISION_RECORDED,
            companyId: gr.companyId,
            sourceModule: 'QUALITY',
            documentType: 'INSPECTION_LOT',
            documentId: lot.id,
            occurredAt: new Date().toISOString(),
            payload: {
                decisionCode: code,
                quantity: Number(qty),
                targetStockStatus: targetStatus,
                result,
            },
        })

        void this.domainEvents.qualityDecisionMade({
            companyId: gr.companyId,
            inspectionId: lot.id,
            payload: {
                decisionCode: code,
                quantity: Number(qty),
                targetStockStatus: targetStatus,
                result,
            },
        })

        this.events.emit('quality.inspection.completed', {
            inspectionId: lot.id,
            result,
            decisionCode: code,
            quantity: Number(qty),
        })

        return { lot: updatedLot, decision }
    }
}
