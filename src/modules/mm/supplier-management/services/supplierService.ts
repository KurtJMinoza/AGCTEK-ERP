import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    Supplier,
    SupplierListResponse,
    SupplierQueryParams,
    SupplierAudit,
} from '../types'

const BASE = '/mm/suppliers'

export const supplierService = {
    list: (params?: SupplierQueryParams) =>
        ErpAxiosBase.get<SupplierListResponse>(BASE, { params }).then((r) => r.data),

    get: (id: string) =>
        ErpAxiosBase.get<Supplier>(`${BASE}/${id}`).then((r) => r.data),

    create: (data: any) =>
        ErpAxiosBase.post<Supplier>(BASE, data).then((r) => r.data),

    update: (id: string, data: any) =>
        ErpAxiosBase.put<Supplier>(`${BASE}/${id}`, data).then((r) => r.data),

    submit: (id: string) =>
        ErpAxiosBase.post<Supplier>(`${BASE}/${id}/submit`, {}).then((r) => r.data),

    approve: (id: string) =>
        ErpAxiosBase.post<Supplier>(`${BASE}/${id}/approve`, {}).then((r) => r.data),

    activate: (id: string) =>
        ErpAxiosBase.post<Supplier>(`${BASE}/${id}/activate`, {}).then((r) => r.data),

    deactivate: (id: string) =>
        ErpAxiosBase.post<Supplier>(`${BASE}/${id}/deactivate`, {}).then((r) => r.data),

    block: (id: string, reason?: string) =>
        ErpAxiosBase.post<Supplier>(`${BASE}/${id}/block`, { reason }).then((r) => r.data),

    unblock: (id: string) =>
        ErpAxiosBase.post<Supplier>(`${BASE}/${id}/unblock`, {}).then((r) => r.data),

    delete: (id: string) =>
        ErpAxiosBase.delete(`${BASE}/${id}`).then((r) => r.data),

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

    removeDocument: (id: string, documentId: string) =>
        ErpAxiosBase.delete(`${BASE}/${id}/documents/${documentId}`).then((r) => r.data),
}
