import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    MaterialListResponse,
    MaterialQueryParams,
    Material,
    CreateMaterialPayload,
    UpdateMaterialPayload,
} from '../types'

const BASE = '/mm/materials'

export const materialService = {
    list: (params?: MaterialQueryParams) =>
        ErpAxiosBase.get<MaterialListResponse>(BASE, { params }).then((r) => r.data),

    get: (id: string) =>
        ErpAxiosBase.get<Material>(`${BASE}/${id}`).then((r) => r.data),

    create: (data: CreateMaterialPayload) =>
        ErpAxiosBase.post<Material>(BASE, data).then((r) => r.data),

    update: (id: string, data: UpdateMaterialPayload) =>
        ErpAxiosBase.put<Material>(`${BASE}/${id}`, data).then((r) => r.data),

    activate: (id: string) =>
        ErpAxiosBase.post<Material>(`${BASE}/${id}/activate`).then((r) => r.data),

    deactivate: (id: string) =>
        ErpAxiosBase.post<Material>(`${BASE}/${id}/deactivate`).then((r) => r.data),

    block: (id: string, reason?: string) =>
        ErpAxiosBase.post<Material>(`${BASE}/${id}/block`, { reason }).then((r) => r.data),

    unblock: (id: string) =>
        ErpAxiosBase.post<Material>(`${BASE}/${id}/unblock`).then((r) => r.data),

    remove: (id: string) =>
        ErpAxiosBase.delete(`${BASE}/${id}`).then((r) => r.data),

    balances: (id: string) =>
        ErpAxiosBase.get(`${BASE}/${id}/balances`).then((r) => r.data),

    transactions: (id: string, limit = 50) =>
        ErpAxiosBase.get(`${BASE}/${id}/transactions`, { params: { limit } }).then((r) => r.data),

    attachments: (id: string) =>
        ErpAxiosBase.get(`${BASE}/${id}/attachments`).then((r) => r.data),

    addAttachment: (id: string, data: { fileName: string; fileUrl?: string; storageKey?: string; mimeType?: string }) =>
        ErpAxiosBase.post(`${BASE}/${id}/attachments`, data).then((r) => r.data),

    removeAttachment: (id: string, attachmentId: string) =>
        ErpAxiosBase.delete(`${BASE}/${id}/attachments/${attachmentId}`).then((r) => r.data),
}
