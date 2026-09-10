import ErpAxiosBase from '@/services/axios/ErpAxiosBase'

export type SupplierPrice = {
    id: string
    supplierId: string
    materialId: string
    supplierMaterialId?: string | null
    unitPrice: number
    currencyId?: string | null
    currency?: { id: string; code: string; name: string; symbol?: string } | null
    minimumQuantity: number
    effectiveFrom: string
    effectiveTo?: string | null
    supplier?: { id: string; supplierCode: string; supplierName: string }
    material?: { id: string; materialCode: string; materialName: string }
    createdAt: string
    updatedAt: string
}

const BASE = '/mm/supplier-prices'

export const supplierPricingService = {
    list: (params?: { supplierId?: string; materialId?: string }) =>
        ErpAxiosBase.get<SupplierPrice[]>(BASE, { params }).then((r) => r.data),

    resolve: (params: { supplierId: string; materialId: string; quantity?: number; asOf?: string }) =>
        ErpAxiosBase.get<SupplierPrice>(`${BASE}/resolve`, { params }).then((r) => r.data),

    create: (data: {
        supplierId: string
        materialId: string
        unitPrice: number
        currencyId?: string
        minimumQuantity?: number
        effectiveFrom?: string
        effectiveTo?: string | null
    }) => ErpAxiosBase.post<SupplierPrice>(BASE, data).then((r) => r.data),

    update: (id: string, data: any) =>
        ErpAxiosBase.put<SupplierPrice>(`${BASE}/${id}`, data).then((r) => r.data),

    remove: (id: string) =>
        ErpAxiosBase.delete(`${BASE}/${id}`).then((r) => r.data),
}
