export type SupplierStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'ACTIVE' | 'INACTIVE' | 'BLOCKED'

export interface SupplierCategory {
    id: string
    code: string
    name: string
    description?: string | null
    isActive: boolean
    sortOrder: number
    createdAt: string
    updatedAt: string
}

export interface PaymentTerms {
    id: string
    code: string
    name: string
    description?: string | null
    dueDays: number
    discountDays?: number | null
    discountPercent?: number | string | null
    isActive: boolean
    createdAt: string
    updatedAt: string
}

export interface Supplier {
    id: string
    supplierCode: string
    supplierName: string
    legalName?: string | null
    supplierType?: string | null
    taxId?: string | null
    primaryContact?: string | null
    email?: string | null
    phone?: string | null
    website?: string | null
    billingAddress?: string | null
    shippingAddress?: string | null
    country?: string | null
    region?: string | null
    currencyId?: string | null
    currency?: { id: string; code: string; name: string } | null
    paymentTermsId?: string | null
    paymentTerms?: PaymentTerms | null
    deliveryTerms?: string | null
    defaultWarehouseId?: string | null
    defaultWarehouse?: { id: string; name: string } | null
    leadTimeDays?: number | null
    taxCode?: string | null
    taxStatus?: string | null
    companyId: string
    company?: { id: string; name: string } | null
    categoryId?: string | null
    category?: SupplierCategory | null
    status: SupplierStatus
    blockReason?: string | null
    createdBy?: string | null
    createdAt: string
    updatedAt: string
}

export interface SupplierBankAccount {
    id: string
    supplierId: string
    bankName: string
    accountName: string
    accountNumber: string
    routingNumber?: string | null
    swiftCode?: string | null
    iban?: string | null
    currency?: string | null
    isPrimary: boolean
    isActive: boolean
    createdAt: string
    updatedAt: string
}

export interface SupplierMaterial {
    id: string
    supplierId: string
    supplier?: { id: string; supplierCode: string; supplierName: string } | null
    materialId: string
    material?: { id: string; materialCode: string; materialName: string } | null
    supplierMaterialCode?: string | null
    unitPrice: number | string
    currencyId?: string | null
    currency?: { id: string; code: string; name: string } | null
    minimumOrderQuantity?: number | string | null
    leadTimeDays?: number | null
    validityStart?: string | null
    validityEnd?: string | null
    preferredSupplier: boolean
    status: string
    createdAt: string
    updatedAt: string
}

export interface SupplierAudit {
    id: string
    supplierId: string
    action: string
    field?: string | null
    oldValue?: string | null
    newValue?: string | null
    performedBy?: string | null
    performedAt: string
    ipAddress?: string | null
    details?: any
}

export interface SupplierListResponse {
    data: Supplier[]
    total: number
    page: number
    pageSize: number
}

export interface SupplierMaterialListResponse {
    data: SupplierMaterial[]
    total: number
    page: number
    pageSize: number
}

export interface SupplierQueryParams {
    status?: string
    categoryId?: string
    search?: string
    page?: number
    pageSize?: number
}
