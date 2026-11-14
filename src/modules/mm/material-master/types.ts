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
    /** Uploaded category image (shown in the shop's Explore Popular Categories). */
    imageUrl: string
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
    logoUrl?: string | null
    address?: string
    tin?: string
    createdAt?: string
    updatedAt?: string
}

export interface MmPlant {
    id: string
    code: string
    name: string
    companyId: string
    status: string
    company?: MmCompany
    createdAt?: string
    updatedAt?: string
}

export interface MmBranch {
    id: string
    code: string
    name: string
    companyId: string
    plantId?: string | null
    status: string
    company?: MmCompany
    plant?: { id: string; code: string; name: string } | null
    createdAt?: string
    updatedAt?: string
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

/** Read-only product tax projection owned by MM Material Master. */
export interface MaterialTaxProjection {
    configured: boolean
    readyForSale: boolean
    source: 'MM_MATERIAL_MASTER'
    classification: 'VATABLE' | 'VAT_EXEMPT' | 'ZERO_RATED' | null
    classificationLabel: string | null
    taxCodeId: string | null
    taxCode: string | null
    taxCodeName: string | null
    taxType: string | null
    taxRate: number | null
    rateUnit: string | null
    rateEffectiveFrom: string | null
    rateEffectiveTo: string | null
    priceTaxTreatment: 'VAT_INCLUSIVE' | 'VAT_EXCLUSIVE' | null
    priceTaxTreatmentLabel: string | null
    status: 'ACTIVE' | 'INACTIVE' | null
    effectiveStatus:
        | 'ACTIVE'
        | 'INACTIVE'
        | 'SCHEDULED'
        | 'EXPIRED'
        | 'INCOMPLETE'
        | 'NOT_CONFIGURED'
    effectiveFrom: string | null
    effectiveTo: string | null
    description: string | null
    warnings: string[]
}

export interface MaterialTaxCodeOption {
    id: string
    code: string
    name: string
    taxCategory: string | null
    taxType: string
    status: string
    calculationMethod: string | null
    compatibleClassifications: Array<'VATABLE' | 'VAT_EXEMPT' | 'ZERO_RATED'>
    rate: number | null
    rateUnit: string | null
    rateEffectiveFrom: string | null
    rateEffectiveTo: string | null
}

export interface MaterialTaxHistoryEntry {
    id: string
    materialId: string
    companyId: string | null
    taxClassification: string | null
    taxCodeId: string | null
    taxCode: string | null
    taxCodeName: string | null
    taxType: string | null
    taxRate: number | null
    rateUnit: string | null
    priceTaxTreatment: string | null
    taxStatus: string | null
    taxEffectiveFrom: string | null
    taxEffectiveTo: string | null
    taxDescription: string | null
    changeType: 'CREATE' | 'UPDATE' | 'CLEAR'
    changedBy: string | null
    createdAt: string
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
    negativeStockAllowed?: boolean
    purchasable: boolean
    sellable: boolean
    batchManaged: boolean
    serialManaged: boolean
    /** NOT_SERIALIZED | SERIALIZED_AT_RECEIPT | SERIALIZED_AT_ISSUE | SERIALIZED_AT_BOTH */
    serialTrackingPolicy: string
    expiryManaged: boolean
    qualityInspectionRequired: boolean

    onHandQty: number
    reservedQty: number
    /** Live sellable qty (ledger); present on API list/detail reads. */
    availableQty?: number
    /** Live ledger on-hand (unrestricted) qty from mmInventoryBalance. */
    ledgerOnHandQty?: number
    /** Live ledger reserved qty from mmInventoryBalance. */
    ledgerReservedQty?: number
    /** Live ledger available qty (unrestricted on-hand - reserved) from mmInventoryBalance. */
    ledgerAvailableQty?: number
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

    /** Product tax classification — owned by MM Material Master. */
    taxClassification?: 'VATABLE' | 'VAT_EXEMPT' | 'ZERO_RATED' | null
    taxCodeId?: string | null
    taxCode?: {
        id: string
        code: string
        name: string
        taxType: string
        status: string
        taxRates?: Array<{
            rate: number
            rateUnit?: string | null
            effectiveFrom: string
            effectiveTo?: string | null
            status?: string | null
        }>
    } | null
    priceTaxTreatment?: 'VAT_INCLUSIVE' | 'VAT_EXCLUSIVE' | null
    taxStatus?: 'ACTIVE' | 'INACTIVE' | null
    taxEffectiveFrom?: string | null
    taxEffectiveTo?: string | null
    taxDescription?: string | null
    /** Read-only projection computed by the API. */
    tax?: MaterialTaxProjection

    /** SD variant that triggered auto-creation (null = independently created). */
    catalogVariantId?: string | null
    /** AUTO_CREATED | MANUALLY_LINKED. */
    catalogSource?: string | null
    /** Resolved catalog variant details (populated by API). */
    catalogVariant?: {
        id: string
        variantName: string
        sku: string
        product?: {
            id: string
            name: string
            sku: string
        }
    } | null

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
    negativeStockAllowed?: boolean
    purchasable?: boolean
    sellable?: boolean
    batchManaged?: boolean
    serialManaged?: boolean
    /** NOT_SERIALIZED | SERIALIZED_AT_RECEIPT | SERIALIZED_AT_ISSUE | SERIALIZED_AT_BOTH */
    serialTrackingPolicy?: string
    expiryManaged?: boolean
    qualityInspectionRequired?: boolean
    onHandQty?: number
    reservedQty?: number
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
    /** Storage bin used for the initial on-hand posting (company scope). */
    storageBinId?: string | null

    /** Product tax classification — owned by MM Material Master. */
    taxClassification?: 'VATABLE' | 'VAT_EXEMPT' | 'ZERO_RATED'
    taxCodeId?: string
    priceTaxTreatment?: 'VAT_INCLUSIVE' | 'VAT_EXCLUSIVE'
    taxStatus?: 'ACTIVE' | 'INACTIVE'
    taxEffectiveFrom?: string
    taxEffectiveTo?: string
    taxDescription?: string

    /** Primary barcode to register for this material. */
    barcodeValue?: string

    /** Barcode type (EAN13, UPC_A, CODE128, QR). */
    barcodeType?: string

    /** Serial number to register for serial-managed materials. */
    serialNumber?: string
}

export type UpdateMaterialPayload = Partial<CreateMaterialPayload>
