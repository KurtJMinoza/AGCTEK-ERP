import { Decimal } from '@prisma/client/runtime/library'
import type { BomComponentLine, BomHeader } from './bom-provider'
import type { DemandEvent } from './projected-stock.service'
import { atpPairKey } from '../inventory/inventory-availability.service'
import { computeComponentQuantityPure } from './bom-quantity.calculator'

export type BomExplosionWarningCode =
    | 'INACTIVE_BOM'
    | 'INACTIVE_COMPONENT'
    | 'INVALID_EFFECTIVE_DATE'
    | 'MISSING_MATERIAL'
    | 'INVALID_QUANTITY'
    | 'CIRCULAR_BOM'
    | 'UOM_CONVERSION'

export type BomExplosionWarning = {
    code: BomExplosionWarningCode
    message: string
    parentMaterialId?: string
    componentMaterialId?: string
}

export type BomExplosionLine = {
    parentMaterialId: string
    componentMaterialId: string
    warehouseId: string
    demandDate: Date
    level: number
    parentDemandQty: Decimal
    quantityPer: Decimal
    grossComponentQty: Decimal
    uomId: string
    yieldFactor?: Decimal
    scrapFactor?: Decimal
    explosionReason: string
    warningCode?: BomExplosionWarningCode
}

export type BomExplosionAggregate = {
    lines: BomExplosionLine[]
    dependentDemandByPair: Map<string, DemandEvent[]>
    componentMaterialIds: Set<string>
    warnings: BomExplosionWarning[]
}

export type PlanningDemandInput = {
    materialId: string
    warehouseId: string | null
    demandDate: Date
    quantity: Decimal
}

export function isEffectiveOn(asOf: Date, from?: Date | null, to?: Date | null): boolean {
    const t = asOf.getTime()
    if (from && from.getTime() > t) return false
    if (to && to.getTime() < t) return false
    return true
}

export function isBomHeaderActive(header: BomHeader, asOf: Date): boolean {
    if (header.status !== 'ACTIVE') return false
    return isEffectiveOn(asOf, header.effectiveFrom, header.effectiveTo)
}

export function isComponentLineActive(line: BomComponentLine, asOf: Date): boolean {
    if (line.status === 'INACTIVE') return false
    return isEffectiveOn(asOf, line.validFrom, line.validTo)
}

export function buildExplosionReason(opts: {
    parentCode: string
    parentDemandQty: Decimal
    componentCode: string
    quantityPer: Decimal
    grossComponentQty: Decimal
}): string {
    return `${opts.parentCode} demand = ${opts.parentDemandQty.toString()}; ${opts.componentCode} = ${opts.quantityPer.toString()}/${opts.parentCode} → gross ${opts.grossComponentQty.toString()}`
}

export function mergeDependentDemand(
    target: Map<string, DemandEvent[]>,
    warehouseId: string,
    materialId: string,
    event: DemandEvent,
): void {
    const key = atpPairKey(warehouseId, materialId)
    const existing = target.get(key) ?? []
    existing.push(event)
    target.set(key, existing)
}

export function aggregateDependentDemands(
    lines: BomExplosionLine[],
): Map<string, DemandEvent[]> {
    const map = new Map<string, DemandEvent[]>()
    for (const line of lines) {
        if (line.warningCode) continue
        mergeDependentDemand(map, line.warehouseId, line.componentMaterialId, {
            date: line.demandDate,
            quantity: line.grossComponentQty,
        })
    }
    return map
}

export type ExplosionWalkContext = {
    parentMaterialId: string
    parentMaterialCode: string
    parentQuantity: Decimal
    warehouseId: string
    demandDate: Date
    level: number
    asOf: Date
    mode: 'singleLevel' | 'multiLevel'
    visitedPath: string[]
    materialCodes: Map<string, string>
    materialBaseUom: Map<string, string>
    knownMaterialIds: Set<string>
    convertUom: (
        materialId: string,
        fromUomId: string,
        toUomId: string,
        quantity: Decimal,
    ) => Promise<Decimal>
    getBom: (
        materialId: string,
    ) => Promise<{ header: BomHeader | null; components: BomComponentLine[] }>
}

export async function walkBomExplosion(
    ctx: ExplosionWalkContext,
): Promise<{ lines: BomExplosionLine[]; warnings: BomExplosionWarning[] }> {
    const lines: BomExplosionLine[] = []
    const warnings: BomExplosionWarning[] = []

    if (ctx.visitedPath.includes(ctx.parentMaterialId)) {
        warnings.push({
            code: 'CIRCULAR_BOM',
            message: `Circular BOM detected: ${[...ctx.visitedPath, ctx.parentMaterialId].join(' → ')}`,
            parentMaterialId: ctx.parentMaterialId,
        })
        return { lines, warnings }
    }

    const { header, components } = await ctx.getBom(ctx.parentMaterialId)
    if (!header) return { lines, warnings }

    if (!isBomHeaderActive(header, ctx.asOf)) {
        warnings.push({
            code: 'INACTIVE_BOM',
            message: `BOM for ${ctx.parentMaterialCode} is inactive or outside effective date`,
            parentMaterialId: ctx.parentMaterialId,
        })
        return { lines, warnings }
    }

    const yieldFactor = new Decimal(header.yieldFactor ?? 1)
    const nextPath = [...ctx.visitedPath, ctx.parentMaterialId]

    for (const comp of components) {
        const componentCode =
            ctx.materialCodes.get(comp.componentMaterialId) ??
            comp.componentMaterialId

        if (!isComponentLineActive(comp, ctx.asOf)) {
            warnings.push({
                code: 'INACTIVE_COMPONENT',
                message: `Component ${componentCode} is inactive or outside validity window`,
                parentMaterialId: ctx.parentMaterialId,
                componentMaterialId: comp.componentMaterialId,
            })
            continue
        }

        if (!comp.quantityPer || comp.quantityPer <= 0) {
            warnings.push({
                code: 'INVALID_QUANTITY',
                message: `Invalid quantityPer for component ${componentCode}`,
                parentMaterialId: ctx.parentMaterialId,
                componentMaterialId: comp.componentMaterialId,
            })
            continue
        }

        if (!ctx.knownMaterialIds.has(comp.componentMaterialId)) {
            warnings.push({
                code: 'MISSING_MATERIAL',
                message: `Component material ${componentCode} not found in material master`,
                parentMaterialId: ctx.parentMaterialId,
                componentMaterialId: comp.componentMaterialId,
            })
            continue
        }

        const quantityPer = new Decimal(comp.quantityPer)
        const scrapFactor = new Decimal(comp.scrapFactor ?? 0)
        let grossQty = computeComponentQuantityPure({
            parentQuantity: ctx.parentQuantity,
            quantityPer,
            bomYieldFactor: yieldFactor,
            componentScrapFactor: scrapFactor,
        })

        const baseUomId = ctx.materialBaseUom.get(comp.componentMaterialId)
        if (!baseUomId) {
            warnings.push({
                code: 'MISSING_MATERIAL',
                message: `Base UOM missing for component ${componentCode}`,
                parentMaterialId: ctx.parentMaterialId,
                componentMaterialId: comp.componentMaterialId,
            })
            continue
        }

        if (comp.uomId !== baseUomId) {
            try {
                grossQty = await ctx.convertUom(
                    comp.componentMaterialId,
                    comp.uomId,
                    baseUomId,
                    grossQty,
                )
            } catch {
                warnings.push({
                    code: 'UOM_CONVERSION',
                    message: `UOM conversion failed for ${componentCode} (${comp.uomId} → ${baseUomId})`,
                    parentMaterialId: ctx.parentMaterialId,
                    componentMaterialId: comp.componentMaterialId,
                })
                continue
            }
        }

        lines.push({
            parentMaterialId: ctx.parentMaterialId,
            componentMaterialId: comp.componentMaterialId,
            warehouseId: ctx.warehouseId,
            demandDate: ctx.demandDate,
            level: ctx.level,
            parentDemandQty: ctx.parentQuantity,
            quantityPer,
            grossComponentQty: grossQty,
            uomId: baseUomId,
            yieldFactor,
            scrapFactor,
            explosionReason: buildExplosionReason({
                parentCode: ctx.parentMaterialCode,
                parentDemandQty: ctx.parentQuantity,
                componentCode,
                quantityPer,
                grossComponentQty: grossQty,
            }),
        })

        if (ctx.mode === 'multiLevel') {
            const child = await walkBomExplosion({
                ...ctx,
                parentMaterialId: comp.componentMaterialId,
                parentMaterialCode: componentCode,
                parentQuantity: grossQty,
                level: ctx.level + 1,
                visitedPath: nextPath,
            })
            lines.push(...child.lines)
            warnings.push(...child.warnings)
        }
    }

    return { lines, warnings }
}

export function resolveDemandWarehouses(
    demand: PlanningDemandInput,
    warehouseIds: string[],
): string[] {
    if (demand.warehouseId) return [demand.warehouseId]
    return warehouseIds
}
