export type MaterialStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'BLOCKED'

export type Option<T extends string = string> = {
    value: T
    label: string
}

export interface MmMaterialType {
    id: string
    code: string
    name: string
    description?: string | null
    isActive: boolean
    sortOrder: number
    createdAt: string
    updatedAt: string
}

export interface MmMaterialCategory {
    id: string
    code: string
    name: string
    description?: string | null
    parentId?: string | null
    parent?: MmMaterialCategory | null
    children?: MmMaterialCategory[]
    isActive: boolean
    sortOrder: number
    createdAt: string
    updatedAt: string
}

export interface MmUom {
    id: string
    code: string
    name: string
    symbol?: string | null
    isActive: boolean
    sortOrder: number
    createdAt: string
    updatedAt: string
}

export interface MmUomConversion {
    id: string
    fromUomId: string
    fromUom?: MmUom
    toUomId: string
    toUom?: MmUom
    factor: number
    materialId?: string | null
    material?: Material | null
    createdAt: string
    updatedAt: string
}

export interface MmValuationClass {
    id: string
    code: string
    name: string
}

export interface MmCurrency {
    id: string
    code: string
    name: string
    symbol: string
}

export interface MmCompany {
    id: string
    code: string
    name: string
}

export interface MmWarehouse {
    id: string
    code: string
    name: string
    companyId: string
}

export interface MmBarcode {
    id: string
    materialId: string
    barcodeType: string
    barcodeValue: string
    isPrimary: boolean
    createdAt: string
}

export interface MmBatch {
    id: string
    materialId: string
    batchNumber: string
    manufacturingDate?: string | null
    expiryDate?: string | null
    supplierId?: string | null
    supplier?: { id: string; supplierCode: string; supplierName?: string } | null
    status: string
    createdAt: string
    updatedAt: string
    serialNumbers?: MmSerialNumber[]
}

export interface MmSerialNumber {
    id: string
    materialId: string
    serialNumber: string
    batchId?: string | null
    batch?: { id: string; batchNumber: string } | null
    currentWarehouseId?: string | null
    currentWarehouse?: { id: string; code?: string; name?: string } | null
    currentBinId?: string | null
    currentBin?: { id: string; code?: string } | null
    status: string
    createdAt: string
    updatedAt: string
}

export interface MmMaterialAudit {
    id: string
    materialId: string
    action: string
    changes: Record<string, { old: any; new: any }> | null
    performedBy?: string | null
    performedAt: string
}

export interface Material {
    id: string
    materialCode: string
    materialName: string
    description?: string | null
    shortDescription?: string | null
    sku?: string | null
    brand?: string | null
    model?: string | null
    manufacturer?: string | null

    materialTypeId: string
    materialType?: MmMaterialType
    materialCategoryId: string
    materialCategory?: MmMaterialCategory
    status: MaterialStatus

    baseUomId: string
    baseUom?: MmUom
    purchaseUomId?: string | null
    purchaseUom?: MmUom | null
    salesUomId?: string | null
    salesUom?: MmUom | null

    weight?: number | null
    weightUom?: string | null
    length?: number | null
    width?: number | null
    height?: number | null
    dimensionUom?: string | null
    volume?: number | null
    volumeUom?: string | null

    inventoryManaged: boolean
    purchasable: boolean
    sellable: boolean
    batchManaged: boolean
    serialManaged: boolean
    expiryManaged: boolean
    qualityInspectionRequired: boolean

    minimumStock: number
    maximumStock: number
    safetyStock: number
    reorderPoint: number
    reorderQuantity: number
    leadTimeDays: number
    minimumOrderQuantity: number

    valuationMethod?: string | null
    standardCost: number
    currencyId?: string | null
    currency?: MmCurrency | null
    valuationClassId?: string | null
    valuationClass?: MmValuationClass | null

    companyId?: string | null
    company?: MmCompany | null
    defaultWarehouseId?: string | null
    defaultWarehouse?: MmWarehouse | null

    preferredSupplierId?: string | null
    preferredSupplier?: { id: string; supplierCode: string; supplierName: string } | null

    createdBy?: string | null
    updatedBy?: string | null
    createdAt: string
    updatedAt: string
    deletedAt?: string | null

    barcodes?: MmBarcode[]
    batches?: MmBatch[]
    serialNumbers?: MmSerialNumber[]
    audits?: MmMaterialAudit[]
}

export interface MaterialListResponse {
    data: Material[]
    meta: {
        total: number
        page: number
        limit: number
        totalPages: number
    }
}

export interface MaterialQueryParams {
    page?: number
    limit?: number
    search?: string
    materialTypeId?: string
    materialCategoryId?: string
    status?: string
    batchManaged?: boolean
    serialManaged?: boolean
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
}

export interface CreateMaterialPayload {
    materialCode?: string
    materialName: string
    description?: string
    shortDescription?: string
    sku?: string
    brand?: string
    model?: string
    manufacturer?: string
    materialTypeId: string
    materialCategoryId: string
    status?: string
    baseUomId: string
    purchaseUomId?: string
    salesUomId?: string
    weight?: number
    weightUom?: string
    length?: number
    width?: number
    height?: number
    dimensionUom?: string
    volume?: number
    volumeUom?: string
    inventoryManaged?: boolean
    purchasable?: boolean
    sellable?: boolean
    batchManaged?: boolean
    serialManaged?: boolean
    expiryManaged?: boolean
    qualityInspectionRequired?: boolean
    minimumStock?: number
    maximumStock?: number
    safetyStock?: number
    reorderPoint?: number
    reorderQuantity?: number
    leadTimeDays?: number
    minimumOrderQuantity?: number
    valuationMethod?: string
    standardCost?: number
    currencyId?: string
    valuationClassId?: string
    companyId?: string
    defaultWarehouseId?: string
    preferredSupplierId?: string
}

export type UpdateMaterialPayload = Partial<CreateMaterialPayload>
