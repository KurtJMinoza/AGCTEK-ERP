import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    StorageSectionListResponse,
    StorageSectionQueryParams,
    StorageSection,
    CreateStorageSectionPayload,
    UpdateStorageSectionPayload,
} from '../types'

const BASE = '/mm/storage-sections'

export const storageSectionService = {
    list: (params?: StorageSectionQueryParams) =>
        ErpAxiosBase.get<StorageSectionListResponse>(BASE, { params }).then(
            (r) => r.data,
        ),

    get: (id: string) =>
        ErpAxiosBase.get<StorageSection>(`${BASE}/${id}`).then((r) => r.data),

    create: (data: CreateStorageSectionPayload) =>
        ErpAxiosBase.post<StorageSection>(BASE, data).then((r) => r.data),

    update: (id: string, data: UpdateStorageSectionPayload) =>
        ErpAxiosBase.put<StorageSection>(`${BASE}/${id}`, data).then(
            (r) => r.data,
        ),

    activate: (id: string) =>
        ErpAxiosBase.post<StorageSection>(`${BASE}/${id}/activate`).then(
            (r) => r.data,
        ),

    deactivate: (id: string) =>
        ErpAxiosBase.post<StorageSection>(`${BASE}/${id}/deactivate`).then(
            (r) => r.data,
        ),

    remove: (id: string) =>
        ErpAxiosBase.delete(`${BASE}/${id}`).then((r) => r.data),
}
