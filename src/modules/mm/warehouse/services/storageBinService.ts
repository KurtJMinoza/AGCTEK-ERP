import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    StorageBinListResponse,
    StorageBinQueryParams,
    StorageBin,
    CreateStorageBinPayload,
    UpdateStorageBinPayload,
    BinCapacitySummary,
} from '../types'

const BASE = '/mm/storage-bins'

export const storageBinService = {
    list: (params?: StorageBinQueryParams) =>
        ErpAxiosBase.get<StorageBinListResponse>(BASE, { params }).then(
            (r) => r.data,
        ),

    get: (id: string) =>
        ErpAxiosBase.get<StorageBin>(`${BASE}/${id}`).then((r) => r.data),

    create: (data: CreateStorageBinPayload) =>
        ErpAxiosBase.post<StorageBin>(BASE, data).then((r) => r.data),

    update: (id: string, data: UpdateStorageBinPayload) =>
        ErpAxiosBase.put<StorageBin>(`${BASE}/${id}`, data).then(
            (r) => r.data,
        ),

    activate: (id: string) =>
        ErpAxiosBase.post<StorageBin>(`${BASE}/${id}/activate`).then(
            (r) => r.data,
        ),

    deactivate: (id: string) =>
        ErpAxiosBase.post<StorageBin>(`${BASE}/${id}/deactivate`).then(
            (r) => r.data,
        ),

    remove: (id: string) =>
        ErpAxiosBase.delete(`${BASE}/${id}`).then((r) => r.data),

    getCapacitySummary: (params?: { warehouseId?: string }) =>
        ErpAxiosBase.get<BinCapacitySummary>(`${BASE}/capacity/summary`, {
            params,
        }).then((r) => r.data),

    listWithOccupancy: (params?: StorageBinQueryParams) =>
        ErpAxiosBase.get<StorageBin[]>(`${BASE}/capacity/details`, {
            params,
        }).then((r) => r.data),
}
