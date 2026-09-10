export interface StockOpsLine {
    id: string
    materialId: string
    material?: { id: string; code?: string; name?: string; materialCode?: string; materialName?: string }
    quantity: number | string
    expectedQuantity?: number | string | null
    shortageQuantity?: number | string
    overageQuantity?: number | string
    damagedQuantity?: number | string
    rejectedQuantity?: number | string
    uomId: string
    uom?: { id: string; code: string; name: string }
    storageBinId?: string | null
    storageBin?: { id: string; code: string } | null
    batchId?: string | null
    serialNumberId?: string | null
    unitCost?: number | string
    totalCost?: number | string
    remarks?: string | null
    purchaseOrderLineId?: string | null
    expectedReceiptLineId?: string | null
    discrepancyFlag?: string | null
}

export interface GoodsReceipt {
    id: string
    documentNumber: string
    companyId: string
    warehouseId: string
    warehouse?: { id: string; name: string }
    purchaseOrderId?: string | null
    purchaseOrder?: { id: string; poNumber: string; status?: string } | null
    expectedReceiptId?: string | null
    expectedReceipt?: { id: string; documentNumber: string } | null
    asnId?: string | null
    supplierId?: string | null
    supplier?: {
        id: string
        supplierCode?: string
        supplierName?: string
        name?: string
        code?: string
    } | null
    receiverId?: string | null
    postingDate: string
    documentDate: string
    stockStatus: string
    remarks?: string | null
    createdBy?: string | null
    status: string
    createdAt: string
    updatedAt: string
    lines: StockOpsLine[]
    qualityInspections?: Array<{ id: string; inspectionNumber?: string; status: string; result?: string | null }>
    putawayTasks?: Array<{ id: string; taskNumber?: string; status: string }>
}

export interface CreateGoodsReceiptLinePayload {
    materialId: string
    quantity: number
    uomId: string
    storageBinId?: string
    batchId?: string
    serialNumberId?: string
    unitCost?: number
    totalCost?: number
    remarks?: string
    purchaseOrderLineId?: string
}

export interface CreateGoodsReceiptPayload {
    companyId: string
    warehouseId: string
    purchaseOrderId?: string
    postingDate: string
    documentDate: string
    stockStatus?: string
    remarks?: string
    createdBy?: string
    lines: CreateGoodsReceiptLinePayload[]
}

export interface GoodsIssue {
    id: string
    documentNumber: string
    companyId: string
    warehouseId: string
    warehouse?: { id: string; name: string }
    postingDate: string
    documentDate: string
    issuePurpose: string
    remarks?: string | null
    createdBy?: string | null
    status: string
    createdAt: string
    updatedAt: string
    lines: StockOpsLine[]
}

export interface BinTransferLine {
    id: string
    materialId: string
    material?: { id: string; code: string; name: string }
    quantity: number | string
    uomId: string
    uom?: { id: string; code: string; name: string }
    sourceBinId: string
    sourceBin?: { id: string; code: string } | null
    destinationBinId: string
    destinationBin?: { id: string; code: string } | null
    batchId?: string | null
    serialNumberId?: string | null
}

export interface BinTransfer {
    id: string
    documentNumber: string
    companyId: string
    warehouseId: string
    warehouse?: { id: string; name: string }
    postingDate: string
    remarks?: string | null
    createdBy?: string | null
    status: string
    createdAt: string
    updatedAt: string
    lines: BinTransferLine[]
}

export interface WtoLine {
    id: string
    materialId: string
    material?: { id: string; code: string; name: string }
    quantity: number | string
    uomId: string
    uom?: { id: string; code: string; name: string }
    sourceBinId?: string | null
    destinationBinId?: string | null
    batchId?: string | null
    serialNumberId?: string | null
    dispatchedQty: number | string
    receivedQty: number | string
    status: string
}

export interface WarehouseTransferOrder {
    id: string
    documentNumber: string
    companyId: string
    sourceWarehouseId: string
    sourceWarehouse?: { id: string; name: string }
    destinationWarehouseId: string
    destinationWarehouse?: { id: string; name: string }
    postingDate: string
    requestedBy?: string | null
    approvedBy?: string | null
    dispatchedAt?: string | null
    receivedAt?: string | null
    notes?: string | null
    status: string
    createdAt: string
    updatedAt: string
    lines: WtoLine[]
}

export interface AdjustmentLine {
    id: string
    materialId: string
    material?: { id: string; code: string; name: string }
    quantity: number | string
    uomId: string
    uom?: { id: string; code: string; name: string }
    storageBinId?: string | null
    storageBin?: { id: string; code: string } | null
    batchId?: string | null
    serialNumberId?: string | null
    unitCost?: number | string
    remarks?: string | null
}

export interface InventoryAdjustment {
    id: string
    documentNumber: string
    companyId: string
    warehouseId: string
    warehouse?: { id: string; name: string }
    sourceCountId?: string | null
    postingDate: string
    adjustmentReason: string
    justification?: string | null
    approvalThreshold: number | string
    createdBy?: string | null
    approvedBy?: string | null
    rejectionReason?: string | null
    status: string
    createdAt: string
    updatedAt: string
    lines: AdjustmentLine[]
}

export interface StockOpsListResponse<T> {
    data: T[]
    total: number
    page: number
    pageSize: number
}

export interface StockOpsQueryParams {
    status?: string
    warehouseId?: string
    search?: string
    page?: number
    pageSize?: number
}
