import ErpAxiosBase from '@/services/axios/ErpAxiosBase'

export type InventoryListMeta = {
    total: number
    page: number
    limit: number
    totalPages: number
}

export type InventoryBalance = {
    id: string
    companyId: string
    warehouseId: string
    storageBinId: string | null
    materialId: string
    batchId: string | null
    serialNumberId: string | null
    stockStatus: string
    quantity: string | number
    reservedQuantity: string | number
    availableQuantity: string | number
    version?: number
    updatedAt?: string
    company?: { id: string; name?: string; code?: string }
    warehouse?: { id: string; name?: string; code?: string }
    storageBin?: { id: string; code?: string } | null
    material?: {
        id: string
        materialCode?: string
        materialName?: string
        name?: string
    }
    batch?: { id: string; batchNumber?: string } | null
    serialNumber?: { id: string; serialNumber?: string } | null
}

export type InventoryTransaction = {
    id: string
    transactionNumber: string
    companyId: string
    plantId?: string | null
    warehouseId: string
    storageBinId: string | null
    materialId: string
    batchId: string | null
    serialNumberId: string | null
    stockStatus: string
    movementType: string
    quantity: string | number
    baseQuantity?: string | number
    signedQuantity?: string | number
    uomId: string
    unitCost?: string | number
    totalCost?: string | number
    postingDate: string
    documentDate: string
    sourceModule?: string | null
    sourceDocumentType?: string | null
    sourceDocumentId?: string | null
    reasonCode?: string | null
    remarks?: string | null
    reversalOfId?: string | null
    createdBy?: string | null
    createdAt?: string
    company?: { id: string; name?: string; code?: string }
    warehouse?: { id: string; name?: string; code?: string }
    storageBin?: { id: string; code?: string } | null
    material?: {
        id: string
        materialCode?: string
        materialName?: string
        name?: string
    }
    uom?: { id: string; code?: string }
}

export type BalanceQueryParams = {
    companyId?: string
    warehouseId?: string
    materialId?: string
    storageBinId?: string
    batchId?: string
    stockStatus?: string
    page?: number
    limit?: number
}

export type TransactionQueryParams = {
    companyId?: string
    warehouseId?: string
    materialId?: string
    movementType?: string
    stockStatus?: string
    sourceDocumentId?: string
    fromDate?: string
    toDate?: string
    reversalFilter?: 'all' | 'reversals' | 'original'
    page?: number
    limit?: number
}

const BASE = '/mm/inventory'

export const inventoryService = {
    balances: (params?: BalanceQueryParams) =>
        ErpAxiosBase.get<{ data: InventoryBalance[]; meta: InventoryListMeta }>(
            `${BASE}/balances`,
            { params },
        ).then((r) => r.data),

    transactions: (params?: TransactionQueryParams) =>
        ErpAxiosBase.get<{ data: InventoryTransaction[]; meta: InventoryListMeta }>(
            `${BASE}/transactions`,
            { params },
        ).then((r) => r.data),
}
