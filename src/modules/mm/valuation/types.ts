export interface ListMeta {
    total: number
    page: number
    limit: number
    totalPages: number
}

export interface MaterialValuation {
    id: string
    companyId: string
    materialId: string
    warehouseId: string
    currencyId?: string | null
    valuationMethod: string
    standardCost: string | number
    movingAverageCost: string | number
    effectiveDate: string
    revision: number
    material?: { id: string; materialCode: string; materialName: string }
    warehouse?: { id: string; name: string; code: string }
}

export interface CostLayer {
    id: string
    companyId: string
    materialId: string
    warehouseId: string
    batchId?: string | null
    receiptTxnId: string
    originalQuantity: string | number
    remainingQuantity: string | number
    unitCost: string | number
    postingDate: string
    status: string
    material?: { materialCode: string; materialName: string }
    warehouse?: { name: string }
}

export interface ValuationTransaction {
    id: string
    valuationNumber: string
    inventoryTxnId: string
    companyId: string
    materialId: string
    warehouseId: string
    valuationMethod: string
    direction: string
    quantity: string | number
    unitCost: string | number
    totalCost: string | number
    priceVariance: string | number
    poUnitPrice?: number | null
    receiptUnitPrice?: number | null
    invoiceUnitPrice?: number | null
    movingAvgBefore?: string | number | null
    movingAvgAfter?: string | number | null
    createdAt: string
    material?: { materialCode: string; materialName: string }
    warehouse?: { name: string }
}

export interface InventoryValueRow {
    companyId: string
    warehouseId: string
    warehouseName: string
    materialId: string
    materialCode: string
    materialName: string
    batchId?: string | null
    quantity: string
    unitCost: string
    inventoryValue: string
    valuationMethod: string
}

export interface LandedCost {
    id: string
    documentNumber: string
    companyId: string
    warehouseId?: string | null
    allocationBase: string
    totalAmount: string | number
    status: string
    remarks?: string | null
    createdAt: string
    lines?: LandedCostLine[]
    allocations?: Array<{
        materialId: string
        allocatedAmount: string | number
        allocationShare?: string | number | null
    }>
}

export interface LandedCostLine {
    id?: string
    costType: string
    description?: string | null
    amount: number | string
    materialId?: string | null
}
