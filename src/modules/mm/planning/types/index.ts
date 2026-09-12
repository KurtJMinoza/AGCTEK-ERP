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
    belowReorderPoint: boolean
    shortage: boolean
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
    explanation?: string | null
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
