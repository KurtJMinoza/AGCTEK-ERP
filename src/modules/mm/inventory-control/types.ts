export type CountRule = {
    id: string
    code: string
    name: string
    companyId?: string | null
    warehouseId?: string | null
    warehouse?: { id: string; code?: string; name?: string } | null
    abcClass?: string | null
    velocityClass?: string | null
    riskClass?: string | null
    materialCategoryId?: string | null
    materialTypeId?: string | null
    frequencyDays: number
    varianceQtyTolerance: number | string
    varianceValueTolerance: number | string
    minUnitValue?: number | string | null
    maxUnitValue?: number | string | null
    priority: number
    isActive: boolean
}

export type InventoryCountLine = {
    id: string
    countId: string
    lineNumber: number
    storageBinId?: string | null
    storageBin?: { id: string; code?: string } | null
    materialId: string
    material?: {
        id: string
        materialCode?: string
        materialName?: string
        baseUomId?: string
    }
    batchId?: string | null
    serialNumberId?: string | null
    systemQuantity?: number | string
    countedQuantity?: number | string | null
    recountQuantity?: number | string | null
    finalQuantity?: number | string | null
    varianceQuantity?: number | string
    varianceValue?: number | string
    unitCost?: number | string
    assignedCounter?: string | null
    status: string
    countedBy?: string | null
    countedAt?: string | null
    recountBy?: string | null
    recountedAt?: string | null
    approvedBy?: string | null
    approvedAt?: string | null
    originalCount?: number | string | null
    finalAdjustmentQty?: number | string | null
    count?: {
        id: string
        countNumber: string
        countType: string
        status: string
        warehouse?: { id: string; name?: string }
    }
}

export type InventoryCount = {
    id: string
    countNumber: string
    countType: string
    companyId: string
    warehouseId: string
    warehouse?: { id: string; code?: string; name?: string }
    ruleId?: string | null
    rule?: CountRule | null
    status: string
    dueDate?: string | null
    createdBy?: string | null
    createdAt: string
    lines?: InventoryCountLine[]
    adjustment?: { id: string; documentNumber: string; status: string } | null
    _count?: { lines: number }
}

export type ListMeta = {
    total: number
    page: number
    limit: number
    totalPages: number
}

export type CountPolicy = {
    id: string
    code: string
    name: string
    companyId?: string | null
    warehouseId?: string | null
    warehouse?: { id: string; code?: string; name?: string } | null
    abcClass?: string | null
    frequencyDays: number
    varianceQtyTolerance: number | string
    variancePctTolerance?: number | string
    varianceValueTolerance: number | string
    blindCountRequired: boolean
    priority: number
    isActive: boolean
}

export type CountPlan = {
    id: string
    planNumber: string
    companyId: string
    warehouseId: string
    warehouse?: { id: string; code?: string; name?: string }
    policyId?: string | null
    policy?: CountPolicy | null
    countType: string
    status: string
    dueDate?: string | null
    notes?: string | null
    createdAt: string
    sessions?: CountSession[]
}

export type CountSession = {
    id: string
    sessionNumber: string
    planId: string
    plan?: CountPlan
    companyId: string
    warehouseId: string
    warehouse?: { id: string; code?: string; name?: string }
    countType: string
    status: string
    blindMode: boolean
    startedAt?: string | null
    closedAt?: string | null
    createdAt: string
    _count?: { tasks: number }
    tasks?: CountTask[]
}

export type CountTask = {
    id: string
    sessionId: string
    taskNumber: number
    materialId: string
    material?: { materialCode?: string; materialName?: string }
    storageBinId?: string | null
    systemQuantity?: number | string
    status: string
    assignedCounter?: string | null
}

export type CountAdjustmentRequest = {
    id: string
    requestNumber: string
    sessionId: string
    status: string
    companyId: string
    warehouseId: string
    warehouse?: { id: string; code?: string; name?: string }
    createdAt: string
    lines?: Array<{
        id: string
        taskId: string
        quantity: number | string
        rootCause?: string | null
        correctiveAction?: string | null
    }>
}
