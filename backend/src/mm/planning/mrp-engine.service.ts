import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { ReorderRuleService } from './reorder-rule.service'

export type NettingInput = {
    unrestrictedQty: Decimal
    reservedQty: Decimal
    qualityQty: Decimal
    blockedQty: Decimal
    incomingQty: Decimal
    demandQty: Decimal
    safetyStock: Decimal
    reorderPoint: Decimal
    reorderQuantity: Decimal
    minimumOrderQuantity: Decimal
    leadTimeDays: number
    includeOpenReceipts: boolean
    asOf?: Date
    /** Earliest planning demand date in horizon (for stockout projection). */
    earliestDemandDate?: Date | null
}

export type NettingResult = {
    availableQty: Decimal
    netRequirement: Decimal
    recommendedQty: Decimal
    belowReorderPoint: boolean
    shortage: boolean
    expectedProcurementDate: Date | null
    projectedStockoutDate: Date | null
}

/** Normalize legacy demand source aliases to canonical labels. */
export function canonicalizeDemandSource(sourceType: string): string {
    switch (sourceType) {
        case 'MANUAL':
            return 'MANUAL_INTERNAL'
        case 'SALES_ORDER':
            return 'SALES'
        case 'OTHER':
            return 'MANUAL_INTERNAL'
        default:
            return sourceType
    }
}

export function aggregateDemandSource(sourceTypes: string[]): string | null {
    if (!sourceTypes.length) return null
    const unique = [
        ...new Set(sourceTypes.map(canonicalizeDemandSource)),
    ]
    if (unique.length === 1) return unique[0]
    return 'MIXED'
}

export function suggestionReason(net: NettingResult): string {
    if (net.shortage) return 'SHORTAGE'
    if (net.belowReorderPoint) return 'BELOW_REORDER_POINT'
    return 'NET_REQUIREMENT'
}

/**
 * Pure MRP netting helpers — unit-tested independently of Prisma.
 *
 * ProjectedAvailable = (Unrestricted − Reserved) + IncomingOpenPO
 * NetRequirement     = max(0, Demand + SafetyStock − ProjectedAvailable)
 *
 * Reserved qty lowers available only; demandQty must be planning demand only
 * (do not double-count reservations into demand).
 */
export function computeNetting(input: NettingInput): NettingResult {
    const availableNow = input.unrestrictedQty.minus(input.reservedQty)
    const incoming = input.includeOpenReceipts ? input.incomingQty : new Decimal(0)
    const cover = availableNow.plus(incoming)
    const need = input.demandQty.plus(input.safetyStock)
    let netRequirement = need.minus(cover)
    if (netRequirement.lt(0)) netRequirement = new Decimal(0)

    const belowReorderPoint = availableNow.lte(input.reorderPoint)
    const shortage =
        netRequirement.gt(0) || availableNow.lt(input.safetyStock)

    let recommended = netRequirement
    if (belowReorderPoint) {
        const safetyGap = input.safetyStock.minus(availableNow)
        const gap = safetyGap.gt(0) ? safetyGap : new Decimal(0)
        let ropFloor = input.reorderQuantity
        if (input.minimumOrderQuantity.gt(ropFloor))
            ropFloor = input.minimumOrderQuantity
        if (gap.gt(ropFloor)) ropFloor = gap
        if (ropFloor.gt(recommended)) recommended = ropFloor
    }

    if (recommended.gt(0)) {
        if (input.minimumOrderQuantity.gt(recommended)) {
            recommended = input.minimumOrderQuantity
        }
        if (input.reorderQuantity.gt(0)) {
            const multiple = input.reorderQuantity
            const ratio = recommended.div(multiple)
            const ceil = new Decimal(Math.ceil(Number(ratio)))
            recommended = ceil.mul(multiple)
        }
    }

    const asOf = input.asOf ?? new Date()
    let expectedProcurementDate: Date | null = null
    if (recommended.gt(0)) {
        expectedProcurementDate = new Date(asOf)
        expectedProcurementDate.setDate(
            expectedProcurementDate.getDate() + (input.leadTimeDays || 0),
        )
    }

    let projectedStockoutDate: Date | null = null
    if (shortage) {
        if (input.demandQty.gt(0) && input.earliestDemandDate) {
            projectedStockoutDate = new Date(input.earliestDemandDate)
        } else {
            projectedStockoutDate = new Date(asOf)
        }
    }

    return {
        availableQty: availableNow,
        netRequirement,
        recommendedQty: recommended,
        belowReorderPoint,
        shortage,
        expectedProcurementDate,
        projectedStockoutDate,
    }
}

@Injectable()
export class MrpEngineService {
    constructor(
        private prisma: PrismaService,
        private reorderRules: ReorderRuleService,
    ) {}

    async executeRun(runId: string) {
        const run = await this.prisma.mmMrpRun.findUnique({ where: { id: runId } })
        if (!run) throw new Error('MRP run not found')

        await this.prisma.mmMrpRun.update({
            where: { id: runId },
            data: {
                status: 'RUNNING',
                executionTime: new Date(),
                errorMessage: null,
            },
        })

        try {
            await this.prisma.mmProcurementSuggestion.deleteMany({
                where: { mrpRunId: runId },
            })
            await this.prisma.mmMaterialRequirement.deleteMany({
                where: { mrpRunId: runId },
            })

            const companyId = run.companyId
            const horizonDays = run.planningHorizonDays
            const includeOpenReceipts = run.includeOpenReceipts
            const asOf = new Date()
            const horizonEnd = new Date(asOf)
            horizonEnd.setDate(horizonEnd.getDate() + horizonDays)

            const warehouses = await this.prisma.warehouse.findMany({
                where: {
                    companyId,
                    ...(run.warehouseId ? { id: run.warehouseId } : {}),
                    status: 'ACTIVE',
                },
                select: { id: true },
            })
            const warehouseIds = warehouses.map((w) => w.id)
            if (warehouseIds.length === 0) {
                await this.prisma.mmMrpRun.update({
                    where: { id: runId },
                    data: { status: 'COMPLETED', executionTime: asOf },
                })
                return this.prisma.mmMrpRun.findUnique({
                    where: { id: runId },
                    include: {
                        requirements: true,
                        suggestions: true,
                    },
                })
            }

            const materials = await this.resolveMaterials(
                companyId,
                warehouseIds,
                asOf,
                horizonEnd,
            )

            const requirementRows: any[] = []
            const suggestionRows: any[] = []

            for (const material of materials) {
                for (const warehouseId of warehouseIds) {
                    const snap = await this.snapshotPair(
                        companyId,
                        warehouseId,
                        material.id,
                        asOf,
                        horizonEnd,
                    )
                    const params = await this.reorderRules.resolveParams(
                        companyId,
                        material.id,
                        warehouseId,
                        material,
                    )

                    const net = computeNetting({
                        unrestrictedQty: snap.unrestrictedQty,
                        reservedQty: snap.reservedQty,
                        qualityQty: snap.qualityQty,
                        blockedQty: snap.blockedQty,
                        incomingQty: snap.incomingQty,
                        demandQty: snap.demandQty,
                        safetyStock: params.safetyStock,
                        reorderPoint: params.reorderPoint,
                        reorderQuantity: params.reorderQuantity,
                        minimumOrderQuantity: params.minimumOrderQuantity,
                        leadTimeDays: params.leadTimeDays,
                        includeOpenReceipts,
                        asOf,
                        earliestDemandDate: snap.earliestDemandDate,
                    })

                    const hasSignal =
                        snap.unrestrictedQty.gt(0) ||
                        snap.reservedQty.gt(0) ||
                        snap.qualityQty.gt(0) ||
                        snap.blockedQty.gt(0) ||
                        snap.incomingQty.gt(0) ||
                        snap.demandQty.gt(0) ||
                        params.reorderPoint.gt(0) ||
                        params.safetyStock.gt(0) ||
                        net.recommendedQty.gt(0) ||
                        net.belowReorderPoint ||
                        net.shortage

                    if (!hasSignal) continue

                    let source = aggregateDemandSource(snap.demandSourceTypes)
                    if (!source && net.recommendedQty.gt(0)) {
                        source = 'REORDER'
                    }

                    const requiredDate =
                        snap.earliestDemandDate ?? asOf

                    const preferredSupplierId =
                        await this.resolvePreferredSupplier(
                            companyId,
                            material.id,
                            material.preferredSupplierId,
                        )

                    let reason: string | null = null
                    if (net.recommendedQty.gt(0)) {
                        reason = suggestionReason(net)
                    }

                    requirementRows.push({
                        mrpRunId: runId,
                        companyId,
                        warehouseId,
                        materialId: material.id,
                        unrestrictedQty: snap.unrestrictedQty,
                        reservedQty: snap.reservedQty,
                        qualityQty: snap.qualityQty,
                        blockedQty: snap.blockedQty,
                        availableQty: net.availableQty,
                        incomingQty: snap.incomingQty,
                        demandQty: snap.demandQty,
                        safetyStock: params.safetyStock,
                        reorderPoint: params.reorderPoint,
                        moq: params.minimumOrderQuantity,
                        leadTimeDays: params.leadTimeDays,
                        netRequirement: net.netRequirement,
                        recommendedQty: net.recommendedQty,
                        requiredDate,
                        source,
                        expectedProcurementDate: net.expectedProcurementDate,
                        projectedStockoutDate: net.projectedStockoutDate,
                        belowReorderPoint: net.belowReorderPoint,
                        shortage: net.shortage,
                        uomId: material.baseUomId,
                        purchasable: material.purchasable,
                        preferredSupplierId,
                        reason,
                    })
                }
            }

            for (const row of requirementRows) {
                const {
                    uomId,
                    purchasable,
                    preferredSupplierId,
                    reason,
                    ...data
                } = row
                const created = await this.prisma.mmMaterialRequirement.create({
                    data,
                })
                if (new Decimal(created.recommendedQty).gt(0)) {
                    suggestionRows.push({
                        mrpRunId: runId,
                        materialRequirementId: created.id,
                        suggestionType: purchasable
                            ? 'PR_RECOMMENDATION'
                            : 'PLANNED_REPLENISHMENT',
                        companyId,
                        materialId: created.materialId,
                        warehouseId: created.warehouseId,
                        quantity: created.recommendedQty,
                        uomId,
                        requiredDate:
                            created.expectedProcurementDate ??
                            new Date(
                                asOf.getTime() +
                                    (created.leadTimeDays || 0) *
                                        24 *
                                        60 *
                                        60 *
                                        1000,
                            ),
                        leadTimeDays: created.leadTimeDays,
                        preferredSupplierId: preferredSupplierId ?? null,
                        reason: reason ?? null,
                        status: 'OPEN',
                    })
                }
            }

            if (suggestionRows.length) {
                await this.prisma.mmProcurementSuggestion.createMany({
                    data: suggestionRows,
                })
            }

            await this.prisma.mmMrpRun.update({
                where: { id: runId },
                data: { status: 'COMPLETED', executionTime: new Date() },
            })
        } catch (err: any) {
            await this.prisma.mmMrpRun.update({
                where: { id: runId },
                data: {
                    status: 'FAILED',
                    errorMessage: err?.message?.slice(0, 1000) ?? 'MRP failed',
                },
            })
            throw err
        }

        return this.prisma.mmMrpRun.findUnique({
            where: { id: runId },
            include: {
                warehouse: { select: { id: true, code: true, name: true } },
                requirements: {
                    include: {
                        material: {
                            select: {
                                id: true,
                                materialCode: true,
                                materialName: true,
                            },
                        },
                        warehouse: {
                            select: { id: true, code: true, name: true },
                        },
                    },
                },
                suggestions: true,
                _count: { select: { requirements: true, suggestions: true } },
            },
        })
    }

    private async resolvePreferredSupplier(
        companyId: string,
        materialId: string,
        materialPreferredSupplierId: string | null | undefined,
    ): Promise<string | null> {
        const link = await this.prisma.mmSupplierMaterial.findFirst({
            where: {
                materialId,
                preferredSupplier: true,
                status: 'ACTIVE',
                supplier: { companyId, deletedAt: null },
            },
            select: { supplierId: true },
            orderBy: { updatedAt: 'desc' },
        })
        if (link?.supplierId) return link.supplierId
        return materialPreferredSupplierId ?? null
    }

    private async resolveMaterials(
        companyId: string,
        warehouseIds: string[],
        asOf: Date,
        horizonEnd: Date,
    ) {
        const [balanced, reserved, demanded, ruled] = await Promise.all([
            this.prisma.mmInventoryBalance.findMany({
                where: { companyId, warehouseId: { in: warehouseIds } },
                select: { materialId: true },
                distinct: ['materialId'],
            }),
            this.prisma.mmInventoryReservation.findMany({
                where: {
                    companyId,
                    warehouseId: { in: warehouseIds },
                    status: { in: ['OPEN', 'PARTIAL'] },
                },
                select: { materialId: true },
                distinct: ['materialId'],
            }),
            this.prisma.mmPlanningDemand.findMany({
                where: {
                    companyId,
                    demandDate: { gte: asOf, lte: horizonEnd },
                    OR: [
                        { warehouseId: { in: warehouseIds } },
                        { warehouseId: null },
                    ],
                },
                select: { materialId: true },
                distinct: ['materialId'],
            }),
            this.prisma.mmReorderRule.findMany({
                where: {
                    companyId,
                    isActive: true,
                    OR: [
                        { warehouseId: { in: warehouseIds } },
                        { warehouseId: null },
                    ],
                },
                select: { materialId: true },
                distinct: ['materialId'],
            }),
        ])

        const ids = new Set<string>()
        for (const r of [...balanced, ...reserved, ...demanded, ...ruled]) {
            ids.add(r.materialId)
        }

        // Also include inventory-managed materials with ROP/safety configured for the company
        const configured = await this.prisma.mmMaterial.findMany({
            where: {
                companyId,
                status: 'ACTIVE',
                inventoryManaged: true,
                OR: [
                    { reorderPoint: { gt: 0 } },
                    { safetyStock: { gt: 0 } },
                    { id: { in: [...ids] } },
                ],
            },
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
        })

        return configured
    }

    private async snapshotPair(
        companyId: string,
        warehouseId: string,
        materialId: string,
        asOf: Date,
        horizonEnd: Date,
    ) {
        const balances = await this.prisma.mmInventoryBalance.findMany({
            where: { companyId, warehouseId, materialId },
        })

        let unrestrictedQty = new Decimal(0)
        let reservedQty = new Decimal(0)
        let qualityQty = new Decimal(0)
        let blockedQty = new Decimal(0)

        for (const b of balances) {
            const qty = new Decimal(b.quantity)
            const reserved = new Decimal(b.reservedQuantity)
            if (b.stockStatus === 'UNRESTRICTED') {
                unrestrictedQty = unrestrictedQty.plus(qty)
                reservedQty = reservedQty.plus(reserved)
            } else if (
                b.stockStatus === 'QUALITY_INSPECTION' ||
                b.stockStatus === 'QI'
            ) {
                qualityQty = qualityQty.plus(qty)
            } else if (b.stockStatus === 'BLOCKED') {
                blockedQty = blockedQty.plus(qty)
            }
        }

        // Reservations lower available via balance.reservedQuantity only —
        // do not add them into demandQty (avoids double-count).
        const planningDemands = await this.prisma.mmPlanningDemand.findMany({
            where: {
                companyId,
                materialId,
                demandDate: { gte: asOf, lte: horizonEnd },
                OR: [{ warehouseId }, { warehouseId: null }],
            },
        })
        let planningDemand = new Decimal(0)
        let earliestDemandDate: Date | null = null
        const demandSourceTypes: string[] = []
        for (const d of planningDemands) {
            planningDemand = planningDemand.plus(new Decimal(d.quantity))
            demandSourceTypes.push(d.sourceType)
            if (
                !earliestDemandDate ||
                d.demandDate.getTime() < earliestDemandDate.getTime()
            ) {
                earliestDemandDate = d.demandDate
            }
        }

        const demandQty = planningDemand

        const poLines = await this.prisma.mmPurchaseOrderLine.findMany({
            where: {
                materialId,
                purchaseOrder: {
                    companyId,
                    status: { in: ['SENT', 'PARTIALLY_RECEIVED'] },
                },
            },
            include: { purchaseOrder: { select: { warehouseId: true } } },
        })

        let incomingQty = new Decimal(0)
        for (const line of poLines) {
            const wh = line.warehouseId ?? line.purchaseOrder.warehouseId
            if (wh !== warehouseId) continue
            const remaining = new Decimal(line.quantity).minus(
                line.receivedQuantity,
            )
            if (remaining.gt(0)) incomingQty = incomingQty.plus(remaining)
        }

        return {
            unrestrictedQty,
            reservedQty,
            qualityQty,
            blockedQty,
            demandQty,
            incomingQty,
            earliestDemandDate,
            demandSourceTypes,
        }
    }
}
