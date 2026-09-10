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
