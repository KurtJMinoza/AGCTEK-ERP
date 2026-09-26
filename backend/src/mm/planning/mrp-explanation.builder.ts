import { Decimal } from '@prisma/client/runtime/library'
import type { BomExplosionLine } from './bom-explosion.pure'
import {
    MRP_EXPLANATION_VERSION,
    type MrpDemandLineExplanation,
    type MrpRecommendationExplanation,
} from './mrp-explanation.types'
import type { NettingResult } from './mrp-netting.pure'
import type { PairSnapshot } from './mrp-scope-loader.service'
import type { ResolvedPlanningParams } from './reorder-rule.service'

export type MrpExplanationBuildInput = {
    materialCode: string
    materialName?: string
    warehouseCode?: string
    warehouseId: string
    snap: PairSnapshot
    net: NettingResult
    params: ResolvedPlanningParams
    reasonCode: string
    demandSource: string | null
    planningDate?: Date | null
    expectedProcurementDate?: Date | null
    preferredSupplierId?: string | null
    preferredSupplierCode?: string | null
    independentDemandLines: Array<{
        sourceType: string
        sourceDocumentId?: string | null
        demandDate: Date
        quantity: Decimal
    }>
    bomExplosionLines?: BomExplosionLine[]
    parentMaterialCodes?: Map<string, string>
    timePhased?: {
        violationDate?: Date
        projectedClosing?: Decimal
        safetyStockViolation?: Decimal
    }
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
    SALES: 'Sales',
    SALES_ORDER: 'Sales Order',
    PRODUCTION: 'Production',
    MAINTENANCE: 'Maintenance',
    PROJECTS: 'Projects',
    MANUAL_INTERNAL: 'Manual',
    MANUAL: 'Manual',
    FORECAST: 'Forecast',
    IMPORTED: 'Imported',
    BOM_EXPLOSION: 'BOM Explosion',
}

export function demandLineLabel(
    sourceType: string,
    sourceDocumentId?: string | null,
): string {
    if (sourceDocumentId) return sourceDocumentId
    return SOURCE_TYPE_LABELS[sourceType] ?? sourceType
}

export function buildIndependentDemandLines(
    lines: MrpExplanationBuildInput['independentDemandLines'],
): MrpDemandLineExplanation[] {
    return lines.map((line) => ({
        sourceType: line.sourceType,
        label: demandLineLabel(line.sourceType, line.sourceDocumentId),
        sourceDocumentId: line.sourceDocumentId ?? null,
        demandDate: line.demandDate.toISOString().slice(0, 10),
        quantity: line.quantity.toString(),
    }))
}

export function buildBomDemandLines(
    lines: BomExplosionLine[],
    parentMaterialCodes: Map<string, string>,
): MrpDemandLineExplanation[] {
    return lines
        .filter((line) => !line.warningCode)
        .map((line) => {
            const parentCode =
                parentMaterialCodes.get(line.parentMaterialId) ??
                line.parentMaterialId
            return {
                sourceType: 'BOM_EXPLOSION',
                label: `${parentCode} via BOM`,
                sourceDocumentId: line.parentMaterialId,
                demandDate: line.demandDate.toISOString().slice(0, 10),
                quantity: line.grossComponentQty.toString(),
            }
        })
}

export function resolveReasonSummary(
    reasonCode: string,
    planningRule: string,
): string {
    const strategy = (planningRule ?? 'REORDER_POINT').toUpperCase()
    if (reasonCode === 'SHORTAGE' && strategy === 'TIME_PHASED') {
        return 'Projected availability falls below safety stock.'
    }
    if (reasonCode === 'SHORTAGE') {
        return 'Projected availability falls below gross demand.'
    }
    if (reasonCode === 'BELOW_REORDER_POINT') {
        return 'Available quantity falls below reorder point.'
    }
    return 'Net requirement after supply netting.'
}

function dec(value: Decimal | number | string | null | undefined): string {
    if (value == null) return '0'
    return new Decimal(value).toString()
}

function isoDate(value?: Date | null): string | undefined {
    if (!value) return undefined
    return value.toISOString().slice(0, 10)
}

export function buildMrpExplanation(
    input: MrpExplanationBuildInput,
): MrpRecommendationExplanation {
    const projectedSupply = input.snap.incomingQty
        .plus(input.snap.plannedSupplyQty)
        .plus(input.snap.productionSupplyQty)

    const independentLines = buildIndependentDemandLines(
        input.independentDemandLines,
    )
    const bomLines = buildBomDemandLines(
        input.bomExplosionLines ?? [],
        input.parentMaterialCodes ?? new Map(),
    )
    const demandLines = [...independentLines, ...bomLines]

    const sourceDemandReferences = [
        ...new Set(
            demandLines
                .map((line) => line.label)
                .filter((label) => label.length > 0),
        ),
    ]

    const planningRule = input.params.planningStrategy ?? 'REORDER_POINT'
    const reasonSummary = resolveReasonSummary(input.reasonCode, planningRule)

    return {
        version: MRP_EXPLANATION_VERSION,
        materialCode: input.materialCode,
        materialName: input.materialName,
        warehouseCode: input.warehouseCode,
        planningDate: isoDate(input.planningDate),
        demandLines,
        grossDemand: dec(input.net.grossDemand),
        openingStock: dec(input.snap.unrestrictedQty),
        reserved: dec(input.snap.reservedQty),
        projectedSupply: dec(projectedSupply),
        safetyStock: dec(input.params.safetyStock),
        projectedAvailable: dec(input.net.projectedAvailable),
        netRequirement: dec(input.net.netRequirement),
        moq: dec(input.params.minimumOrderQuantity),
        lotSize: dec(
            input.params.lotSize.gt(0)
                ? input.params.lotSize
                : input.params.reorderQuantity,
        ),
        recommendedQuantity: dec(input.net.recommendedQty),
        reasonCode: input.reasonCode,
        reasonSummary,
        planningRule,
        sourceDemandReferences,
        independentDemandQty: dec(input.snap.independentDemandQty),
        bomDependentDemandQty: dec(input.snap.bomDependentDemandQty),
        timePhased: input.timePhased
            ? {
                  violationDate: isoDate(input.timePhased.violationDate),
                  projectedClosing: input.timePhased.projectedClosing
                      ? dec(input.timePhased.projectedClosing)
                      : undefined,
                  safetyStockViolation: input.timePhased.safetyStockViolation
                      ? dec(input.timePhased.safetyStockViolation)
                      : undefined,
              }
            : undefined,
        leadTimeDays: input.params.leadTimeDays,
        expectedProcurementDate: isoDate(input.expectedProcurementDate),
        preferredSupplierCode: input.preferredSupplierCode ?? null,
    }
}

export function renderExplanationSummary(
    explanation: MrpRecommendationExplanation,
): string {
    const demandParts = explanation.demandLines
        .map((line) => `${line.label} = ${line.quantity}`)
        .join('; ')

    const parts = [
        `Material: ${explanation.materialCode}`,
        explanation.planningDate
            ? `Planning date: ${explanation.planningDate}`
            : null,
        demandParts ? `Demand: ${demandParts}` : null,
        `Gross demand: ${explanation.grossDemand}`,
        `Opening stock: ${explanation.openingStock}`,
        `Reserved: ${explanation.reserved}`,
        `Projected supply: ${explanation.projectedSupply}`,
        `Safety stock: ${explanation.safetyStock}`,
        `Projected available: ${explanation.projectedAvailable}`,
        `Net requirement: ${explanation.netRequirement}`,
        `MOQ: ${explanation.moq}`,
        `Lot size: ${explanation.lotSize}`,
        `Recommended quantity: ${explanation.recommendedQuantity}`,
        `Reason: ${explanation.reasonSummary}`,
        explanation.sourceDemandReferences.length
            ? `Source demand: ${explanation.sourceDemandReferences.join(', ')}`
            : null,
        `Demand source: ${explanation.sourceDemandReferences[0] ?? 'REORDER'}`,
        `Shortage reason: ${explanation.reasonCode}`,
        `Planning rule: ${explanation.planningRule}`,
    ]

    if (
        explanation.bomDependentDemandQty &&
        new Decimal(explanation.bomDependentDemandQty).gt(0)
    ) {
        parts.push(
            `Independent demand: ${explanation.independentDemandQty ?? '0'}; BOM dependent: ${explanation.bomDependentDemandQty}`,
        )
    }

    if (explanation.timePhased?.violationDate) {
        parts.push(
            `Violation date: ${explanation.timePhased.violationDate}`,
            `Projected closing: ${explanation.timePhased.projectedClosing ?? 'n/a'}`,
            `Safety deficit: ${explanation.timePhased.safetyStockViolation ?? 'n/a'}`,
        )
    }

    return parts.filter(Boolean).join(' | ')
}
