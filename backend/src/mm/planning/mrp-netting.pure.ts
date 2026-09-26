import { Decimal } from '@prisma/client/runtime/library'

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
    const unique = [...new Set(sourceTypes.map(canonicalizeDemandSource))]
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
    availableQuantity?: Decimal
    safetyStock?: Decimal
    incomingSupply?: Decimal
    planningRule?: string
}): string {
    const parts = [
        `Demand source: ${opts.demandSource ?? 'REORDER'}`,
        `Shortage reason: ${opts.reason}`,
        `Required date: ${opts.requiredDate.toISOString().slice(0, 10)}`,
        `Suggested qty: ${opts.quantity.toString()}`,
        `Available: ${opts.availableQuantity?.toString() ?? 'n/a'}`,
        `Safety stock: ${opts.safetyStock?.toString() ?? 'n/a'}`,
        `Incoming supply: ${opts.incomingSupply?.toString() ?? 'n/a'}`,
        `Planning rule: ${opts.planningRule ?? 'REORDER_POINT'}`,
        `Lead time: ${opts.leadTimeDays} day(s)`,
        `MOQ: ${opts.moq.toString()}`,
        `Target warehouse: ${opts.warehouseId}`,
        `Suggested supplier: ${opts.preferredSupplierId ?? 'none'}`,
    ]
    return parts.join(' | ')
}

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
        recommendedAction =
            procurementType === 'MAKE'
                ? 'CREATE_PLANNED_PRODUCTION'
                : 'CREATE_PR'
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
