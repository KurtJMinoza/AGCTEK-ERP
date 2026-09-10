import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    WarehouseListResponse,
    WarehouseQueryParams,
    Warehouse,
    CreateWarehousePayload,
    UpdateWarehousePayload,
} from '../types'

const BASE = '/mm/warehouses'

export const warehouseService = {
    list: (params?: WarehouseQueryParams) =>
        ErpAxiosBase.get<WarehouseListResponse>(BASE, { params }).then(
            (r) => r.data,
        ),

    get: (id: string) =>
        ErpAxiosBase.get<Warehouse>(`${BASE}/${id}`).then((r) => r.data),

    create: (data: CreateWarehousePayload) =>
        ErpAxiosBase.post<Warehouse>(BASE, data).then((r) => r.data),

    update: (id: string, data: UpdateWarehousePayload) =>
        ErpAxiosBase.put<Warehouse>(`${BASE}/${id}`, data).then((r) => r.data),

    activate: (id: string) =>
        ErpAxiosBase.post<Warehouse>(`${BASE}/${id}/activate`).then(
            (r) => r.data,
        ),

    deactivate: (id: string) =>
        ErpAxiosBase.post<Warehouse>(`${BASE}/${id}/deactivate`).then(
            (r) => r.data,
        ),

    remove: (id: string) =>
        ErpAxiosBase.delete(`${BASE}/${id}`).then((r) => r.data),
}
