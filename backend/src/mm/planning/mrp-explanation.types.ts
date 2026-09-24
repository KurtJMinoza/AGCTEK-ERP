export const MRP_EXPLANATION_VERSION = '2D' as const

export type MrpDemandLineExplanation = {
    sourceType: string
    label: string
    sourceDocumentId?: string | null
    demandDate?: string
    quantity: string
}

export type MrpRecommendationExplanation = {
    version: typeof MRP_EXPLANATION_VERSION
    materialCode: string
    materialName?: string
    warehouseCode?: string
    planningDate?: string
    demandLines: MrpDemandLineExplanation[]
    grossDemand: string
    openingStock: string
    reserved: string
    projectedSupply: string
    safetyStock: string
    projectedAvailable: string
    netRequirement: string
    moq: string
    lotSize: string
    recommendedQuantity: string
    reasonCode: string
    reasonSummary: string
    planningRule: string
    sourceDemandReferences: string[]
    independentDemandQty?: string
    bomDependentDemandQty?: string
    timePhased?: {
        violationDate?: string
        projectedClosing?: string
        safetyStockViolation?: string
    }
    leadTimeDays?: number
    expectedProcurementDate?: string
    preferredSupplierCode?: string | null
}
