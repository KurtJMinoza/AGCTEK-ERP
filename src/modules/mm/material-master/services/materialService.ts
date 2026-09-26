import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import { mmCachedFetch, mmInvalidateCache } from '@/modules/mm/shared/mmReferenceCache'
import type {
    MaterialListResponse,
    MaterialQueryParams,
    Material,
    CreateMaterialPayload,
    UpdateMaterialPayload,
} from '../types'

const BASE = '/mm/materials'
const OPTIONS_TTL_MS = 60_000

function isDropdownFetch(params?: MaterialQueryParams) {
    const limit = Number((params as any)?.limit ?? (params as any)?.pageSize ?? 20)
    const page = Number((params as any)?.page ?? 1)
    return page === 1 && limit >= 100
}

export const materialService = {
    list: (params?: MaterialQueryParams) => {
        const fetch = () =>
            ErpAxiosBase.get<MaterialListResponse>(BASE, { params }).then((r) => r.data)
        if (!isDropdownFetch(params)) return fetch()
        const key = `materials:opts:${JSON.stringify(params ?? {})}`
        return mmCachedFetch(key, fetch, OPTIONS_TTL_MS)
    },

    get: (id: string) =>
        ErpAxiosBase.get<Material>(`${BASE}/${id}`).then((r) => r.data),

    create: (data: CreateMaterialPayload) =>
        ErpAxiosBase.post<Material>(BASE, data).then((r) => {
            mmInvalidateCache('materials:')
            return r.data
        }),

    update: (id: string, data: UpdateMaterialPayload) =>
        ErpAxiosBase.put<Material>(`${BASE}/${id}`, data).then((r) => {
            mmInvalidateCache('materials:')
            return r.data
        }),

    activate: (id: string) =>
        ErpAxiosBase.post<Material>(`${BASE}/${id}/activate`).then((r) => {
            mmInvalidateCache('materials:')
            return r.data
        }),

    deactivate: (id: string) =>
        ErpAxiosBase.post<Material>(`${BASE}/${id}/deactivate`).then((r) => {
            mmInvalidateCache('materials:')
            return r.data
        }),

    block: (id: string, reason?: string) =>
        ErpAxiosBase.post<Material>(`${BASE}/${id}/block`, { reason }).then((r) => {
            mmInvalidateCache('materials:')
            return r.data
        }),

    unblock: (id: string) =>
        ErpAxiosBase.post<Material>(`${BASE}/${id}/unblock`).then((r) => {
            mmInvalidateCache('materials:')
            return r.data
        }),

    remove: (id: string) =>
        ErpAxiosBase.delete(`${BASE}/${id}`).then((r) => {
            mmInvalidateCache('materials:')
            return r.data
        }),

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
