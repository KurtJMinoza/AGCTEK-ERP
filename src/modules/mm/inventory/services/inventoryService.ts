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
    plantId?: string | null
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
    sourceBinId?: string | null
    destinationBinId?: string | null
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
    idempotencyKey?: string | null
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

export type AvailabilityResult = {
    companyId: string
    warehouseId: string
    materialId: string
    onHand: number
    unrestrictedOnHand: number
    reserved: number
    restricted: number
    available: number
    /** @deprecated use `available` */
    unrestrictedStock?: number
    existingReservations?: number
    restrictedStock?: number
    balances: Array<{
        id: string
        storageBinId: string | null
        stockStatus: string
        quantity: number
        reservedQuantity: number
        availableQuantity: number
    }>
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

export type AvailabilityQueryParams = {
    companyId: string
    warehouseId: string
    materialId: string
    storageBinId?: string
    batchId?: string
    serialNumberId?: string
}

export type TraceabilityQueryParams = {
    companyId?: string
    materialId?: string
    batchId?: string
    serialNumberId?: string
    sourceDocumentId?: string
    sourceDocumentType?: string
    transactionId?: string
    page?: number
    limit?: number
}

export type BalanceSummary = {
    filters: Record<string, string>
    rowCount: number
    onHand: number
    unrestrictedOnHand: number
    reserved: number
    restricted: number
    available: number
    byStatus: Array<{ status: string; rowCount: number; quantity: number }>
}

export type PostStatusChangePayload = {
    companyId: string
    plantId?: string
    warehouseId: string
    storageBinId?: string
    materialId: string
    batchId?: string
    serialNumberId?: string
    fromStatus: string
    toStatus: string
    quantity: number
    uomId: string
    postingDate: string
    documentDate: string
    sourceModule?: string
    sourceDocumentType?: string
    sourceDocumentId?: string
    sourceDocumentLineId?: string
    idempotencyKey?: string
}

const BASE = '/mm/inventory'

export const inventoryService = {
    /** Canonical balance read — backend is source of truth. */
    balance: (params?: BalanceQueryParams) =>
        ErpAxiosBase.get<{ data: InventoryBalance[]; meta: InventoryListMeta }>(
            `${BASE}/balance`,
            { params },
        ).then((r) => r.data),

    balances: (params?: BalanceQueryParams) =>
        ErpAxiosBase.get<{ data: InventoryBalance[]; meta: InventoryListMeta }>(
            `${BASE}/balances`,
            { params },
        ).then((r) => r.data),

    /** Server-side aggregation for overview/status summary cards. */
    balanceSummary: (params?: BalanceQueryParams) =>
        ErpAxiosBase.get<BalanceSummary>(`${BASE}/balance/summary`, { params }).then(
            (r) => r.data,
        ),

    /** Central availability calculation — do not recompute in UI. */
    available: (params: AvailabilityQueryParams) =>
        ErpAxiosBase.get<AvailabilityResult>(`${BASE}/available`, { params }).then(
            (r) => r.data,
        ),

    ledger: (params?: TransactionQueryParams) =>
        ErpAxiosBase.get<{ data: InventoryTransaction[]; meta: InventoryListMeta }>(
            `${BASE}/ledger`,
            { params },
        ).then((r) => r.data),

    transactions: (params?: TransactionQueryParams) =>
        ErpAxiosBase.get<{ data: InventoryTransaction[]; meta: InventoryListMeta }>(
            `${BASE}/transactions`,
            { params },
        ).then((r) => r.data),

    traceability: (params: TraceabilityQueryParams) =>
        ErpAxiosBase.get<{ data: InventoryTransaction[]; meta: InventoryListMeta }>(
            `${BASE}/traceability`,
            { params },
        ).then((r) => r.data),

    stockStatuses: () =>
        ErpAxiosBase.get<Array<{ code: string; restricted: boolean }>>(
            `${BASE}/stock-statuses`,
        ).then((r) => r.data),

    postStatusChange: (payload: PostStatusChangePayload) =>
        ErpAxiosBase.post(`${BASE}/status-changes`, payload).then((r) => r.data),
}
