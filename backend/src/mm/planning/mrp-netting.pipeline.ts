import { Decimal } from '@prisma/client/runtime/library'
import type { PlanningCalendarPort } from './planning-calendar.port'
import type { ResolvedPlanningParams } from './reorder-rule.service'
import {
    buildProjectedStockBuckets,
    type ProjectedStockBucket,
} from './projected-stock.service'
import type { PairSnapshot } from './mrp-scope-loader.service'
import {
    computeNetting,
    type NettingResult,
    suggestionReason,
} from './mrp-netting.pure'
import {
    buildMrpExplanation,
    renderExplanationSummary,
    type MrpExplanationBuildInput,
} from './mrp-explanation.builder'

export type { MrpExplanationBuildInput }

export type SafetyStockViolation = {
    bucketDate: Date
    closingQty: Decimal
    violationQty: Decimal
}

export type PipelineInput = {
    snap: PairSnapshot
    params: ResolvedPlanningParams
    asOf: Date
    horizonEnd: Date
    includeOpenReceipts: boolean
    calendar: PlanningCalendarPort
}

export type PipelineOutput = {
    buckets: ProjectedStockBucket[]
    net: NettingResult
    shortageDate: Date | null
    safetyStockViolationQty: Decimal | null
    projectedClosingQty: Decimal | null
    explanationContext: {
        violationDate?: Date
        projectedClosing?: Decimal
        safetyStockViolation?: Decimal
    }
}

/** Step 7: scan buckets where closing falls below safety stock. */
export function applySafetyStockRules(
    buckets: ProjectedStockBucket[],
    safetyStock: Decimal,
): SafetyStockViolation[] {
    const violations: SafetyStockViolation[] = []
    for (const b of buckets) {
        if (safetyStock.gt(0) && b.closingQty.lt(safetyStock)) {
            violations.push({
                bucketDate: b.bucketDate,
                closingQty: b.closingQty,
                violationQty: safetyStock.minus(b.closingQty),
            })
        }
    }
    return violations
}

/** Step 8: pick latest actionable violation (forward-looking shortage date). */
export function detectProjectedShortage(
    violations: SafetyStockViolation[],
): SafetyStockViolation | null {
    if (!violations.length) return null
    return violations.reduce((best, v) => {
        if (v.bucketDate.getTime() > best.bucketDate.getTime()) return v
        if (
            v.bucketDate.getTime() === best.bucketDate.getTime() &&
            v.violationQty.gt(best.violationQty)
        ) {
            return v
        }
        return best
    })
}

/** Steps 10–11: MOQ floor then lot-size ceil rounding. */
export function applyLotSizeAndMoq(
    qty: Decimal,
    minimumOrderQuantity: Decimal,
    lotSize: Decimal,
    reorderQuantity: Decimal,
): Decimal {
    let recommended = qty
    if (minimumOrderQuantity.gt(recommended)) {
        recommended = minimumOrderQuantity
    }
    const lot = lotSize.gt(0) ? lotSize : reorderQuantity
    if (lot.gt(0) && recommended.gt(0)) {
        const ratio = recommended.div(lot)
        const ceil = new Decimal(Math.ceil(Number(ratio)))
        recommended = ceil.mul(lot)
    }
    return recommended
}

/** TIME_PHASED netting driven by bucket safety-stock violations. */
export function computeTimePhasedNetting(input: PipelineInput): PipelineOutput {
    const { snap, params, asOf, horizonEnd, calendar } = input

    const buckets = buildProjectedStockBuckets({
        asOf,
        horizonEnd,
        openingAvailable: snap.openingAvailable,
        demands: snap.demandEvents,
        supplies: snap.supplyEvents,
        reservations: snap.reservationEvents,
    })

    const violations = applySafetyStockRules(buckets, params.safetyStock)
    const worst = detectProjectedShortage(violations)

    let recommendedQty = new Decimal(0)
    let netRequirement = new Decimal(0)
    let shortageQty = new Decimal(0)
    let shortage = false
    let shortageDate: Date | null = null
    let safetyStockViolationQty: Decimal | null = null
    let projectedClosingQty: Decimal | null = null
    let expectedProcurementDate: Date | null = null
    let projectedStockoutDate: Date | null = null

    if (worst) {
        shortage = true
        shortageDate = worst.bucketDate
        safetyStockViolationQty = worst.violationQty
        projectedClosingQty = worst.closingQty
        netRequirement = worst.violationQty
        shortageQty = worst.violationQty
        recommendedQty = applyLotSizeAndMoq(
            worst.violationQty,
            params.minimumOrderQuantity,
            params.lotSize,
            params.reorderQuantity,
        )
        projectedStockoutDate = worst.bucketDate
        if (recommendedQty.gt(0)) {
            expectedProcurementDate = calendar.subtractDays(
                worst.bucketDate,
                params.leadTimeDays || 0,
            )
        }
    }

    const availableNow = snap.openingAvailable
    const procurementType = (params.procurementType ?? 'BUY').toUpperCase()
    let recommendedAction = 'NONE'
    if (recommendedQty.gt(0)) {
        recommendedAction =
            procurementType === 'MAKE'
                ? 'CREATE_PLANNED_PRODUCTION'
                : 'CREATE_PR'
    } else if (shortage) {
        recommendedAction = 'MONITOR'
    }

    const net: NettingResult = {
        availableQty: availableNow,
        grossDemand: snap.demandQty,
        projectedAvailable: snap.openingAvailable
            .plus(snap.incomingQty)
            .plus(snap.plannedSupplyQty),
        netRequirement,
        recommendedQty,
        shortageQty,
        belowReorderPoint: false,
        shortage,
        expectedProcurementDate,
        projectedStockoutDate,
        recommendedAction,
    }

    return {
        buckets,
        net,
        shortageDate,
        safetyStockViolationQty,
        projectedClosingQty,
        explanationContext: {
            violationDate: shortageDate ?? undefined,
            projectedClosing: projectedClosingQty ?? undefined,
            safetyStockViolation: safetyStockViolationQty ?? undefined,
        },
    }
}

/** Aggregate netting for REORDER_POINT / MIN_MAX strategies (Phase 2A). */
export function computeAggregateNetting(input: PipelineInput): PipelineOutput {
    const { snap, params, asOf, horizonEnd, includeOpenReceipts } = input

    const buckets = buildProjectedStockBuckets({
        asOf,
        horizonEnd,
        openingAvailable: snap.openingAvailable,
        demands: snap.demandEvents,
        supplies: snap.supplyEvents,
        reservations: snap.reservationEvents,
    })

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

    return {
        buckets,
        net,
        shortageDate: null,
        safetyStockViolationQty: null,
        projectedClosingQty: null,
        explanationContext: {},
    }
}

/** Main pipeline entry — strategy branch at step 7–9. */
export function runNettingPipeline(input: PipelineInput): PipelineOutput {
    const strategy = (input.params.planningStrategy ?? 'REORDER_POINT').toUpperCase()
    if (strategy === 'TIME_PHASED') {
        return computeTimePhasedNetting(input)
    }
    return computeAggregateNetting(input)
}

export function buildPipelineExplanation(
    input: MrpExplanationBuildInput,
): string {
    return renderExplanationSummary(buildMrpExplanation(input))
}

export { suggestionReason }
