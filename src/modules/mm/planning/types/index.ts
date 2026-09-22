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

export type ListMeta = {
    total: number
    page: number
    limit: number
    totalPages: number
}

export type PlanningDemand = {
    id: string
    companyId: string
    plantId?: string | null
    warehouseId?: string | null
    materialId: string
    demandDate: string
    quantity: number | string
    sourceType: string
    sourceDocumentId?: string | null
    status?: string
    remarks?: string | null
    material?: { id: string; materialCode: string; materialName: string }
    warehouse?: { id: string; code: string; name: string } | null
}

export type ReorderRule = {
    id: string
    companyId: string
    materialId: string
    warehouseId?: string | null
    reorderPoint: number | string
    safetyStock: number | string
    reorderQuantity: number | string
    minimumOrderQuantity: number | string
    minStock?: number | string
    maxStock?: number | string
    lotSize?: number | string
    leadTimeDays: number
    reviewPeriodDays?: number
    planningStrategy?: string
    procurementType?: string
    isActive: boolean
    material?: { id: string; materialCode: string; materialName: string }
    warehouse?: { id: string; code: string; name: string } | null
}

export type MrpRun = {
    id: string
    runNumber: string
    companyId: string
    plantId?: string | null
    warehouseId?: string | null
    executionTime?: string | null
    startedAt?: string | null
    completedAt?: string | null
    planningHorizonDays: number
    includeOpenReceipts: boolean
    autoCreatePurchaseRequisitions?: boolean
    parametersJson?: Record<string, unknown> | null
    resultsCount?: number
    status: string
    errorMessage?: string | null
    createdAt: string
    warehouse?: { id: string; code: string; name: string } | null
    plant?: { id: string; code: string; name: string } | null
    _count?: {
        requirements: number
        suggestions: number
        plannedOrders?: number
    }
    requirements?: MaterialRequirement[]
    suggestions?: ProcurementSuggestion[]
}

export type MaterialRequirement = {
    id: string
    mrpRunId: string
    companyId: string
    warehouseId: string
    materialId: string
    unrestrictedQty: number | string
    reservedQty: number | string
    qualityQty: number | string
    blockedQty: number | string
    availableQty: number | string
    incomingQty: number | string
    plannedSupplyQty?: number | string
    productionSupplyQty?: number | string
    demandQty: number | string
    independentDemandQty?: number | string | null
    bomDependentDemandQty?: number | string | null
    grossDemand?: number | string
    projectedAvailable?: number | string
    safetyStock: number | string
    reorderPoint: number | string
    moq: number | string
    lotSize?: number | string
    leadTimeDays: number
    netRequirement: number | string
    recommendedQty: number | string
    shortageQty?: number | string
    recommendedAction?: string | null
    requiredDate?: string | null
    source?: string | null
    expectedProcurementDate?: string | null
    projectedStockoutDate?: string | null
    shortageDate?: string | null
    safetyStockViolationQty?: number | string | null
    belowReorderPoint: boolean
    shortage: boolean
    explanationJson?: MrpRecommendationExplanation | null
    material?: { id: string; materialCode: string; materialName: string }
    warehouse?: { id: string; code: string; name: string }
    mrpRun?: { id: string; runNumber: string; status: string }
}

export type ProcurementSuggestion = {
    id: string
    mrpRunId: string
    materialRequirementId?: string | null
    plannedOrderId?: string | null
    suggestionType: string
    companyId: string
    materialId: string
    warehouseId: string
    quantity: number | string
    uomId: string
    requiredDate: string
    leadTimeDays?: number
    preferredSupplierId?: string | null
    reason?: string | null
    demandSource?: string | null
    shortageReason?: string | null
    moq?: number | string
    lotSize?: number | string
    shortageDate?: string | null
    projectedClosingQty?: number | string | null
    explanation?: string | null
    explanationJson?: MrpRecommendationExplanation | null
    status: string
    purchaseRequisitionId?: string | null
    material?: { id: string; materialCode: string; materialName: string }
    warehouse?: { id: string; code: string; name: string }
    preferredSupplier?: {
        id: string
        supplierCode: string
        supplierName: string
    } | null
    mrpRun?: { id: string; runNumber: string; status: string }
    purchaseRequisition?: {
        id: string
        requisitionNumber: string
        status: string
    } | null
}

export type BomExplosionTrace = {
    id: string
    mrpRunId: string
    companyId: string
    warehouseId: string
    parentMaterialId: string
    componentMaterialId: string
    level: number
    demandDate?: string | null
    parentDemandQty: number | string
    quantityPer: number | string
    grossComponentQty: number | string
    uomId?: string | null
    yieldFactor?: number | string | null
    scrapFactor?: number | string | null
    explosionReason?: string | null
    warningCode?: string | null
    parentMaterial?: { id: string; materialCode: string; materialName: string }
    componentMaterial?: { id: string; materialCode: string; materialName: string }
    warehouse?: { id: string; code: string; name: string }
}

export type ProjectedStockRow = {
    id: string
    mrpRunId: string
    companyId: string
    warehouseId: string
    materialId: string
    bucketDate: string
    openingQty: number | string
    demandQty: number | string
    supplyQty: number | string
    reservationQty: number | string
    closingQty: number | string
    material?: { id: string; materialCode: string; materialName: string }
    warehouse?: { id: string; code: string; name: string }
    mrpRun?: { id: string; runNumber: string; status: string }
}

export type PlanningDashboard = {
    latestRun: MrpRun | null
    summary: {
        belowReorderPoint: number
        shortages: number
        openSuggestions: number
        overdueInbound: number
        projectedStockouts: number
    }
    topShortages: MaterialRequirement[]
    projectedStockouts: MaterialRequirement[]
    recentSuggestions: ProcurementSuggestion[]
}
