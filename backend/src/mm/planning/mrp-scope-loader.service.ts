import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import {
    InventoryAvailabilityService,
    atpPairKey,
    type AtpResult,
} from '../inventory/inventory-availability.service'
import {
    resolveParamsFromRules,
    type ResolvedPlanningParams,
} from './reorder-rule.service'
import { MmDemandAggregationService } from '../integration/demand/mm-demand-aggregation.service'
import type {
    DemandEvent,
    SupplyEvent,
    ReservationEvent,
} from './projected-stock.service'

export { atpPairKey }

export type MrpScopeLoadInput = {
    companyId: string
    warehouseIds: string[]
    materialIds: string[]
    asOf: Date
    horizonEnd: Date
    includeOpenReceipts: boolean
    currentRunId: string
}

export type PairDemandRecord = {
    demands: Array<{
        id: string
        sourceType: string
        sourceDocumentId: string | null
        demandDate: Date
        quantity: Decimal
        warehouseId: string | null
    }>
}

export type PairSnapshot = {
    unrestrictedQty: Decimal
    reservedQty: Decimal
    qualityQty: Decimal
    blockedQty: Decimal
    openingAvailable: Decimal
    demandQty: Decimal
    independentDemandQty: Decimal
    bomDependentDemandQty: Decimal
    incomingQty: Decimal
    plannedSupplyQty: Decimal
    productionSupplyQty: Decimal
    earliestDemandDate: Date | null
    demandSourceTypes: string[]
    demandIds: string[]
    independentDemandLines: PairDemandRecord['demands']
    demandEvents: DemandEvent[]
    supplyEvents: SupplyEvent[]
    reservationEvents: ReservationEvent[]
}

export type MrpScopeSnapshot = {
    atpByPair: Map<string, AtpResult>
    planningDemands: Array<{
        id: string
        materialId: string
        sourceType: string
        sourceDocumentId: string | null
        demandDate: Date
        quantity: Decimal
        warehouseId: string | null
    }>
    demandsByMaterial: Map<string, PairDemandRecord['demands']>
    erLines: Array<{
        materialId: string
        expectedQuantity: Decimal
        receivedQuantity: Decimal
        expectedReceipt: {
            companyId: string
            warehouseId: string
            purchaseOrderId: string | null
            expectedDate: Date | null
            status: string
        }
    }>
    poLines: Array<{
        materialId: string
        warehouseId: string | null
        quantity: Decimal
        receivedQuantity: Decimal
        requiredDate: Date | null
        purchaseOrder: {
            companyId: string
            warehouseId: string | null
            expectedDeliveryDate: Date | null
            status: string
            id: string
        }
    }>
    reservations: Array<{
        warehouseId: string
        materialId: string
        quantity: Decimal
        reservedQuantity: Decimal
        validUntil: Date | null
        createdAt: Date
        status: string
    }>
    priorSupply: Array<{
        warehouseId: string
        materialId: string
        quantity: Decimal
        availableDate: Date
    }>
    rulesByMaterial: Map<string, any[]>
    preferredSupplierByMaterial: Map<string, string>
    materials: Map<
        string,
        {
            id: string
            baseUomId: string
            purchasable: boolean
            preferredSupplierId: string | null
            safetyStock: Decimal
            reorderPoint: Decimal
            reorderQuantity: Decimal
            minimumOrderQuantity: Decimal
            leadTimeDays: number
        }
    >
}

@Injectable()
export class MrpScopeLoaderService {
    constructor(
        private prisma: PrismaService,
        private availability: InventoryAvailabilityService,
        private demandAggregation: MmDemandAggregationService,
    ) {}

    async loadScope(input: MrpScopeLoadInput): Promise<MrpScopeSnapshot> {
        const {
            companyId,
            warehouseIds,
            materialIds,
            asOf,
            horizonEnd,
            currentRunId,
        } = input

        const pairs = warehouseIds.flatMap((warehouseId) =>
            materialIds.map((materialId) => ({ warehouseId, materialId })),
        )

        const [
            atpByPair,
            planningDemands,
            erLines,
            poLines,
            reservations,
            priorSupply,
            rules,
            supplierLinks,
            materials,
        ] = await Promise.all([
            this.availability.getAvailabilityBatch(companyId, pairs),
            this.demandAggregation.loadForMrp({
                companyId,
                materialIds,
                warehouseIds,
                asOf,
                horizonEnd,
                statuses: ['OPEN'],
            }),
            this.prisma.mmExpectedReceiptLine.findMany({
                where: {
                    materialId: { in: materialIds },
                    status: { in: ['OPEN', 'PARTIAL'] },
                    expectedReceipt: {
                        companyId,
                        warehouseId: { in: warehouseIds },
                        status: { in: ['OPEN', 'IN_PROGRESS'] },
                        expectedDate: { gte: asOf, lte: horizonEnd },
                    },
                },
                include: {
                    expectedReceipt: {
                        select: {
                            companyId: true,
                            warehouseId: true,
                            purchaseOrderId: true,
                            expectedDate: true,
                            status: true,
                        },
                    },
                },
            }),
            this.prisma.mmPurchaseOrderLine.findMany({
                where: {
                    materialId: { in: materialIds },
                    purchaseOrder: {
                        companyId,
                        status: { in: ['SENT', 'PARTIALLY_RECEIVED'] },
                    },
                },
                include: {
                    purchaseOrder: {
                        select: {
                            id: true,
                            companyId: true,
                            warehouseId: true,
                            expectedDeliveryDate: true,
                            status: true,
                        },
                    },
                },
            }),
            this.prisma.mmInventoryReservation.findMany({
                where: {
                    companyId,
                    warehouseId: { in: warehouseIds },
                    materialId: { in: materialIds },
                    status: { in: ['OPEN', 'PARTIAL'] },
                },
                select: {
                    warehouseId: true,
                    materialId: true,
                    quantity: true,
                    reservedQuantity: true,
                    validUntil: true,
                    createdAt: true,
                    status: true,
                },
            }),
            this.prisma.mmSupplyProposal.findMany({
                where: {
                    companyId,
                    warehouseId: { in: warehouseIds },
                    materialId: { in: materialIds },
                    status: 'OPEN',
                    supplyType: 'PLANNED_ORDER',
                    mrpRunId: { not: currentRunId },
                    availableDate: { gte: asOf, lte: horizonEnd },
                },
                select: {
                    warehouseId: true,
                    materialId: true,
                    quantity: true,
                    availableDate: true,
                },
            }),
            this.prisma.mmReorderRule.findMany({
                where: {
                    companyId,
                    materialId: { in: materialIds },
                    isActive: true,
                    OR: [
                        { warehouseId: { in: warehouseIds } },
                        { warehouseId: null },
                    ],
                },
            }),
            this.prisma.mmSupplierMaterial.findMany({
                where: {
                    materialId: { in: materialIds },
                    preferredSupplier: true,
                    status: 'ACTIVE',
                    supplier: { companyId, deletedAt: null },
                },
                select: { materialId: true, supplierId: true },
                orderBy: { updatedAt: 'desc' },
            }),
            this.prisma.mmMaterial.findMany({
                where: { id: { in: materialIds } },
                select: {
                    id: true,
                    baseUomId: true,
                    purchasable: true,
                    preferredSupplierId: true,
                    safetyStock: true,
                    reorderPoint: true,
                    reorderQuantity: true,
                    minimumOrderQuantity: true,
                    leadTimeDays: true,
                },
            }),
        ])

        const demandsByMaterial = new Map<string, PairDemandRecord['demands']>()
        for (const d of planningDemands) {
            const list = demandsByMaterial.get(d.materialId) ?? []
            list.push({
                id: d.id,
                sourceType: d.sourceType,
                sourceDocumentId: d.sourceDocumentId ?? null,
                demandDate: d.demandDate,
                quantity: new Decimal(d.quantity),
                warehouseId: d.warehouseId,
            })
            demandsByMaterial.set(d.materialId, list)
        }

        const rulesByMaterial = new Map<string, any[]>()
        for (const r of rules) {
            const list = rulesByMaterial.get(r.materialId) ?? []
            list.push(r)
            rulesByMaterial.set(r.materialId, list)
        }

        const preferredSupplierByMaterial = new Map<string, string>()
        for (const link of supplierLinks) {
            if (!preferredSupplierByMaterial.has(link.materialId)) {
                preferredSupplierByMaterial.set(link.materialId, link.supplierId)
            }
        }

        const materialsMap = new Map(materials.map((m) => [m.id, m]))

        return {
            atpByPair,
            planningDemands: planningDemands.map((d) => ({
                id: d.id,
                materialId: d.materialId,
                sourceType: d.sourceType,
                sourceDocumentId: d.sourceDocumentId ?? null,
                demandDate: d.demandDate,
                quantity: new Decimal(d.quantity),
                warehouseId: d.warehouseId,
            })),
            demandsByMaterial,
            erLines: erLines.map((l) => ({
                materialId: l.materialId,
                expectedQuantity: new Decimal(l.expectedQuantity),
                receivedQuantity: new Decimal(l.receivedQuantity),
                expectedReceipt: l.expectedReceipt,
            })),
            poLines: poLines.map((l) => ({
                materialId: l.materialId,
                warehouseId: l.warehouseId,
                quantity: new Decimal(l.quantity),
                receivedQuantity: new Decimal(l.receivedQuantity),
                requiredDate: l.requiredDate,
                purchaseOrder: l.purchaseOrder,
            })),
            reservations,
            priorSupply: priorSupply.map((p) => ({
                warehouseId: p.warehouseId,
                materialId: p.materialId,
                quantity: new Decimal(p.quantity),
                availableDate: p.availableDate,
            })),
            rulesByMaterial,
            preferredSupplierByMaterial,
            materials: materialsMap,
        }
    }

    resolveParams(
        snapshot: MrpScopeSnapshot,
        materialId: string,
        warehouseId: string,
        asOf: Date,
    ): ResolvedPlanningParams {
        const material = snapshot.materials.get(materialId)
        if (!material) {
            throw new Error(`Material ${materialId} not in scope snapshot`)
        }
        const rules = snapshot.rulesByMaterial.get(materialId) ?? []
        return resolveParamsFromRules(rules, warehouseId, material, asOf)
    }

    buildPairSnapshot(
        snapshot: MrpScopeSnapshot,
        companyId: string,
        warehouseId: string,
        materialId: string,
        asOf: Date,
        horizonEnd: Date,
        includeOpenReceipts: boolean,
        opts?: { additionalDemandEvents?: DemandEvent[] },
    ): PairSnapshot {
        const key = atpPairKey(warehouseId, materialId)
        const atp = snapshot.atpByPair.get(key)
        const unrestrictedQty = new Decimal(atp?.unrestrictedOnHand ?? 0)
        const reservedQty = new Decimal(atp?.reserved ?? 0)
        const openingAvailable = new Decimal(atp?.available ?? 0)

        let qualityQty = new Decimal(0)
        let blockedQty = new Decimal(0)
        for (const b of atp?.balances ?? []) {
            const qty = new Decimal(b.quantity)
            if (
                b.stockStatus === 'QUALITY_INSPECTION' ||
                b.stockStatus === 'QI'
            ) {
                qualityQty = qualityQty.plus(qty)
            } else if (b.stockStatus === 'BLOCKED') {
                blockedQty = blockedQty.plus(qty)
            }
        }

        const materialDemands = snapshot.demandsByMaterial.get(materialId) ?? []
        let independentDemandQty = new Decimal(0)
        let bomDependentDemandQty = new Decimal(0)
        let earliestDemandDate: Date | null = null
        const demandSourceTypes: string[] = []
        const demandIds: string[] = []
        const independentDemandLines: PairDemandRecord['demands'] = []
        const demandEvents: DemandEvent[] = []

        for (const d of materialDemands) {
            if (d.warehouseId && d.warehouseId !== warehouseId) continue
            independentDemandQty = independentDemandQty.plus(d.quantity)
            demandSourceTypes.push(d.sourceType)
            demandIds.push(d.id)
            independentDemandLines.push(d)
            demandEvents.push({ date: d.demandDate, quantity: d.quantity })
            if (
                !earliestDemandDate ||
                d.demandDate.getTime() < earliestDemandDate.getTime()
            ) {
                earliestDemandDate = d.demandDate
            }
        }

        for (const event of opts?.additionalDemandEvents ?? []) {
            bomDependentDemandQty = bomDependentDemandQty.plus(event.quantity)
            demandSourceTypes.push('BOM_EXPLOSION')
            demandEvents.push(event)
            if (
                !earliestDemandDate ||
                event.date.getTime() < earliestDemandDate.getTime()
            ) {
                earliestDemandDate = event.date
            }
        }

        const planningDemand = independentDemandQty.plus(bomDependentDemandQty)

        let incomingQty = new Decimal(0)
        const supplyEvents: SupplyEvent[] = []
        const erLinkedPoIds = new Set<string>()

        if (includeOpenReceipts) {
            for (const line of snapshot.erLines) {
                if (line.materialId !== materialId) continue
                if (line.expectedReceipt.warehouseId !== warehouseId) continue
                const remaining = line.expectedQuantity.minus(line.receivedQuantity)
                if (remaining.gt(0)) {
                    incomingQty = incomingQty.plus(remaining)
                    supplyEvents.push({
                        date: line.expectedReceipt.expectedDate ?? asOf,
                        quantity: remaining,
                    })
                    if (line.expectedReceipt.purchaseOrderId) {
                        erLinkedPoIds.add(line.expectedReceipt.purchaseOrderId)
                    }
                }
            }

            for (const line of snapshot.poLines) {
                if (line.materialId !== materialId) continue
                if (erLinkedPoIds.has(line.purchaseOrder.id)) continue
                const wh = line.warehouseId ?? line.purchaseOrder.warehouseId
                if (wh !== warehouseId) continue
                const remaining = line.quantity.minus(line.receivedQuantity)
                if (remaining.gt(0)) {
                    incomingQty = incomingQty.plus(remaining)
                    const supplyDate =
                        line.requiredDate ??
                        line.purchaseOrder.expectedDeliveryDate ??
                        asOf
                    if (
                        supplyDate.getTime() >= asOf.getTime() &&
                        supplyDate.getTime() <= horizonEnd.getTime()
                    ) {
                        supplyEvents.push({ date: supplyDate, quantity: remaining })
                    }
                }
            }
        }

        let plannedSupplyQty = new Decimal(0)
        for (const p of snapshot.priorSupply) {
            if (p.warehouseId !== warehouseId || p.materialId !== materialId) continue
            plannedSupplyQty = plannedSupplyQty.plus(p.quantity)
            supplyEvents.push({ date: p.availableDate, quantity: p.quantity })
        }

        const reservationEvents: ReservationEvent[] = []
        for (const r of snapshot.reservations) {
            if (r.warehouseId !== warehouseId || r.materialId !== materialId) continue
            const openQty = new Decimal(r.reservedQuantity || r.quantity)
            if (openQty.lte(0)) continue
            const bucketDate = r.validUntil ?? r.createdAt ?? asOf
            if (
                bucketDate.getTime() >= asOf.getTime() &&
                bucketDate.getTime() <= horizonEnd.getTime()
            ) {
                reservationEvents.push({ date: bucketDate, quantity: openQty })
            }
        }

        return {
            unrestrictedQty,
            reservedQty,
            qualityQty,
            blockedQty,
            openingAvailable,
            demandQty: planningDemand,
            independentDemandQty,
            bomDependentDemandQty,
            incomingQty,
            plannedSupplyQty,
            productionSupplyQty: new Decimal(0),
            earliestDemandDate,
            demandSourceTypes,
            demandIds,
            independentDemandLines,
            demandEvents,
            supplyEvents,
            reservationEvents,
        }
    }

    resolvePreferredSupplier(
        snapshot: MrpScopeSnapshot,
        materialId: string,
    ): string | null {
        const linked = snapshot.preferredSupplierByMaterial.get(materialId)
        if (linked) return linked
        return snapshot.materials.get(materialId)?.preferredSupplierId ?? null
    }
}
