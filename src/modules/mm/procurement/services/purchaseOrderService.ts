import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    MmPurchaseOrder,
    MmPurchaseOrderAudit,
    MmPurchaseOrderAttachment,
    MmPoToleranceConfig,
    PoDocumentFlow,
    PoListResponse,
    PoQueryParams,
} from '../types'

const BASE = '/mm/purchase-orders'

export const purchaseOrderService = {
    list: (params?: PoQueryParams) =>
        ErpAxiosBase.get<PoListResponse>(BASE, { params }).then((r) => r.data),

    get: (id: string) =>
        ErpAxiosBase.get<MmPurchaseOrder>(`${BASE}/${id}`).then((r) => r.data),

    create: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<MmPurchaseOrder>(BASE, data).then((r) => r.data),

    createFromAward: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<MmPurchaseOrder>(`${BASE}/from-award`, data).then((r) => r.data),

    createFromPr: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<MmPurchaseOrder>(`${BASE}/from-pr`, data).then((r) => r.data),

    update: (id: string, data: Record<string, unknown>) =>
        ErpAxiosBase.put<MmPurchaseOrder>(`${BASE}/${id}`, data).then((r) => r.data),

    submit: (id: string, performedBy?: string) =>
        ErpAxiosBase.post<MmPurchaseOrder>(`${BASE}/${id}/submit`, { performedBy }).then((r) => r.data),

    approve: (id: string, performedBy?: string, comment?: string) =>
        ErpAxiosBase.post<MmPurchaseOrder>(`${BASE}/${id}/approve`, { performedBy, comment }).then(
            (r) => r.data,
        ),

    reject: (id: string, reason?: string, performedBy?: string) =>
        ErpAxiosBase.post<MmPurchaseOrder>(`${BASE}/${id}/reject`, {
            reason,
            performedBy,
        }).then((r) => r.data),

    returnPo: (id: string, comment?: string, performedBy?: string) =>
        ErpAxiosBase.post<MmPurchaseOrder>(`${BASE}/${id}/return`, { comment, performedBy }).then(
            (r) => r.data,
        ),

    send: (id: string, performedBy?: string) =>
        ErpAxiosBase.post<MmPurchaseOrder>(`${BASE}/${id}/send`, { performedBy }).then((r) => r.data),

    cancel: (id: string, reason?: string, performedBy?: string) =>
        ErpAxiosBase.post<MmPurchaseOrder>(`${BASE}/${id}/cancel`, { reason, performedBy }).then(
            (r) => r.data,
        ),

    close: (id: string, performedBy?: string) =>
        ErpAxiosBase.post<MmPurchaseOrder>(`${BASE}/${id}/close`, { performedBy }).then((r) => r.data),

    getAudit: (id: string) =>
        ErpAxiosBase.get<MmPurchaseOrderAudit[]>(`${BASE}/${id}/audit`).then((r) => r.data),

    getDocumentFlow: (id: string) =>
        ErpAxiosBase.get<PoDocumentFlow>(`${BASE}/${id}/document-flow`).then((r) => r.data),

    listAttachments: (id: string) =>
        ErpAxiosBase.get<MmPurchaseOrderAttachment[]>(`${BASE}/${id}/attachments`).then((r) => r.data),

    addAttachment: (id: string, data: Record<string, unknown>) =>
        ErpAxiosBase.post<MmPurchaseOrderAttachment>(`${BASE}/${id}/attachments`, data).then(
            (r) => r.data,
        ),

    deleteAttachment: (id: string, attachmentId: string, performedBy?: string) =>
        ErpAxiosBase.delete(`${BASE}/${id}/attachments/${attachmentId}`, {
            data: { performedBy },
        }).then((r) => r.data),

    getTolerances: (companyId: string) =>
        ErpAxiosBase.get<MmPoToleranceConfig>('/mm/po-tolerances', {
            params: { companyId },
        }).then((r) => r.data),

    upsertTolerances: (data: Record<string, unknown>) =>
        ErpAxiosBase.put<MmPoToleranceConfig>('/mm/po-tolerances', data).then((r) => r.data),
}
