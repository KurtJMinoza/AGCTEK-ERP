import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import { mmCachedFetch, mmInvalidateCache } from '@/modules/mm/shared/mmReferenceCache'
import type {
    Supplier,
    SupplierListResponse,
    SupplierQueryParams,
    SupplierAudit,
} from '../types'

const BASE = '/mm/suppliers'
const OPTIONS_TTL_MS = 60_000

function isDropdownFetch(params?: SupplierQueryParams) {
    const limit = Number((params as any)?.pageSize ?? (params as any)?.limit ?? 20)
    const page = Number((params as any)?.page ?? 1)
    return page === 1 && limit >= 100
}

export const supplierService = {
    list: (params?: SupplierQueryParams) => {
        const fetch = () =>
            ErpAxiosBase.get<SupplierListResponse>(BASE, { params }).then((r) => r.data)
        if (!isDropdownFetch(params)) return fetch()
        const key = `suppliers:opts:${JSON.stringify(params ?? {})}`
        return mmCachedFetch(key, fetch, OPTIONS_TTL_MS)
    },

    get: (id: string) =>
        ErpAxiosBase.get<Supplier>(`${BASE}/${id}`).then((r) => r.data),

    create: (data: any) =>
        ErpAxiosBase.post<Supplier>(BASE, data).then((r) => {
            mmInvalidateCache('suppliers:')
            return r.data
        }),

    update: (id: string, data: any) =>
        ErpAxiosBase.put<Supplier>(`${BASE}/${id}`, data).then((r) => {
            mmInvalidateCache('suppliers:')
            return r.data
        }),

    submit: (id: string) =>
        ErpAxiosBase.post<Supplier>(`${BASE}/${id}/submit`, {}).then((r) => {
            mmInvalidateCache('suppliers:')
            return r.data
        }),

    approve: (id: string) =>
        ErpAxiosBase.post<Supplier>(`${BASE}/${id}/approve`, {}).then((r) => {
            mmInvalidateCache('suppliers:')
            return r.data
        }),

    activate: (id: string) =>
        ErpAxiosBase.post<Supplier>(`${BASE}/${id}/activate`, {}).then((r) => {
            mmInvalidateCache('suppliers:')
            return r.data
        }),

    deactivate: (id: string) =>
        ErpAxiosBase.post<Supplier>(`${BASE}/${id}/deactivate`, {}).then((r) => {
            mmInvalidateCache('suppliers:')
            return r.data
        }),

    block: (id: string, reason?: string) =>
        ErpAxiosBase.post<Supplier>(`${BASE}/${id}/block`, { reason }).then((r) => {
            mmInvalidateCache('suppliers:')
            return r.data
        }),

    unblock: (id: string) =>
        ErpAxiosBase.post<Supplier>(`${BASE}/${id}/unblock`, {}).then((r) => {
            mmInvalidateCache('suppliers:')
            return r.data
        }),

    delete: (id: string) =>
        ErpAxiosBase.delete(`${BASE}/${id}`).then((r) => {
            mmInvalidateCache('suppliers:')
            return r.data
        }),

    getAudit: (id: string) =>
        ErpAxiosBase.get<SupplierAudit[]>(`${BASE}/${id}/audit`).then((r) => r.data),

    listDocuments: (id: string) =>
        ErpAxiosBase.get(`${BASE}/${id}/documents`).then((r) => r.data),

    addDocument: (
        id: string,
        data: {
            fileName: string
            fileUrl?: string
            storageKey?: string
            mimeType?: string
            docType?: string
            uploadedBy?: string
        },
    ) => ErpAxiosBase.post(`${BASE}/${id}/documents`, data).then((r) => r.data),

    uploadDocument: (id: string, file: File, docType?: string, uploadedBy?: string) => {
        const formData = new FormData()
        if (docType) formData.append('docType', docType)
        if (uploadedBy) formData.append('uploadedBy', uploadedBy)
        formData.append('file', file)
        return ErpAxiosBase.post(`${BASE}/${id}/documents/upload`, formData).then(
            (r) => r.data,
        )
    },

    getDocumentFileUrl: (supplierId: string, documentId: string) =>
        `${BASE}/${supplierId}/documents/${documentId}/file`,

    removeDocument: (id: string, documentId: string) =>
        ErpAxiosBase.delete(`${BASE}/${id}/documents/${documentId}`).then((r) => r.data),
}
