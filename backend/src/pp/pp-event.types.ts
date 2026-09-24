export const PP_EVENTS = {
    PRODUCTION_ORDER_RELEASED: 'ProductionOrderReleased',
    PRODUCTION_MATERIAL_REQUIREMENT_CREATED: 'ProductionMaterialRequirementCreated',
    PRODUCTION_ORDER_CANCELLED: 'ProductionOrderCancelled',
    PRODUCTION_MATERIAL_REQUIREMENT_CHANGED: 'ProductionMaterialRequirementChanged',
} as const

export type PpEventType = (typeof PP_EVENTS)[keyof typeof PP_EVENTS]

export type PpMaterialRequirementPayload = {
    lineId: string
    lineNumber: number
    materialId: string
    quantity: string
    demandReferenceLineId: string
}

export type PpProductionOrderEventPayload = {
    productionOrderId: string
    orderNumber: string
    companyId: string
    warehouseId: string
    plantId?: string | null
    finishedMaterialId: string
    plannedQuantity: string
    correlationId: string
    idempotencyKey?: string | null
    materials: PpMaterialRequirementPayload[]
}

export type PpMaterialRequirementChangedPayload = PpProductionOrderEventPayload & {
    changedMaterials: Array<{
        lineId: string
        demandReferenceLineId: string
        previousQuantity: string
        newQuantity: string
    }>
}
