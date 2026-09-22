import { MM_DEMAND_MODULES, type MmDemandSyncInput } from './mm-demand.types'
import { buildDemandReferenceKey, demandSourceTypeFromModule } from './mm-demand.util'

export function sdLinesFromSalesOrderPayload(
    payload: Record<string, unknown>,
    materialUomById: Map<string, string>,
): MmDemandSyncInput[] {
    const companyId = String(payload.companyId)
    const warehouseId = String(payload.warehouseId)
    const salesOrderId = String(payload.salesOrderId)
    const lines = (payload.lines as Array<Record<string, unknown>>) ?? []

    return lines.map((line) => {
        const lineId = String(line.lineId)
        const materialId = String(line.materialId)
        return {
            sourceModule: MM_DEMAND_MODULES.SD,
            sourceDocumentType: 'SALES_ORDER',
            sourceDocumentId: salesOrderId,
            sourceDocumentLineId: lineId,
            companyId,
            materialId,
            warehouseId,
            requiredDate: new Date(),
            quantity: Number(line.quantity),
            uomId: materialUomById.get(materialId) ?? String(line.uomId ?? ''),
            priority: 50,
            status: 'OPEN' as const,
            demandReferenceKey: buildDemandReferenceKey(
                MM_DEMAND_MODULES.SD,
                'SALES_ORDER',
                salesOrderId,
                lineId,
            ),
            sourceType: demandSourceTypeFromModule(MM_DEMAND_MODULES.SD),
        }
    })
}

export function sdChangedLinesFromPayload(
    payload: Record<string, unknown>,
    materialUomById: Map<string, string>,
): MmDemandSyncInput[] {
    const companyId = String(payload.companyId)
    const warehouseId = String(payload.warehouseId)
    const salesOrderId = String(payload.salesOrderId)
    const allLines = (payload.lines as Array<Record<string, unknown>>) ?? []
    const lineById = new Map(allLines.map((l) => [String(l.lineId), l]))
    const changed =
        (payload.changedLines as Array<Record<string, unknown>>) ?? []

    return changed.map((change) => {
        const lineId = String(change.lineId)
        const line = lineById.get(lineId)
        const materialId = String(line?.materialId ?? change.materialId ?? '')
        const newQty = Number(change.newQuantity)
        return {
            sourceModule: MM_DEMAND_MODULES.SD,
            sourceDocumentType: 'SALES_ORDER',
            sourceDocumentId: salesOrderId,
            sourceDocumentLineId: lineId,
            companyId,
            materialId,
            warehouseId,
            requiredDate: new Date(),
            quantity: newQty,
            uomId: materialUomById.get(materialId) ?? String(line?.uomId ?? ''),
            priority: 50,
            status: newQty <= 0 ? ('CANCELLED' as const) : ('OPEN' as const),
            demandReferenceKey: buildDemandReferenceKey(
                MM_DEMAND_MODULES.SD,
                'SALES_ORDER',
                salesOrderId,
                lineId,
            ),
            sourceType: demandSourceTypeFromModule(MM_DEMAND_MODULES.SD),
        }
    })
}

export function productionChangedLinesFromPayload(
    payload: Record<string, unknown>,
    materialUomById: Map<string, string>,
): MmDemandSyncInput[] {
    const companyId = String(payload.companyId)
    const warehouseId = String(payload.warehouseId)
    const productionOrderId = String(payload.productionOrderId)
    const allMaterials =
        (payload.materials as Array<Record<string, unknown>>) ?? []
    const lineById = new Map(allMaterials.map((m) => [String(m.lineId), m]))
    const changed =
        (payload.changedMaterials as Array<Record<string, unknown>>) ?? []

    return changed.map((change) => {
        const lineId = String(change.lineId)
        const mat = lineById.get(lineId)
        const materialId = String(mat?.materialId ?? change.materialId ?? '')
        const newQty = Number(change.newQuantity)
        return {
            sourceModule: MM_DEMAND_MODULES.PRODUCTION,
            sourceDocumentType: 'PRODUCTION_ORDER',
            sourceDocumentId: productionOrderId,
            sourceDocumentLineId: lineId,
            companyId,
            materialId,
            warehouseId,
            plantId:
                typeof payload.plantId === 'string' ? payload.plantId : undefined,
            requiredDate: new Date(),
            quantity: newQty,
            uomId: materialUomById.get(materialId) ?? String(mat?.uomId ?? ''),
            priority: 40,
            status: newQty <= 0 ? ('CANCELLED' as const) : ('OPEN' as const),
            demandReferenceKey: buildDemandReferenceKey(
                MM_DEMAND_MODULES.PRODUCTION,
                'PRODUCTION_ORDER',
                productionOrderId,
                lineId,
            ),
            sourceType: demandSourceTypeFromModule(MM_DEMAND_MODULES.PRODUCTION),
        }
    })
}

export function productionLinesFromOrderPayload(
    payload: Record<string, unknown>,
    materialUomById: Map<string, string>,
): MmDemandSyncInput[] {
    const companyId = String(payload.companyId)
    const warehouseId = String(payload.warehouseId)
    const productionOrderId = String(payload.productionOrderId)
    const materials =
        (payload.materials as Array<Record<string, unknown>>) ?? []

    return materials.map((mat) => {
        const lineId = String(mat.lineId)
        const materialId = String(mat.materialId)
        return {
            sourceModule: MM_DEMAND_MODULES.PRODUCTION,
            sourceDocumentType: 'PRODUCTION_ORDER',
            sourceDocumentId: productionOrderId,
            sourceDocumentLineId: lineId,
            companyId,
            materialId,
            warehouseId,
            plantId:
                typeof payload.plantId === 'string' ? payload.plantId : undefined,
            requiredDate: new Date(),
            quantity: Number(mat.quantity),
            uomId: materialUomById.get(materialId) ?? String(mat.uomId ?? ''),
            priority: 40,
            status: 'OPEN' as const,
            demandReferenceKey: buildDemandReferenceKey(
                MM_DEMAND_MODULES.PRODUCTION,
                'PRODUCTION_ORDER',
                productionOrderId,
                lineId,
            ),
            sourceType: demandSourceTypeFromModule(MM_DEMAND_MODULES.PRODUCTION),
        }
    })
}
