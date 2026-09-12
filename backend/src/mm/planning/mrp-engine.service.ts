import { forwardRef, Inject, Injectable, Optional } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { ReorderRuleService } from './reorder-rule.service'
import { BomProvider, BOM_PROVIDER, NullBomProvider } from './bom-provider'
import { ProcurementSuggestionService } from './procurement-suggestion.service'

export type NettingInput = {
    unrestrictedQty: Decimal
    reservedQty: Decimal
    qualityQty: Decimal
    blockedQty: Decimal
    incomingQty: Decimal
    plannedSupplyQty?: Decimal
    productionSupplyQty?: Decimal
    demandQty: Decimal
    safetyStock: Decimal
    reorderPoint: Decimal
    reorderQuantity: Decimal
    minimumOrderQuantity: Decimal
    lotSize?: Decimal
    minStock?: Decimal
    maxStock?: Decimal
    leadTimeDays: number
    includeOpenReceipts: boolean
    asOf?: Date
    /** Earliest planning demand date in horizon (for stockout projection). */
    earliestDemandDate?: Date | null
    procurementType?: string
}

export type NettingResult = {
    availableQty: Decimal
    grossDemand: Decimal
    projectedAvailable: Decimal
    netRequirement: Decimal
    recommendedQty: Decimal
    shortageQty: Decimal
    belowReorderPoint: boolean
    shortage: boolean
    expectedProcurementDate: Date | null
    projectedStockoutDate: Date | null
    recommendedAction: string
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

export function buildSuggestionExplanation(opts: {
    demandSource: string | null
    reason: string
    requiredDate: Date
    quantity: Decimal
    leadTimeDays: number
    moq: Decimal
    warehouseId: string
    preferredSupplierId: string | null
}): string {
    const parts = [
        `Demand source: ${opts.demandSource ?? 'REORDER'}`,
        `Shortage reason: ${opts.reason}`,
        `Required date: ${opts.requiredDate.toISOString().slice(0, 10)}`,
        `Suggested qty: ${opts.quantity.toString()}`,
        `Lead time: ${opts.leadTimeDays} day(s)`,
        `MOQ: ${opts.moq.toString()}`,
        `Target warehouse: ${opts.warehouseId}`,
        `Suggested supplier: ${opts.preferredSupplierId ?? 'none'}`,
    ]
    return parts.join(' | ')
}

/**
 * Pure MRP netting helpers — unit-tested independently of Prisma.
 *
 * GrossDemand        = planning demand (OPEN only; reservations are NOT demand)
 * ProjectedAvailable = (Unrestricted − Reserved) + Incoming + PlannedSupply + ProductionSupply
 * NetRequirement     = max(0, GrossDemand + SafetyStock − ProjectedAvailable)
 *
 * Do not double-count on-hand, reserved, incoming, or planned supply.
 */
export function computeNetting(input: NettingInput): NettingResult {
    const availableNow = input.unrestrictedQty.minus(input.reservedQty)
    const incoming = input.includeOpenReceipts
        ? input.incomingQty
        : new Decimal(0)
    const planned = input.plannedSupplyQty ?? new Decimal(0)
    const production = input.productionSupplyQty ?? new Decimal(0)
    const projectedAvailable = availableNow.plus(incoming).plus(planned).plus(production)

    const grossDemand = input.demandQty
    const need = grossDemand.plus(input.safetyStock)
    let netRequirement = need.minus(projectedAvailable)
    if (netRequirement.lt(0)) netRequirement = new Decimal(0)

    const belowReorderPoint =
        input.reorderPoint.gt(0) && availableNow.lte(input.reorderPoint)
    const shortage =
        netRequirement.gt(0) || availableNow.lt(input.safetyStock)
    let shortageQty = new Decimal(0)
    if (shortage) {
        shortageQty = netRequirement
        const safetyGap = input.safetyStock.minus(availableNow)
        if (safetyGap.gt(shortageQty)) shortageQty = safetyGap
    }

    let recommended = netRequirement
    const minStock = input.minStock ?? new Decimal(0)
    const maxStock = input.maxStock ?? new Decimal(0)
    const lotSize = input.lotSize ?? new Decimal(0)

    // Min-stock floor
    if (minStock.gt(0) && availableNow.lt(minStock)) {
        const minGap = minStock.minus(availableNow)
        if (minGap.gt(recommended)) recommended = minGap
    }

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
        const lot = lotSize.gt(0) ? lotSize : input.reorderQuantity
        if (lot.gt(0)) {
            const ratio = recommended.div(lot)
            const ceil = new Decimal(Math.ceil(Number(ratio)))
            recommended = ceil.mul(lot)
        }
        // Cap at max stock gap when configured
        if (maxStock.gt(0)) {
            const maxGap = maxStock.minus(projectedAvailable)
            if (maxGap.lte(0)) {
                recommended = new Decimal(0)
            } else if (recommended.gt(maxGap)) {
                recommended = maxGap
                if (
                    input.minimumOrderQuantity.gt(0) &&
                    input.minimumOrderQuantity.lte(maxGap) &&
                    recommended.lt(input.minimumOrderQuantity)
                ) {
                    recommended = input.minimumOrderQuantity
                }
                if (lot.gt(0) && recommended.gt(0)) {
                    const steps = Math.floor(Number(maxGap.div(lot)))
                    if (steps > 0) {
                        recommended = new Decimal(steps).mul(lot)
                    }
                }
            }
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

    const procurementType = (input.procurementType ?? 'BUY').toUpperCase()
    let recommendedAction = 'NONE'
    if (recommended.gt(0)) {
        if (procurementType === 'MAKE') {
            recommendedAction = 'CREATE_PLANNED_PRODUCTION'
        } else {
            recommendedAction = 'CREATE_PR'
        }
    } else if (shortage || belowReorderPoint) {
        recommendedAction = 'MONITOR'
    }

    return {
        availableQty: availableNow,
        grossDemand,
        projectedAvailable,
        netRequirement,
        recommendedQty: recommended,
        shortageQty,
        belowReorderPoint,
        shortage,
        expectedProcurementDate,
        projectedStockoutDate,
        recommendedAction,
    }
}

@Injectable()
export class MrpEngineService {
    private bomProvider: BomProvider

    constructor(
        private prisma: PrismaService,
        private reorderRules: ReorderRuleService,
        @Optional()
        @Inject(BOM_PROVIDER)
        bomProvider: BomProvider | null,
        @Optional()
        @Inject(forwardRef(() => ProcurementSuggestionService))
        private suggestions?: ProcurementSuggestionService,
    ) {
        this.bomProvider = bomProvider ?? new NullBomProvider()
    }

    async executeRun(runId: string) {
        const run = await this.prisma.mmMrpRun.findUnique({ where: { id: runId } })
        if (!run) throw new Error('MRP run not found')

        const startedAt = new Date()
        await this.prisma.mmMrpRun.update({
            where: { id: runId },
            data: {
                status: 'RUNNING',
                startedAt,
                executionTime: startedAt,
                errorMessage: null,
                resultsCount: 0,
            },
        })

        try {
            // Idempotent rerun: clear prior planning outputs for this run only
            await this.prisma.mmProcurementSuggestion.deleteMany({
                where: { mrpRunId: runId },
            })
            await this.prisma.mmSupplyProposal.deleteMany({
                where: { mrpRunId: runId },
            })
            await this.prisma.mmPlannedOrder.deleteMany({
                where: { mrpRunId: runId },
            })
            await this.prisma.mmMaterialRequirement.deleteMany({
                where: { mrpRunId: runId },
            })

            const companyId = run.companyId
            const horizonDays = run.planningHorizonDays
            const includeOpenReceipts = run.includeOpenReceipts
            const asOf = startedAt
            const horizonEnd = new Date(asOf)
            horizonEnd.setDate(horizonEnd.getDate() + horizonDays)

            const warehouses = await this.prisma.warehouse.findMany({
                where: {
                    companyId,
                    ...(run.warehouseId ? { id: run.warehouseId } : {}),
                    ...(run.plantId ? { plantId: run.plantId } : {}),
                    status: 'ACTIVE',
                },
                select: { id: true, plantId: true },
            })
            const warehouseIds = warehouses.map((w) => w.id)
            if (warehouseIds.length === 0) {
                await this.prisma.mmMrpRun.update({
                    where: { id: runId },
                    data: {
                        status: 'COMPLETED',
                        completedAt: new Date(),
                        executionTime: new Date(),
                        resultsCount: 0,
                    },
                })
                return this.loadRun(runId)
            }

            const materials = await this.resolveMaterials(
                companyId,
                warehouseIds,
                asOf,
                horizonEnd,
            )

            const requirementRows: any[] = []
            let plannedSeq = 0
            let proposalSeq = 0

            for (const material of materials) {
                // BOM boundary prepared for multi-level explosion (no-op stub today)
                await this.bomProvider.explode({
                    companyId,
                    plantId: run.plantId,
                    materialId: material.id,
                    quantity: 1,
                    asOf,
                })

                for (const warehouseId of warehouseIds) {
                    const snap = await this.snapshotPair(
                        companyId,
                        warehouseId,
                        material.id,
                        asOf,
                        horizonEnd,
                        includeOpenReceipts,
                        runId,
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
                        plannedSupplyQty: snap.plannedSupplyQty,
                        productionSupplyQty: snap.productionSupplyQty,
                        demandQty: snap.demandQty,
                        safetyStock: params.safetyStock,
                        reorderPoint: params.reorderPoint,
                        reorderQuantity: params.reorderQuantity,
                        minimumOrderQuantity: params.minimumOrderQuantity,
                        lotSize: params.lotSize,
                        minStock: params.minStock,
                        maxStock: params.maxStock,
                        leadTimeDays: params.leadTimeDays,
                        includeOpenReceipts,
                        asOf,
                        earliestDemandDate: snap.earliestDemandDate,
                        procurementType: params.procurementType,
                    })

                    const hasSignal =
                        snap.unrestrictedQty.gt(0) ||
                        snap.reservedQty.gt(0) ||
                        snap.qualityQty.gt(0) ||
                        snap.blockedQty.gt(0) ||
                        snap.incomingQty.gt(0) ||
                        snap.plannedSupplyQty.gt(0) ||
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

                    const requiredDate = snap.earliestDemandDate ?? asOf

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
                        plannedSupplyQty: snap.plannedSupplyQty,
                        productionSupplyQty: snap.productionSupplyQty,
                        demandQty: snap.demandQty,
                        grossDemand: net.grossDemand,
                        projectedAvailable: net.projectedAvailable,
                        safetyStock: params.safetyStock,
                        reorderPoint: params.reorderPoint,
                        moq: params.minimumOrderQuantity,
                        lotSize: params.lotSize.gt(0)
                            ? params.lotSize
                            : params.reorderQuantity,
                        minStock: params.minStock,
                        maxStock: params.maxStock,
                        leadTimeDays: params.leadTimeDays,
                        netRequirement: net.netRequirement,
                        recommendedQty: net.recommendedQty,
                        shortageQty: net.shortageQty,
                        recommendedAction: net.recommendedAction,
                        procurementType: params.procurementType,
                        planningStrategy: params.planningStrategy,
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
                        demandIds: snap.demandIds,
                        plantId:
                            warehouses.find((w) => w.id === warehouseId)
                                ?.plantId ?? run.plantId,
                        params,
                    })
                }
            }

            const suggestionRows: any[] = []
            const dateStr = asOf.toISOString().slice(0, 10).replace(/-/g, '')

            for (const row of requirementRows) {
                const {
                    uomId,
                    purchasable,
                    preferredSupplierId,
                    reason,
                    demandIds,
                    plantId,
                    params,
                    ...data
                } = row
                const created = await this.prisma.mmMaterialRequirement.create({
                    data,
                })

                let plannedOrderId: string | null = null
                if (new Decimal(created.recommendedQty).gt(0)) {
                    plannedSeq += 1
                    const orderType =
                        (created.procurementType ?? 'BUY').toUpperCase() ===
                        'MAKE'
                            ? 'PLANNED_PRODUCTION'
                            : 'PLANNED_PURCHASE'
                    const planned = await this.prisma.mmPlannedOrder.create({
                        data: {
                            plannedOrderNumber: `PLO-${dateStr}-${String(plannedSeq).padStart(4, '0')}-${runId.slice(-4)}`,
                            mrpRunId: runId,
                            materialRequirementId: created.id,
                            companyId,
                            plantId: plantId ?? null,
                            warehouseId: created.warehouseId,
                            materialId: created.materialId,
                            orderType,
                            quantity: created.recommendedQty,
                            uomId,
                            requiredDate:
                                created.expectedProcurementDate ??
                                created.requiredDate ??
                                asOf,
                            startDate: asOf,
                            procurementType:
                                created.procurementType ?? 'BUY',
                            status: 'OPEN',
                            sourceDemandIds: demandIds?.length
                                ? demandIds.join(',')
                                : null,
                        },
                    })
                    plannedOrderId = planned.id

                    proposalSeq += 1
                    await this.prisma.mmSupplyProposal.create({
                        data: {
                            proposalNumber: `SP-${dateStr}-${String(proposalSeq).padStart(4, '0')}-${runId.slice(-4)}`,
                            mrpRunId: runId,
                            plannedOrderId: planned.id,
                            companyId,
                            warehouseId: created.warehouseId,
                            materialId: created.materialId,
                            supplyType: 'PLANNED_ORDER',
                            quantity: created.recommendedQty,
                            availableDate:
                                created.expectedProcurementDate ?? asOf,
                            sourceDocumentType: 'PLANNED_ORDER',
                            sourceDocumentId: planned.id,
                            status: 'OPEN',
                        },
                    })

                    const demandSource = created.source
                    const explanation = buildSuggestionExplanation({
                        demandSource,
                        reason: reason ?? 'NET_REQUIREMENT',
                        requiredDate:
                            created.requiredDate ??
                            created.expectedProcurementDate ??
                            asOf,
                        quantity: new Decimal(created.recommendedQty),
                        leadTimeDays: created.leadTimeDays,
                        moq: new Decimal(created.moq),
                        warehouseId: created.warehouseId,
                        preferredSupplierId: preferredSupplierId ?? null,
                    })

                    suggestionRows.push({
                        mrpRunId: runId,
                        materialRequirementId: created.id,
                        plannedOrderId,
                        suggestionType:
                            orderType === 'PLANNED_PRODUCTION' || !purchasable
                                ? 'PLANNED_REPLENISHMENT'
                                : 'PR_RECOMMENDATION',
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
                        demandSource: demandSource ?? null,
                        shortageReason: reason ?? null,
                        moq: created.moq,
                        lotSize: created.lotSize,
                        explanation,
                        status: 'OPEN',
                    })
                }
            }

            if (suggestionRows.length) {
                await this.prisma.mmProcurementSuggestion.createMany({
                    data: suggestionRows,
                })
            }

            // Optional auto-PR when configured on the run
            if (run.autoCreatePurchaseRequisitions && this.suggestions) {
                const open = await this.prisma.mmProcurementSuggestion.findMany({
                    where: {
                        mrpRunId: runId,
                        status: 'OPEN',
                        suggestionType: 'PR_RECOMMENDATION',
                    },
                    select: { id: true },
                })
                for (const s of open) {
                    try {
                        await this.suggestions.convertToPr(s.id, {
                            requesterId: run.createdBy ?? 'mrp-auto',
                            purpose: `Auto PR from MRP run ${run.runNumber}`,
                            createdBy: run.createdBy ?? 'mrp-auto',
                        })
                    } catch {
                        // Leave suggestion OPEN if conversion fails
                    }
                }
            }

            const resultsCount = requirementRows.length
            await this.prisma.mmMrpRun.update({
                where: { id: runId },
                data: {
                    status: 'COMPLETED',
                    completedAt: new Date(),
                    executionTime: new Date(),
                    resultsCount,
                    parametersJson: {
                        planningHorizonDays: horizonDays,
                        includeOpenReceipts,
                        warehouseId: run.warehouseId,
                        plantId: run.plantId,
                        autoCreatePurchaseRequisitions:
                            run.autoCreatePurchaseRequisitions,
                        warehouseCount: warehouseIds.length,
                        materialCount: materials.length,
                    },
                },
            })
        } catch (err: any) {
            await this.prisma.mmMrpRun.update({
                where: { id: runId },
                data: {
                    status: 'FAILED',
                    completedAt: new Date(),
                    errorMessage: err?.message?.slice(0, 1000) ?? 'MRP failed',
                },
            })
            throw err
        }

        return this.loadRun(runId)
    }

    private loadRun(runId: string) {
        return this.prisma.mmMrpRun.findUnique({
            where: { id: runId },
            include: {
                warehouse: { select: { id: true, code: true, name: true } },
                plant: { select: { id: true, code: true, name: true } },
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
                plannedOrders: true,
                supplyProposals: true,
                _count: {
                    select: {
                        requirements: true,
                        suggestions: true,
                        plannedOrders: true,
                    },
                },
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
                    status: 'OPEN',
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

        return this.prisma.mmMaterial.findMany({
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
    }

    private async snapshotPair(
        companyId: string,
        warehouseId: string,
        materialId: string,
        asOf: Date,
        horizonEnd: Date,
        includeOpenReceipts: boolean,
        currentRunId: string,
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

        // OPEN planning demand only — cancelled demand excluded
        const planningDemands = await this.prisma.mmPlanningDemand.findMany({
            where: {
                companyId,
                materialId,
                status: 'OPEN',
                demandDate: { gte: asOf, lte: horizonEnd },
                OR: [{ warehouseId }, { warehouseId: null }],
            },
        })
        let planningDemand = new Decimal(0)
        let earliestDemandDate: Date | null = null
        const demandSourceTypes: string[] = []
        const demandIds: string[] = []
        for (const d of planningDemands) {
            planningDemand = planningDemand.plus(new Decimal(d.quantity))
            demandSourceTypes.push(d.sourceType)
            demandIds.push(d.id)
            if (
                !earliestDemandDate ||
                d.demandDate.getTime() < earliestDemandDate.getTime()
            ) {
                earliestDemandDate = d.demandDate
            }
        }

        let incomingQty = new Decimal(0)
        if (includeOpenReceipts) {
            // Open PO remaining — exclude POs already represented by open ERs
            const erLinkedPoIds = new Set<string>()
            const erLines = await this.prisma.mmExpectedReceiptLine.findMany({
                where: {
                    materialId,
                    status: { in: ['OPEN', 'PARTIAL'] },
                    expectedReceipt: {
                        companyId,
                        warehouseId,
                        status: { in: ['OPEN', 'IN_PROGRESS'] },
                    },
                },
                include: {
                    expectedReceipt: {
                        select: {
                            id: true,
                            purchaseOrderId: true,
                            expectedDate: true,
                        },
                    },
                },
            })
            for (const line of erLines) {
                const remaining = new Decimal(line.expectedQuantity).minus(
                    line.receivedQuantity,
                )
                if (remaining.gt(0)) {
                    incomingQty = incomingQty.plus(remaining)
                    if (line.expectedReceipt.purchaseOrderId) {
                        erLinkedPoIds.add(line.expectedReceipt.purchaseOrderId)
                    }
                }
            }

            const poLines = await this.prisma.mmPurchaseOrderLine.findMany({
                where: {
                    materialId,
                    purchaseOrder: {
                        companyId,
                        status: { in: ['SENT', 'PARTIALLY_RECEIVED'] },
                        ...(erLinkedPoIds.size
                            ? { id: { notIn: [...erLinkedPoIds] } }
                            : {}),
                    },
                },
                include: { purchaseOrder: { select: { warehouseId: true } } },
            })

            for (const line of poLines) {
                const wh = line.warehouseId ?? line.purchaseOrder.warehouseId
                if (wh !== warehouseId) continue
                const remaining = new Decimal(line.quantity).minus(
                    line.receivedQuantity,
                )
                if (remaining.gt(0)) incomingQty = incomingQty.plus(remaining)
            }
        }

        // Prior OPEN planned supply from other completed runs (not this run)
        const priorPlanned = await this.prisma.mmSupplyProposal.aggregate({
            where: {
                companyId,
                warehouseId,
                materialId,
                status: 'OPEN',
                supplyType: 'PLANNED_ORDER',
                mrpRunId: { not: currentRunId },
            },
            _sum: { quantity: true },
        })
        const plannedSupplyQty = new Decimal(
            priorPlanned._sum.quantity ?? 0,
        )

        // Production supply reserved for future integration
        const productionSupplyQty = new Decimal(0)

        return {
            unrestrictedQty,
            reservedQty,
            qualityQty,
            blockedQty,
            demandQty: planningDemand,
            incomingQty,
            plannedSupplyQty,
            productionSupplyQty,
            earliestDemandDate,
            demandSourceTypes,
            demandIds,
        }
    }
}
