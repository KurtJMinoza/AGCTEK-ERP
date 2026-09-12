export type ScannerOperation =
    | 'RECEIVING'
    | 'PUTAWAY'
    | 'PICKING'
    | 'PACKING'
    | 'COUNTING'
    | 'TRANSFER'

export interface ResolveHit {
    type: string
    entityType?: string
    entityId?: string
    barcode: string
    materialId?: string
    material?: {
        id: string
        materialCode: string
        materialName: string
        sku?: string | null
        batchManaged?: boolean
        serialManaged?: boolean
        baseUomId?: string
    }
    warehouseId?: string
    warehouse?: { id: string; code: string; name: string; companyId: string }
    storageBinId?: string
    storageBin?: { id: string; code: string; barcode?: string | null }
    location?: {
        warehouseId?: string
        storageBinId?: string
        binCode?: string
    } | null
    batchId?: string
    batch?: { id: string; batchNumber: string; materialId: string }
    serialNumberId?: string
    serial?: { id: string; serialNumber: string; materialId: string }
    supplierId?: string
    expectedReceiptId?: string
    purchaseOrderId?: string
    pickingTaskId?: string
    putawayTaskId?: string
    warehouseTaskId?: string
    transferOrderId?: string
    packageId?: string
    countId?: string
    countLineId?: string
    documentType?: string
    documentId?: string
    documentNumber?: string
    status?: string | null
    allowedActions?: string[]
}

export interface ScannerEventPayload {
    deviceId: string
    userId: string
    operation: ScannerOperation
    barcode: string
    timestamp: string
    quantity?: number
    warehouseId?: string
    bin?: string
    batch?: string
    serial?: string
    idempotencyKey: string
    expectedReceiptId?: string
    expectedReceiptLineId?: string
    putawayTaskId?: string
    pickingTaskId?: string
    packageId?: string
    countLineId?: string
    destinationBin?: string
    companyId?: string
    uomId?: string
}

export interface ScannerEventResult {
    id: string
    status: string
    duplicate?: boolean
    result?: any
    errorMessage?: string | null
    documentType?: string | null
    documentId?: string | null
}
