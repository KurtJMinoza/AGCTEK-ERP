import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    StorageTypeListResponse,
    StorageTypeQueryParams,
    StorageType,
    CreateStorageTypePayload,
    UpdateStorageTypePayload,
} from '../types'

const BASE = '/mm/storage-types'

export const storageTypeService = {
    list: (params?: StorageTypeQueryParams) =>
        ErpAxiosBase.get<StorageTypeListResponse>(BASE, { params }).then(
            (r) => r.data,
        ),

    get: (id: string) =>
        ErpAxiosBase.get<StorageType>(`${BASE}/${id}`).then((r) => r.data),

    create: (data: CreateStorageTypePayload) =>
        ErpAxiosBase.post<StorageType>(BASE, data).then((r) => r.data),

    update: (id: string, data: UpdateStorageTypePayload) =>
        ErpAxiosBase.put<StorageType>(`${BASE}/${id}`, data).then(
            (r) => r.data,
        ),

    activate: (id: string) =>
        ErpAxiosBase.post<StorageType>(`${BASE}/${id}/activate`).then(
            (r) => r.data,
        ),

    deactivate: (id: string) =>
        ErpAxiosBase.post<StorageType>(`${BASE}/${id}/deactivate`).then(
            (r) => r.data,
        ),

    remove: (id: string) =>
        ErpAxiosBase.delete(`${BASE}/${id}`).then((r) => r.data),
}
