import { forwardRef, Inject, Injectable, Optional } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { ReorderRuleService } from './reorder-rule.service'
import { BomExplosionService } from './bom-explosion.service'
import { atpPairKey } from '../inventory/inventory-availability.service'
import { ProcurementSuggestionService } from './procurement-suggestion.service'
import { InventoryAvailabilityService } from '../inventory/inventory-availability.service'
import {
    ProjectedStockService,
    type DemandEvent,
    type SupplyEvent,
    type ReservationEvent,
} from './projected-stock.service'
import { MrpScopeLoaderService } from './mrp-scope-loader.service'
import { PlanningCalendarService } from './planning-calendar.service'
import { runNettingPipeline } from './mrp-netting.pipeline'
import {
    buildMrpExplanation,
    renderExplanationSummary,
} from './mrp-explanation.builder'
import type { MrpRecommendationExplanation } from './mrp-explanation.types'
import {
    aggregateDemandSource,
    suggestionReason,
} from './mrp-netting.pure'

export type { NettingInput, NettingResult } from './mrp-netting.pure'
export {
    computeNetting,
    canonicalizeDemandSource,
    aggregateDemandSource,
    suggestionReason,
    buildSuggestionExplanation,
} from './mrp-netting.pure'

@Injectable()
export class MrpEngineService {
    constructor(
        private prisma: PrismaService,
        private reorderRules: ReorderRuleService,
        private availability: InventoryAvailabilityService,
        private projectedStock: ProjectedStockService,
        private scopeLoader: MrpScopeLoaderService,
        private planningCalendar: PlanningCalendarService,
        private bomExplosion: BomExplosionService,
        @Optional()
        @Inject(forwardRef(() => ProcurementSuggestionService))
        private suggestions?: ProcurementSuggestionService,
    ) {}

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
            await this.projectedStock.clearForRun(runId)
            await this.prisma.mmBomExplosionTrace.deleteMany({
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
                select: { id: true, plantId: true, code: true },
            })
            const warehouseIds = warehouses.map((w) => w.id)
            const warehouseCodeById = new Map(
                warehouses.map((w) => [w.id, w.code]),
            )
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
            const initialMaterialIds = materials.map((m) => m.id)

            const initialScope = await this.scopeLoader.loadScope({
                companyId,
                warehouseIds,
                materialIds: initialMaterialIds,
                asOf,
                horizonEnd,
                includeOpenReceipts,
                currentRunId: runId,
            })

            const explosion = await this.bomExplosion.explodeFromDemands({
                companyId,
                plantId: run.plantId,
                warehouseIds,
                demands: initialScope.planningDemands.map((d) => ({
                    materialId: d.materialId,
                    warehouseId: d.warehouseId,
                    demandDate: d.demandDate,
                    quantity: d.quantity,
                })),
                asOf,
                mode: 'multiLevel',
            })

            const expandedMaterialIdSet = new Set([
                ...initialMaterialIds,
                ...explosion.componentMaterialIds,
            ])
            const expandedMaterialIds = [...expandedMaterialIdSet]

            let scopeSnapshot = initialScope
            let allMaterials = materials
            if (expandedMaterialIds.length > initialMaterialIds.length) {
                allMaterials = await this.resolveMaterials(
                    companyId,
                    warehouseIds,
                    asOf,
                    horizonEnd,
                    expandedMaterialIds,
                )
                scopeSnapshot = await this.scopeLoader.loadScope({
                    companyId,
                    warehouseIds,
                    materialIds: expandedMaterialIds,
                    asOf,
                    horizonEnd,
                    includeOpenReceipts,
                    currentRunId: runId,
                })
            }

            const calendar = this.planningCalendar.resolve({
                companyId,
                plantId: run.plantId,
                warehouseId: run.warehouseId,
            })

            const materialCodeById = new Map(
                allMaterials.map((m) => [m.id, m.materialCode]),
            )
            const supplierIdSet = new Set<string>()
            for (const supplierId of scopeSnapshot.preferredSupplierByMaterial.values()) {
                supplierIdSet.add(supplierId)
            }
            for (const material of allMaterials) {
                if (material.preferredSupplierId) {
                    supplierIdSet.add(material.preferredSupplierId)
                }
            }
            const suppliers = supplierIdSet.size
                ? await this.prisma.mmSupplier.findMany({
                      where: { id: { in: [...supplierIdSet] } },
                      select: { id: true, supplierCode: true },
                  })
                : []
            const supplierCodeById = new Map(
                suppliers.map((s) => [s.id, s.supplierCode]),
            )

            type PairWork = {
                material: (typeof allMaterials)[0]
                warehouseId: string
                plantId: string | null
            }
            const pairs: PairWork[] = []
            for (const material of allMaterials) {
                for (const warehouseId of warehouseIds) {
                    pairs.push({
                        material,
                        warehouseId,
                        plantId:
                            warehouses.find((w) => w.id === warehouseId)
                                ?.plantId ?? run.plantId,
                    })
                }
            }
            pairs.sort(
                (a, b) =>
                    a.material.id.localeCompare(b.material.id) ||
                    a.warehouseId.localeCompare(b.warehouseId),
            )

            const requirementRows: any[] = []
            const projectedStockBuckets: {
                warehouseId: string
                materialId: string
                buckets: any[]
            }[] = []
            let plannedSeq = 0
            let proposalSeq = 0
            let timePhasedCount = 0
            let aggregateCount = 0

            for (const { material, warehouseId, plantId } of pairs) {
                const pairKey = atpPairKey(warehouseId, material.id)
                const additionalDemandEvents =
                    explosion.dependentDemandByPair.get(pairKey) ?? []

                const params = this.scopeLoader.resolveParams(
                    scopeSnapshot,
                    material.id,
                    warehouseId,
                    asOf,
                )
                const pairHorizonDays =
                    params.planningHorizonDays ?? horizonDays
                const pairHorizonEnd = new Date(asOf)
                pairHorizonEnd.setDate(
                    pairHorizonEnd.getDate() + pairHorizonDays,
                )

                const snap = this.scopeLoader.buildPairSnapshot(
                    scopeSnapshot,
                    companyId,
                    warehouseId,
                    material.id,
                    asOf,
                    pairHorizonEnd,
                    includeOpenReceipts,
                    { additionalDemandEvents },
                )

                const pipelineResult = runNettingPipeline({
                    snap,
                    params,
                    asOf,
                    horizonEnd: pairHorizonEnd,
                    includeOpenReceipts,
                    calendar,
                })
                const net = pipelineResult.net

                if (params.planningStrategy === 'TIME_PHASED') {
                    timePhasedCount += 1
                } else {
                    aggregateCount += 1
                }

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

                projectedStockBuckets.push({
                    warehouseId,
                    materialId: material.id,
                    buckets: pipelineResult.buckets,
                })

                let source = aggregateDemandSource(snap.demandSourceTypes)
                if (!source && net.recommendedQty.gt(0)) {
                    source = 'REORDER'
                }

                const requiredDate =
                    pipelineResult.shortageDate ??
                    snap.earliestDemandDate ??
                    asOf

                const preferredSupplierId =
                    this.scopeLoader.resolvePreferredSupplier(
                        scopeSnapshot,
                        material.id,
                    )

                let reason: string | null = null
                if (net.recommendedQty.gt(0)) {
                    reason = suggestionReason(net)
                }

                const reasonCode = reason ?? 'NET_REQUIREMENT'
                const bomExplosionLines = explosion.lines.filter(
                    (line) =>
                        line.componentMaterialId === material.id &&
                        line.warehouseId === warehouseId &&
                        !line.warningCode,
                )
                const explanationJson = buildMrpExplanation({
                    materialCode: material.materialCode,
                    materialName: material.materialName,
                    warehouseCode: warehouseCodeById.get(warehouseId),
                    warehouseId,
                    snap,
                    net,
                    params,
                    reasonCode,
                    demandSource: source,
                    planningDate:
                        pipelineResult.shortageDate ?? requiredDate,
                    expectedProcurementDate: net.expectedProcurementDate,
                    preferredSupplierId: preferredSupplierId ?? null,
                    preferredSupplierCode: preferredSupplierId
                        ? (supplierCodeById.get(preferredSupplierId) ?? null)
                        : null,
                    independentDemandLines: snap.independentDemandLines,
                    bomExplosionLines,
                    parentMaterialCodes: materialCodeById,
                    timePhased: pipelineResult.explanationContext,
                })

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
                    independentDemandQty: snap.independentDemandQty,
                    bomDependentDemandQty: snap.bomDependentDemandQty,
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
                    shortageDate: pipelineResult.shortageDate,
                    safetyStockViolationQty: pipelineResult.safetyStockViolationQty,
                    belowReorderPoint: net.belowReorderPoint,
                    shortage: net.shortage,
                    explanationJson:
                        explanationJson as unknown as MrpRecommendationExplanation,
                    uomId: material.baseUomId,
                    purchasable: material.purchasable,
                    preferredSupplierId,
                    reason,
                    demandIds: snap.demandIds,
                    plantId,
                    params,
                    pipelineResult,
                })
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
                    pipelineResult,
                    explanationJson,
                    ...data
                } = row
                const created = await this.prisma.mmMaterialRequirement.create({
                    data: {
                        ...data,
                        explanationJson: explanationJson ?? undefined,
                    },
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
                    const explanation =
                        explanationJson != null
                            ? renderExplanationSummary(
                                  explanationJson as MrpRecommendationExplanation,
                              )
                            : null

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
                        availableQuantity: created.availableQty,
                        safetyStockQty: created.safetyStock,
                        incomingSupplyQty: created.incomingQty,
                        grossDemandQty: created.grossDemand,
                        planningRule: created.planningStrategy ?? 'REORDER_POINT',
                        shortageDate: created.shortageDate ?? null,
                        projectedClosingQty:
                            pipelineResult?.projectedClosingQty ?? null,
                        explanation,
                        explanationJson: explanationJson ?? undefined,
                        status: 'OPEN',
                    })
                }
            }

            if (explosion.lines.length) {
                await this.prisma.mmBomExplosionTrace.createMany({
                    data: explosion.lines.map((line) => ({
                        mrpRunId: runId,
                        companyId,
                        warehouseId: line.warehouseId,
                        parentMaterialId: line.parentMaterialId,
                        componentMaterialId: line.componentMaterialId,
                        level: line.level,
                        demandDate: line.demandDate,
                        parentDemandQty: line.parentDemandQty,
                        quantityPer: line.quantityPer,
                        grossComponentQty: line.grossComponentQty,
                        uomId: line.uomId,
                        yieldFactor: line.yieldFactor ?? null,
                        scrapFactor: line.scrapFactor ?? null,
                        explosionReason: line.explosionReason,
                        warningCode: line.warningCode ?? null,
                    })),
                })
            }

            if (projectedStockBuckets.length) {
                const allBucketRows = projectedStockBuckets.flatMap((row) =>
                    row.buckets.map((b: any) => ({
                        mrpRunId: runId,
                        companyId,
                        warehouseId: row.warehouseId,
                        materialId: row.materialId,
                        bucketDate: b.bucketDate,
                        openingQty: b.openingQty,
                        demandQty: b.demandQty,
                        supplyQty: b.supplyQty,
                        reservationQty: b.reservationQty,
                        closingQty: b.closingQty,
                    })),
                )
                if (allBucketRows.length) {
                    await this.prisma.mmProjectedStock.createMany({
                        data: allBucketRows,
                    })
                }
            }

            if (suggestionRows.length) {
                await this.prisma.mmProcurementSuggestion.createMany({
                    data: suggestionRows,
                })
            }

            // Optional auto-PR when configured on the run (dedup by run+material+warehouse)
            if (run.autoCreatePurchaseRequisitions && this.suggestions) {
                const open = await this.prisma.mmProcurementSuggestion.findMany({
                    where: {
                        mrpRunId: runId,
                        status: 'OPEN',
                        suggestionType: 'PR_RECOMMENDATION',
                    },
                    select: {
                        id: true,
                        materialId: true,
                        warehouseId: true,
                    },
                })
                for (const s of open) {
                    const existingPr =
                        await this.prisma.mmPurchaseRequisitionLine.findFirst({
                            where: {
                                materialId: s.materialId,
                                warehouseId: s.warehouseId,
                                requisition: {
                                    sourceMrpRunId: runId,
                                    status: { notIn: ['CANCELLED', 'REJECTED'] },
                                },
                            },
                            select: { id: true },
                        })
                    if (existingPr) continue
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
                        materialCount: allMaterials.length,
                        nettingEngine: '2D',
                        explainability: true,
                        bomExplosion: true,
                        explosionLineCount: explosion.lines.length,
                        explosionWarningCount: explosion.warnings.length,
                        calendarMode: calendar.mode,
                        strategyBranches: {
                            timePhased: timePhasedCount,
                            aggregate: aggregateCount,
                        },
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
        extraMaterialIds?: string[],
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
        for (const id of extraMaterialIds ?? []) {
            ids.add(id)
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
                materialCode: true,
                materialName: true,
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
        const atp = await this.availability.getAvailability({
            companyId,
            warehouseId,
            materialId,
        })

        const unrestrictedQty = new Decimal(atp.unrestrictedOnHand)
        const reservedQty = new Decimal(atp.reserved)
        const openingAvailable = new Decimal(atp.available)

        let qualityQty = new Decimal(0)
        let blockedQty = new Decimal(0)
        for (const b of atp.balances) {
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
        const demandEvents: DemandEvent[] = []
        for (const d of planningDemands) {
            const qty = new Decimal(d.quantity)
            planningDemand = planningDemand.plus(qty)
            demandSourceTypes.push(d.sourceType)
            demandIds.push(d.id)
            demandEvents.push({ date: d.demandDate, quantity: qty })
            if (
                !earliestDemandDate ||
                d.demandDate.getTime() < earliestDemandDate.getTime()
            ) {
                earliestDemandDate = d.demandDate
            }
        }

        let incomingQty = new Decimal(0)
        const supplyEvents: SupplyEvent[] = []
        if (includeOpenReceipts) {
            const erLinkedPoIds = new Set<string>()
            const erLines = await this.prisma.mmExpectedReceiptLine.findMany({
                where: {
                    materialId,
                    status: { in: ['OPEN', 'PARTIAL'] },
                    expectedReceipt: {
                        companyId,
                        warehouseId,
                        status: { in: ['OPEN', 'IN_PROGRESS'] },
                        expectedDate: { gte: asOf, lte: horizonEnd },
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
                    const supplyDate =
                        line.expectedReceipt.expectedDate ?? asOf
                    supplyEvents.push({ date: supplyDate, quantity: remaining })
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
                include: {
                    purchaseOrder: {
                        select: {
                            warehouseId: true,
                            expectedDeliveryDate: true,
                        },
                    },
                },
            })

            for (const line of poLines) {
                const wh = line.warehouseId ?? line.purchaseOrder.warehouseId
                if (wh !== warehouseId) continue
                const remaining = new Decimal(line.quantity).minus(
                    line.receivedQuantity,
                )
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

        const priorPlanned = await this.prisma.mmSupplyProposal.findMany({
            where: {
                companyId,
                warehouseId,
                materialId,
                status: 'OPEN',
                supplyType: 'PLANNED_ORDER',
                mrpRunId: { not: currentRunId },
                availableDate: { gte: asOf, lte: horizonEnd },
            },
            select: { quantity: true, availableDate: true },
        })
        let plannedSupplyQty = new Decimal(0)
        for (const p of priorPlanned) {
            const qty = new Decimal(p.quantity)
            plannedSupplyQty = plannedSupplyQty.plus(qty)
            supplyEvents.push({ date: p.availableDate, quantity: qty })
        }

        const productionSupplyQty = new Decimal(0)

        const reservationEvents: ReservationEvent[] = []
        const openReservations =
            await this.prisma.mmInventoryReservation.findMany({
                where: {
                    companyId,
                    warehouseId,
                    materialId,
                    status: { in: ['OPEN', 'PARTIAL'] },
                },
                select: {
                    quantity: true,
                    reservedQuantity: true,
                    validUntil: true,
                    createdAt: true,
                },
            })
        for (const r of openReservations) {
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
            incomingQty,
            plannedSupplyQty,
            productionSupplyQty,
            earliestDemandDate,
            demandSourceTypes,
            demandIds,
            demandEvents,
            supplyEvents,
            reservationEvents,
        }
    }
}
