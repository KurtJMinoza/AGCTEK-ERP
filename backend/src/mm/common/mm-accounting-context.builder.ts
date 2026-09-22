import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
    MM_ACCOUNTING_EFFECT_HINTS,
    type MmAccountingEffectHint,
    type MmAccountingEventPayloadV2,
    type MmAccountingLineContext,
    type MmAccountingStandaloneInput,
} from './mm-accounting-event.types'
import type { MmIntegrationEventEnvelope } from './mm-integration-event.types'

type TransactionClient = Prisma.TransactionClient

type RawLine = {
    materialId: string
    warehouseId?: string | null
    movementType?: string
    quantity?: number
    unitCost?: number
    totalCost?: number
    costCenterId?: string | null
}

const DEFAULT_CURRENCY = 'USD'

const EFFECTS_BY_EVENT: Record<string, MmAccountingEffectHint[]> = {
    GoodsReceiptPosted: [
        MM_ACCOUNTING_EFFECT_HINTS.INVENTORY_INCREASE,
        MM_ACCOUNTING_EFFECT_HINTS.GRIR_ACCRUAL,
    ],
    GoodsReceiptReversed: [MM_ACCOUNTING_EFFECT_HINTS.REVERSAL],
    GoodsIssuePosted: [
        MM_ACCOUNTING_EFFECT_HINTS.INVENTORY_DECREASE,
        MM_ACCOUNTING_EFFECT_HINTS.COGS_EXPENSE,
    ],
    GoodsIssueReversed: [MM_ACCOUNTING_EFFECT_HINTS.REVERSAL],
    InventoryAdjusted: [MM_ACCOUNTING_EFFECT_HINTS.INVENTORY_ADJUSTMENT],
    InventoryTransferred: [MM_ACCOUNTING_EFFECT_HINTS.TRANSFER_CLEARING],
    SupplierReturnPosted: [
        MM_ACCOUNTING_EFFECT_HINTS.INVENTORY_DECREASE,
        MM_ACCOUNTING_EFFECT_HINTS.GRIR_REVERSAL,
    ],
    SupplierReturnReversed: [MM_ACCOUNTING_EFFECT_HINTS.REVERSAL],
    DisposalPosted: [
        MM_ACCOUNTING_EFFECT_HINTS.INVENTORY_DECREASE,
        MM_ACCOUNTING_EFFECT_HINTS.INVENTORY_LOSS,
    ],
    ScrapPosted: [
        MM_ACCOUNTING_EFFECT_HINTS.INVENTORY_DECREASE,
        MM_ACCOUNTING_EFFECT_HINTS.INVENTORY_LOSS,
    ],
    DisposalReversed: [MM_ACCOUNTING_EFFECT_HINTS.REVERSAL],
    InventoryValuationUpdated: [MM_ACCOUNTING_EFFECT_HINTS.INVENTORY_REVALUATION],
    InventoryRevaluationPosted: [
        MM_ACCOUNTING_EFFECT_HINTS.INVENTORY_REVALUATION,
    ],
    InventoryValuationReversed: [MM_ACCOUNTING_EFFECT_HINTS.REVERSAL],
    LandedCostAllocated: [MM_ACCOUNTING_EFFECT_HINTS.LANDED_COST],
    PriceVariancePosted: [MM_ACCOUNTING_EFFECT_HINTS.PRICE_VARIANCE],
    CustomerReturnPosted: [
        MM_ACCOUNTING_EFFECT_HINTS.INVENTORY_INCREASE,
    ],
    InventoryTransactionReversed: [MM_ACCOUNTING_EFFECT_HINTS.REVERSAL],
}

const MOVEMENT_BY_EVENT: Record<string, string> = {
    GoodsReceiptPosted: 'RECEIPT',
    GoodsReceiptReversed: 'RECEIPT_REVERSAL',
    GoodsIssuePosted: 'ISSUE',
    GoodsIssueReversed: 'ISSUE_REVERSAL',
    InventoryAdjusted: 'ADJUSTMENT',
    InventoryTransferred: 'TRANSFER',
    SupplierReturnPosted: 'RETURN_OUT',
    SupplierReturnReversed: 'RETURN_OUT_REVERSAL',
    DisposalPosted: 'SCRAP',
    ScrapPosted: 'SCRAP',
    DisposalReversed: 'SCRAP_REVERSAL',
    InventoryValuationUpdated: 'REVALUATION',
    InventoryRevaluationPosted: 'REVALUATION',
    LandedCostAllocated: 'LANDED_COST',
    PriceVariancePosted: 'PRICE_VARIANCE',
    CustomerReturnPosted: 'RETURN_IN',
}

@Injectable()
export class MmAccountingContextBuilder {
    constructor(private prisma: PrismaService) {}

    resolveEffects(
        eventType: string,
        payload?: Record<string, unknown>,
    ): MmAccountingEffectHint[] {
        if (Array.isArray(payload?.accountingEffects)) {
            return payload.accountingEffects as MmAccountingEffectHint[]
        }
        if (typeof payload?.eventHint === 'string') {
            const hint = payload.eventHint as string
            if (hint.includes('PRICE_VARIANCE')) {
                return [MM_ACCOUNTING_EFFECT_HINTS.PRICE_VARIANCE]
            }
            if (hint.includes('LANDED_COST')) {
                return [MM_ACCOUNTING_EFFECT_HINTS.LANDED_COST]
            }
            if (hint.includes('REVALUATION')) {
                return [MM_ACCOUNTING_EFFECT_HINTS.INVENTORY_REVALUATION]
            }
            if (hint.includes('COGS')) {
                return [
                    MM_ACCOUNTING_EFFECT_HINTS.INVENTORY_DECREASE,
                    MM_ACCOUNTING_EFFECT_HINTS.COGS_EXPENSE,
                ]
            }
            if (hint.includes('ADJUSTMENT')) {
                return [MM_ACCOUNTING_EFFECT_HINTS.INVENTORY_ADJUSTMENT]
            }
            if (hint.includes('REVERSAL')) {
                return [MM_ACCOUNTING_EFFECT_HINTS.REVERSAL]
            }
        }
        return EFFECTS_BY_EVENT[eventType] ?? []
    }

    async buildFromEnvelope(
        envelope: MmIntegrationEventEnvelope,
        tx?: TransactionClient,
    ): Promise<MmAccountingEventPayloadV2> {
        const db = tx ?? this.prisma
        const payload = envelope.payload as Record<string, unknown>
        const rawLines = this.extractRawLines(payload)
        const lines = await this.enrichLines(db, rawLines, envelope.eventType)
        const postingDate = this.resolvePostingDate(payload, envelope.occurredAt)
        const currencyCode = await this.resolveCurrency(
            db,
            envelope.companyId,
            rawLines,
        )
        const accountingEffects = this.resolveEffects(
            envelope.eventType,
            payload,
        )
        const totalValue = lines.reduce((sum, l) => sum + l.totalCost, 0)
        const plantId =
            envelope.plantId ??
            lines.find((l) => l.plantId)?.plantId ??
            null

        return {
            ...payload,
            schemaVersion: 'v2',
            eventType: envelope.eventType,
            companyId: envelope.companyId,
            plantId,
            postingDate,
            transactionDate: postingDate,
            currencyCode,
            documentType: envelope.sourceEntityType,
            documentId: envelope.sourceEntityId,
            sourceModule: envelope.sourceModule,
            accountingEffects,
            lines,
            financiallyRelevant:
                payload.financiallyRelevant !== false &&
                accountingEffects.length > 0,
            sourceEventId: envelope.eventId,
            correlationId: envelope.correlationId,
            totalValue,
            issuePurpose:
                typeof payload.issuePurpose === 'string'
                    ? payload.issuePurpose
                    : undefined,
            adjustmentReason:
                typeof payload.adjustmentReason === 'string'
                    ? payload.adjustmentReason
                    : undefined,
            transferFromWarehouseId:
                typeof payload.sourceWarehouseId === 'string'
                    ? payload.sourceWarehouseId
                    : typeof payload.transferFromWarehouseId === 'string'
                      ? payload.transferFromWarehouseId
                      : undefined,
            transferToWarehouseId:
                typeof payload.destinationWarehouseId === 'string'
                    ? payload.destinationWarehouseId
                    : typeof payload.transferToWarehouseId === 'string'
                      ? payload.transferToWarehouseId
                      : undefined,
        }
    }

    async buildFromStandalone(
        input: MmAccountingStandaloneInput,
        tx?: TransactionClient,
    ): Promise<MmAccountingEventPayloadV2> {
        const db = tx ?? this.prisma
        const rawLines: RawLine[] = input.lines.map((l) => ({
            materialId: l.materialId,
            warehouseId: l.warehouseId,
            movementType: l.movementType,
            quantity: l.quantity,
            unitCost: l.unitCost,
            totalCost: l.totalCost,
            costCenterId: l.costCenterId,
        }))
        const lines = await this.enrichLines(db, rawLines, input.eventType)
        const postingDate =
            typeof input.postingDate === 'string'
                ? input.postingDate
                : input.postingDate.toISOString()
        const currencyCode =
            input.currencyCode ??
            (await this.resolveCurrency(db, input.companyId, rawLines))
        const totalValue = lines.reduce((sum, l) => sum + l.totalCost, 0)

        return {
            schemaVersion: 'v2',
            eventType: input.eventType,
            companyId: input.companyId,
            plantId: input.plantId ?? lines.find((l) => l.plantId)?.plantId ?? null,
            postingDate,
            transactionDate: postingDate,
            currencyCode,
            documentType: input.documentType,
            documentId: input.documentId,
            sourceModule: input.sourceModule,
            accountingEffects: input.accountingEffects,
            lines,
            financiallyRelevant: input.financiallyRelevant !== false,
            sourceEventId: input.sourceEventId,
            sourceTransactionId: input.sourceTransactionId,
            idempotencyKey: input.idempotencyKey,
            totalValue,
            ...(input.extraPayload ?? {}),
        }
    }

    private extractRawLines(payload: Record<string, unknown>): RawLine[] {
        if (!Array.isArray(payload.lines)) return []
        return payload.lines.map((line: any) => ({
            materialId: String(line.materialId),
            warehouseId: line.warehouseId ?? payload.warehouseId ?? null,
            movementType: line.movementType,
            quantity: Number(line.quantity ?? 0),
            unitCost: Number(line.unitCost ?? 0),
            totalCost: Number(
                line.totalCost ?? Number(line.quantity ?? 0) * Number(line.unitCost ?? 0),
            ),
            costCenterId: line.costCenterId ?? payload.costCenterId ?? null,
        }))
    }

    private async enrichLines(
        db: TransactionClient | PrismaService,
        rawLines: RawLine[],
        eventType: string,
    ): Promise<MmAccountingLineContext[]> {
        if (!rawLines.length) return []

        const materialIds = [...new Set(rawLines.map((l) => l.materialId))]
        const warehouseIds = [
            ...new Set(
                rawLines.map((l) => l.warehouseId).filter(Boolean) as string[],
            ),
        ]

        const materials = await db.mmMaterial.findMany({
            where: { id: { in: materialIds } },
            select: {
                id: true,
                materialTypeId: true,
                materialType: { select: { code: true } },
                valuationClassId: true,
                valuationClass: { select: { code: true } },
            },
        })
        const materialMap = new Map(materials.map((m) => [m.id, m]))

        const warehouses = warehouseIds.length
            ? await db.warehouse.findMany({
                  where: { id: { in: warehouseIds } },
                  select: { id: true, plantId: true },
              })
            : []
        const warehouseMap = new Map(warehouses.map((w) => [w.id, w]))

        const defaultMovement = MOVEMENT_BY_EVENT[eventType] ?? 'UNKNOWN'

        return rawLines.map((line) => {
            const material = materialMap.get(line.materialId)
            const warehouse = line.warehouseId
                ? warehouseMap.get(line.warehouseId)
                : undefined
            return {
                materialId: line.materialId,
                materialTypeId: material?.materialTypeId ?? null,
                materialTypeCode: material?.materialType?.code ?? null,
                valuationClassId: material?.valuationClassId ?? null,
                valuationClassCode: material?.valuationClass?.code ?? null,
                movementType: line.movementType ?? defaultMovement,
                quantity: line.quantity ?? 0,
                unitCost: line.unitCost ?? 0,
                totalCost: line.totalCost ?? 0,
                costCenterId: line.costCenterId ?? null,
                warehouseId: line.warehouseId ?? null,
                plantId: warehouse?.plantId ?? null,
            }
        })
    }

    private resolvePostingDate(
        payload: Record<string, unknown>,
        occurredAt: string,
    ): string {
        if (typeof payload.postingDate === 'string') return payload.postingDate
        if (payload.postingDate instanceof Date) {
            return payload.postingDate.toISOString()
        }
        return occurredAt
    }

    private async resolveCurrency(
        db: TransactionClient | PrismaService,
        companyId: string,
        lines: RawLine[],
    ): Promise<string> {
        if (lines.length) {
            const material = await db.mmMaterial.findFirst({
                where: { id: lines[0].materialId },
                select: { currency: { select: { code: true } } },
            })
            if (material?.currency?.code) return material.currency.code
        }
        return DEFAULT_CURRENCY
    }
}
