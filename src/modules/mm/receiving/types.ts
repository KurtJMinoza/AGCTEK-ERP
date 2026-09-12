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
    packageType?: string | null
    grossWeight?: number | string | null
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
    supplierReference?: string | null
    packageCount?: number | null
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
    packageType?: string
    grossWeight?: number
    remarks?: string
}

export type CreateAsnPayload = {
    companyId: string
    supplierId: string
    purchaseOrderId?: string
    warehouseId?: string
    shipmentNumber?: string
    supplierReference?: string
    packageCount?: number
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

export type MmReceivingLine = {
    id: string
    lineNumber: number
    expectedReceiptLineId: string
    materialId: string
    material?: MmMaterialRef
    receivedQuantity: number | string
    damagedQuantity: number | string
    rejectedQuantity: number | string
    uomId: string
    uom?: MmRef
    batchId?: string | null
    serialNumberId?: string | null
    storageBinId?: string | null
    unitCost?: number | string
    barcode?: string | null
    remarks?: string | null
}

export type MmReceivingVariance = {
    id: string
    receivingDocumentId: string
    receivingLineId?: string | null
    varianceType: string
    quantity: number | string
    description?: string | null
    status: string
    detectedAt: string
    receivingDocument?: {
        id: string
        documentNumber: string
        status: string
        companyId: string
    }
    receivingLine?: {
        id: string
        materialId: string
        receivedQuantity: number | string
    }
}

export type MmReceivingDocument = {
    id: string
    documentNumber: string
    companyId: string
    expectedReceiptId: string
    expectedReceipt?: { id: string; documentNumber: string; status: string }
    warehouseId: string
    purchaseOrderId?: string | null
    asnId?: string | null
    supplierId?: string | null
    status: string
    receiverId?: string | null
    postingDate?: string | null
    documentDate?: string | null
    goodsReceiptId?: string | null
    goodsReceipt?: MmGrRef | null
    validatedAt?: string | null
    postedAt?: string | null
    lines: MmReceivingLine[]
    variances?: MmReceivingVariance[]
    createdAt: string
    updatedAt: string
}

export type CreateReceivingLinePayload = {
    expectedReceiptLineId: string
    receivedQuantity: number
    damagedQuantity?: number
    rejectedQuantity?: number
    uomId?: string
    batchId?: string
    serialNumberId?: string
    storageBinId?: string
    unitCost?: number
    barcode?: string
    materialId?: string
}

export type CreateReceivingDocumentPayload = {
    expectedReceiptId: string
    receiverId?: string
    createdBy?: string
    postingDate?: string
    documentDate?: string
    autoPost?: boolean
    lines: CreateReceivingLinePayload[]
}

export type ReceivingActionPayload = {
    performedBy?: string
}

export type MmInspectionCharacteristic = {
    id: string
    lineNumber: number
    name: string
    characteristicType: string
    toleranceMin?: number | string | null
    toleranceMax?: number | string | null
    required: boolean
}

export type MmInspectionSample = {
    id: string
    sampleNumber: number
    sampleSize: number | string
    notes?: string | null
}

export type MmInspectionResult = {
    id: string
    characteristicId?: string | null
    characteristic?: MmInspectionCharacteristic
    measuredValue?: string | null
    numericValue?: number | string | null
    passed?: boolean | null
    notes?: string | null
}

export type MmInspectionDefect = {
    id: string
    defectCode: string
    quantity: number | string
    severity?: string | null
    notes?: string | null
}

export type MmInspectionLot = {
    id: string
    lotNumber: string
    companyId: string
    goodsReceiptId: string
    goodsReceiptLineId: string
    goodsReceipt?: MmGrRef
    materialId: string
    material?: MmMaterialRef
    warehouseId: string
    quantity: number | string
    status: string
    result?: string | null
    inspectedBy?: string | null
    inspectedAt?: string | null
    remarks?: string | null
    plan?: { id: string; planCode: string; characteristics: MmInspectionCharacteristic[] } | null
    samples: MmInspectionSample[]
    results: MmInspectionResult[]
    defects: MmInspectionDefect[]
    decisions?: unknown[]
    qualityHolds?: MmQualityHold[]
    createdAt: string
    updatedAt: string
}

export type RecordInspectionResultsPayload = {
    recordedBy?: string
    samples?: Array<{ sampleNumber?: number; sampleSize: number; notes?: string }>
    results?: Array<{
        sampleId?: string
        characteristicId?: string
        measuredValue?: string
        numericValue?: number
        passed?: boolean
        notes?: string
    }>
    defects?: Array<{ defectCode: string; quantity: number; severity?: string; notes?: string }>
}

export type UsageDecisionPayload = {
    decisionCode: string
    quantity: number
    decidedBy?: string
    notes?: string
    deviationReason?: string
}

export type MmQualityHold = {
    id: string
    holdNumber: string
    companyId: string
    inspectionLotId?: string | null
    inspectionLot?: { id: string; lotNumber: string; status: string }
    goodsReceiptLineId?: string | null
    materialId?: string | null
    warehouseId?: string | null
    status: string
    reason: string
    heldBy?: string | null
    heldAt: string
    releasedBy?: string | null
    releasedAt?: string | null
    releaseNotes?: string | null
}

export type CreateQualityHoldPayload = {
    companyId: string
    inspectionLotId?: string
    goodsReceiptLineId?: string
    materialId?: string
    warehouseId?: string
    reason: string
    heldBy?: string
}

export type ReleaseQualityHoldPayload = {
    releasedBy?: string
    releaseNotes?: string
}
