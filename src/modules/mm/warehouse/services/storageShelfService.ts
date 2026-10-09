import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    StorageShelfListResponse,
    StorageShelfQueryParams,
    StorageShelf,
    CreateStorageShelfPayload,
    UpdateStorageShelfPayload,
} from '../types'

const BASE = '/mm/storage-shelves'

export const storageShelfService = {
    list: (params?: StorageShelfQueryParams) =>
        ErpAxiosBase.get<StorageShelfListResponse>(BASE, { params }).then(
            (r) => r.data,
        ),

    get: (id: string) =>
        ErpAxiosBase.get<StorageShelf>(`${BASE}/${id}`).then((r) => r.data),

    create: (data: CreateStorageShelfPayload) =>
        ErpAxiosBase.post<StorageShelf>(BASE, data).then((r) => r.data),

    update: (id: string, data: UpdateStorageShelfPayload) =>
        ErpAxiosBase.put<StorageShelf>(`${BASE}/${id}`, data).then(
            (r) => r.data,
        ),

    remove: (id: string) =>
        ErpAxiosBase.delete(`${BASE}/${id}`).then((r) => r.data),
}
