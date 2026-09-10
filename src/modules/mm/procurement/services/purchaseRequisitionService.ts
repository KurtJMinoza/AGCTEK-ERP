import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    PurchaseRequisition,
    PrListResponse,
    PrQueryParams,
    PrAudit,
} from '../types'

const BASE = '/mm/purchase-requisitions'

export const purchaseRequisitionService = {
    list: (params?: PrQueryParams) =>
        ErpAxiosBase.get<PrListResponse>(BASE, { params }).then((r) => r.data),

    get: (id: string) =>
        ErpAxiosBase.get<PurchaseRequisition>(`${BASE}/${id}`).then((r) => r.data),

    create: (data: any) =>
        ErpAxiosBase.post<PurchaseRequisition>(BASE, data).then((r) => r.data),

    update: (id: string, data: any) =>
        ErpAxiosBase.put<PurchaseRequisition>(`${BASE}/${id}`, data).then((r) => r.data),

    submit: (id: string, performedBy?: string) =>
        ErpAxiosBase.post<PurchaseRequisition>(`${BASE}/${id}/submit`, { performedBy }).then((r) => r.data),

    approve: (id: string, performedBy?: string, comment?: string) =>
        ErpAxiosBase.post<PurchaseRequisition>(`${BASE}/${id}/approve`, { performedBy, comment }).then((r) => r.data),

    reject: (id: string, reason?: string, performedBy?: string) =>
        ErpAxiosBase.post<PurchaseRequisition>(`${BASE}/${id}/reject`, { reason, performedBy }).then((r) => r.data),

    return: (id: string, comment?: string, performedBy?: string) =>
        ErpAxiosBase.post<PurchaseRequisition>(`${BASE}/${id}/return`, { comment, performedBy }).then((r) => r.data),

    cancel: (id: string, performedBy?: string) =>
        ErpAxiosBase.post<PurchaseRequisition>(`${BASE}/${id}/cancel`, { performedBy }).then((r) => r.data),

    close: (id: string, performedBy?: string) =>
        ErpAxiosBase.post<PurchaseRequisition>(`${BASE}/${id}/close`, { performedBy }).then((r) => r.data),

    convert: (id: string, data: { lines: { lineId: string; targetType: string; convertedQty: number; targetId?: string }[] }) =>
        ErpAxiosBase.post<PurchaseRequisition>(`${BASE}/${id}/convert`, data).then((r) => r.data),

    getAudit: (id: string) =>
        ErpAxiosBase.get<PrAudit[]>(`${BASE}/${id}/audit`).then((r) => r.data),
}
