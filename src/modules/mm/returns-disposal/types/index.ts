export interface ReturnLine {
    id: string
    lineNumber: number
    materialId: string
    material?: { id: string; materialCode: string; materialName: string }
    uomId: string
    batchId?: string | null
    serialNumberId?: string | null
    storageBinId?: string | null
    goodsReceiptLineId?: string | null
    quantity: number
    unitCost: number
    reason: string
    stockStatus: string
    inventoryTxnId?: string | null
    remarks?: string | null
}

export interface SupplierReturn {
    id: string
    returnNumber: string
    companyId: string
    supplierId: string
    supplier?: { id: string; supplierCode: string; supplierName: string }
    warehouseId: string
    warehouse?: { id: string; code: string; name: string }
    goodsReceiptId?: string | null
    goodsReceipt?: { id: string; documentNumber: string } | null
    purchaseOrderId?: string | null
    reason: string
    remarks?: string | null
    status: string
    estimatedValue: number
    totalQuantity: number
    approvalThresholdSnapshot?: number | null
    submittedBy?: string | null
    submittedAt?: string | null
    approvedBy?: string | null
    approvedAt?: string | null
    rejectedBy?: string | null
    rejectedAt?: string | null
    shippedBy?: string | null
    shippedAt?: string | null
    createdBy?: string | null
    createdAt: string
    updatedAt: string
    lines: ReturnLine[]
    audits?: AuditEntry[]
}

export interface DisposalLine {
    id: string
    lineNumber: number
    materialId: string
    material?: { id: string; materialCode: string; materialName: string }
    uomId: string
    batchId?: string | null
    serialNumberId?: string | null
    storageBinId?: string | null
    quantity: number
    unitCost: number
    reason: string
    stockStatus: string
    inventoryTxnId?: string | null
    remarks?: string | null
}

export interface Disposal {
    id: string
    disposalNumber: string
    companyId: string
    warehouseId: string
    warehouse?: { id: string; code: string; name: string }
    disposalType: string
    reason: string
    remarks?: string | null
    status: string
    estimatedValue: number
    totalQuantity: number
    approvalThresholdSnapshot?: number | null
    submittedBy?: string | null
    submittedAt?: string | null
    approvedBy?: string | null
    approvedAt?: string | null
    rejectedBy?: string | null
    rejectedAt?: string | null
    postedBy?: string | null
    postedAt?: string | null
    createdBy?: string | null
    createdAt: string
    updatedAt: string
    lines: DisposalLine[]
    audits?: AuditEntry[]
}

export interface AuditEntry {
    id: string
    action: string
    field?: string | null
    oldValue?: string | null
    newValue?: string | null
    performedBy?: string | null
    performedAt: string
    details?: any
}

export interface ReturnsDisposalConfig {
    id: string
    companyId: string
    approvalAmountThreshold: number
    approvalQuantityThreshold: number
}

export interface BlockedBalance {
    id: string
    companyId: string
    warehouseId: string
    warehouse?: { id: string; code: string; name: string }
    materialId: string
    material?: {
        id: string
        materialCode: string
        materialName: string
        baseUomId?: string
        standardCost?: number | string
    }
    batchId?: string | null
    batch?: { id: string; batchNumber: string; expiryDate?: string } | null
    serialNumberId?: string | null
    storageBinId?: string | null
    storageBin?: { id: string; binCode: string } | null
    stockStatus: string
    quantity: number
}

export interface CustomerReturnLine {
    id: string
    lineNumber: number
    materialId: string
    material?: { id: string; materialCode: string; materialName: string }
    uomId: string
    batchId?: string | null
    serialNumberId?: string | null
    storageBinId?: string | null
    quantity: number
    unitCost: number
    disposition?: string | null
    dispositionStatus: string
    inventoryTxnId?: string | null
    disposalId?: string | null
    remarks?: string | null
}

export interface CustomerReturn {
    id: string
    returnNumber: string
    companyId: string
    warehouseId: string
    warehouse?: { id: string; code: string; name: string }
    customerRef?: string | null
    customerName?: string | null
    reason?: string | null
    remarks?: string | null
    status: string
    estimatedValue: number
    totalQuantity: number
    createdAt: string
    updatedAt: string
    lines: CustomerReturnLine[]
    audits?: AuditEntry[]
}
