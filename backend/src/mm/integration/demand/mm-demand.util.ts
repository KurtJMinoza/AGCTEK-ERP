import { MM_DEMAND_MODULES, type MmNormalizedDemandLine } from './mm-demand.types'

/** Build stable demand reference key for idempotent sync and reservation linkage. */
export function buildDemandReferenceKey(
    sourceModule: string,
    sourceDocumentType: string,
    sourceDocumentId: string,
    sourceDocumentLineId?: string | null,
): string {
    const parts = [sourceModule, sourceDocumentType, sourceDocumentId]
    if (sourceDocumentLineId) parts.push(sourceDocumentLineId)
    return parts.join(':')
}

/** Map sourceModule to legacy MRP sourceType label. */
export function demandSourceTypeFromModule(sourceModule: string): string {
    switch (sourceModule) {
        case MM_DEMAND_MODULES.SD:
            return 'SALES'
        case MM_DEMAND_MODULES.PRODUCTION:
            return 'PRODUCTION'
        case MM_DEMAND_MODULES.MAINTENANCE:
            return 'MAINTENANCE'
        case MM_DEMAND_MODULES.PROJECTS:
            return 'PROJECTS'
        default:
            return 'MANUAL_INTERNAL'
    }
}

export function toPlanningDemandShape(line: MmNormalizedDemandLine) {
    return {
        id: line.demandReferenceKey,
        materialId: line.materialId,
        sourceModule: line.sourceModule,
        sourceDocumentType: line.sourceDocumentType,
        sourceDocumentId: line.sourceDocumentId,
        sourceDocumentLineId: line.sourceDocumentLineId ?? null,
        sourceType: line.sourceType ?? demandSourceTypeFromModule(line.sourceModule),
        demandDate: line.requiredDate,
        quantity: line.quantity,
        warehouseId: line.warehouseId ?? null,
        plantId: line.plantId ?? null,
        uomId: line.uomId,
        priority: line.priority,
        status: line.status,
        demandReferenceKey: line.demandReferenceKey,
    }
}
