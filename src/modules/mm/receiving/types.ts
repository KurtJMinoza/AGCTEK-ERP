/** MM inbound / receiving types (ASN, Expected Receipt, QI, receive payloads). */

export type InboundListResponse<T> = {
    data: T[]
    total: number
    page: number
    pageSize: number
}

export type InboundQueryParams = {
    status?: string
    companyId?: string
    warehouseId?: string
    supplierId?: string
    search?: string
    page?: number
    pageSize?: number
}

export type MmRef = { id: string; code?: string; name?: string }
export type MmMaterialRef = {
    id: string
    materialCode: string
    materialName: string
    batchManaged?: boolean
    serialManaged?: boolean
    qualityInspectionRequired?: boolean
}
export type MmSupplierRef = {
    id: string
    supplierCode: string
    supplierName: string
}
export type MmPoRef = { id: string; poNumber: string; status?: string }
export type MmAsnRef = { id: string; asnNumber: string }
export type MmGrRef = { id: string; documentNumber: string; status: string }

export type MmAsnLine = {
    id: string
    asnId: string
    materialId: string
    material?: MmMaterialRef
    quantity: number | string
    uomId: string
    uom?: MmRef
    purchaseOrderLineId?: string | null
    batchNumber?: string | null
    serialNumber?: string | null
    remarks?: string | null
}

export type MmAsn = {
    id: string
    asnNumber: string
    companyId: string
    company?: MmRef
    supplierId: string
    supplier?: MmSupplierRef
    purchaseOrderId?: string | null
    purchaseOrder?: MmPoRef | null
    warehouseId?: string | null
    warehouse?: MmRef | null
    shipmentNumber?: string | null
    carrier?: string | null
    trackingNumber?: string | null
    expectedDate?: string | null
    status: string
    remarks?: string | null
    createdBy?: string | null
    createdAt: string
    updatedAt: string
    lines: MmAsnLine[]
}

export type CreateAsnLinePayload = {
    materialId: string
    quantity: number
    uomId: string
    purchaseOrderLineId?: string
    batchNumber?: string
    serialNumber?: string
    remarks?: string
}

export type CreateAsnPayload = {
    companyId: string
    supplierId: string
    purchaseOrderId?: string
    warehouseId?: string
    shipmentNumber?: string
    carrier?: string
    trackingNumber?: string
    expectedDate?: string
    remarks?: string
    createdBy?: string
    lines: CreateAsnLinePayload[]
}

export type MmExpectedReceiptLine = {
    id: string
    expectedReceiptId: string
    materialId: string
    material?: MmMaterialRef
    expectedQuantity: number | string
    receivedQuantity: number | string
    damagedQuantity: number | string
    rejectedQuantity?: number | string
    uomId: string
    uom?: MmRef
    purchaseOrderLineId?: string | null
    asnLineId?: string | null
    status: string
    remarks?: string | null
}

export type MmExpectedReceipt = {
    id: string
    documentNumber: string
    companyId: string
    company?: MmRef
    supplierId: string
    supplier?: MmSupplierRef
    purchaseOrderId?: string | null
    purchaseOrder?: MmPoRef | null
    asnId?: string | null
    asn?: MmAsnRef | null
    warehouseId: string
    warehouse?: MmRef
    expectedDate?: string | null
    status: string
    sourceType: string
    remarks?: string | null
    createdBy?: string | null
    createdAt: string
    updatedAt: string
    lines: MmExpectedReceiptLine[]
    goodsReceipts?: MmGrRef[]
}

export type CreateErFromPoPayload = {
    purchaseOrderId: string
    warehouseId?: string
    expectedDate?: string
    createdBy?: string
}

export type CreateErFromAsnPayload = {
    asnId: string
    warehouseId?: string
    createdBy?: string
}

export type ReceiveLinePayload = {
    expectedReceiptLineId: string
    receivedQuantity: number
    damagedQuantity?: number
    rejectedQuantity?: number
    materialId?: string
    batchId?: string
    serialNumberId?: string
    storageBinId?: string
    unitCost?: number
    barcode?: string
}

export type ReceivePayload = {
    expectedReceiptId: string
    receiverId?: string
    createdBy?: string
    postingDate?: string
    documentDate?: string
    lines: ReceiveLinePayload[]
}

export type MmQualityInspectionLine = {
    id: string
    inspectionId: string
    goodsReceiptLineId: string
    goodsReceiptLine?: {
        id: string
        materialId: string
        material?: MmMaterialRef
        quantity?: number | string
        uom?: MmRef
    }
    materialId: string
    quantity: number | string
    passQuantity: number | string
    failQuantity: number | string
    result?: string | null
    remarks?: string | null
}

export type MmQualityInspection = {
    id: string
    inspectionNumber: string
    companyId: string
    goodsReceiptId: string
    goodsReceipt?: {
        id: string
        documentNumber: string
        companyId: string
        warehouseId: string
        postingDate: string
        documentDate: string
    }
    warehouseId: string
    status: string
    result?: string | null
    inspectedBy?: string | null
    inspectedAt?: string | null
    remarks?: string | null
    createdAt: string
    updatedAt: string
    lines: MmQualityInspectionLine[]
}

export type QualityDecideLinePayload = {
    lineId: string
    passQuantity: number
    failQuantity: number
    remarks?: string
}

export type QualityDecidePayload = {
    inspectedBy?: string
    remarks?: string
    lines: QualityDecideLinePayload[]
}
