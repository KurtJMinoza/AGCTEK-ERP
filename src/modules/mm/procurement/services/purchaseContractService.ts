import ErpAxiosBase from '@/services/axios/ErpAxiosBase'

const BASE = '/mm/purchase-contracts'

export type PurchaseContract = {
    id: string
    contractNumber: string
    companyId: string
    supplierId: string
    buyerId: string
    status: string
    validFrom: string
    validTo?: string | null
    currencyId?: string | null
    paymentTermsId?: string | null
    deliveryTerms?: string | null
    materialCategoryId?: string | null
    purchaseOrderId?: string | null
    notes?: string | null
    supplier?: { id: string; supplierCode: string; supplierName: string }
    company?: { id: string; name: string; code: string }
    purchaseOrder?: { id: string; poNumber: string; status: string } | null
    lines?: Array<{
        id: string
        materialId: string
        uomId: string
        negotiatedPrice: number | string
        moq?: number | string | null
        leadTimeDays?: number | null
        material?: { id: string; materialCode: string; materialName: string }
        uom?: { id: string; code: string; name: string }
    }>
}

export const purchaseContractService = {
    list: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: PurchaseContract[]; total: number }>(BASE, {
            params,
        }).then((r) => r.data),

    get: (id: string) =>
        ErpAxiosBase.get<PurchaseContract>(`${BASE}/${id}`).then((r) => r.data),

    create: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<PurchaseContract>(BASE, data).then((r) => r.data),

    update: (id: string, data: Record<string, unknown>) =>
        ErpAxiosBase.patch<PurchaseContract>(`${BASE}/${id}`, data).then(
            (r) => r.data,
        ),

    activate: (id: string) =>
        ErpAxiosBase.post<PurchaseContract>(`${BASE}/${id}/activate`).then(
            (r) => r.data,
        ),

    expire: (id: string) =>
        ErpAxiosBase.post<PurchaseContract>(`${BASE}/${id}/expire`).then(
            (r) => r.data,
        ),

    cancel: (id: string, reason?: string) =>
        ErpAxiosBase.post<PurchaseContract>(`${BASE}/${id}/cancel`, {
            reason,
        }).then((r) => r.data),

    linkPo: (id: string, purchaseOrderId: string) =>
        ErpAxiosBase.post<PurchaseContract>(`${BASE}/${id}/link-po`, {
            purchaseOrderId,
        }).then((r) => r.data),
}
