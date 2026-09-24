import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import { mmCachedFetch, mmInvalidateCache } from '@/modules/mm/shared/mmReferenceCache'
import type {
    WarehouseListResponse,
    WarehouseQueryParams,
    Warehouse,
    CreateWarehousePayload,
    UpdateWarehousePayload,
} from '../types'

const BASE = '/mm/warehouses'
const OPTIONS_TTL_MS = 60_000

function isDropdownFetch(params?: WarehouseQueryParams) {
    const limit = Number((params as any)?.limit ?? 20)
    const page = Number((params as any)?.page ?? 1)
    return page === 1 && limit >= 100
}

export const warehouseService = {
    list: (params?: WarehouseQueryParams) => {
        const fetch = () =>
            ErpAxiosBase.get<WarehouseListResponse>(BASE, { params }).then((r) => r.data)
        if (!isDropdownFetch(params)) return fetch()
        const key = `warehouses:listOpts:${JSON.stringify(params ?? {})}`
        return mmCachedFetch(key, fetch, OPTIONS_TTL_MS)
    },

    get: (id: string) =>
        ErpAxiosBase.get<Warehouse>(`${BASE}/${id}`).then((r) => r.data),

    create: (data: CreateWarehousePayload) =>
        ErpAxiosBase.post<Warehouse>(BASE, data).then((r) => {
            mmInvalidateCache('warehouses:')
            mmInvalidateCache('org:warehouses')
            return r.data
        }),

    update: (id: string, data: UpdateWarehousePayload) =>
        ErpAxiosBase.put<Warehouse>(`${BASE}/${id}`, data).then((r) => {
            mmInvalidateCache('warehouses:')
            mmInvalidateCache('org:warehouses')
            return r.data
        }),

    activate: (id: string) =>
        ErpAxiosBase.post<Warehouse>(`${BASE}/${id}/activate`).then((r) => {
            mmInvalidateCache('warehouses:')
            mmInvalidateCache('org:warehouses')
            return r.data
        }),

    deactivate: (id: string) =>
        ErpAxiosBase.post<Warehouse>(`${BASE}/${id}/deactivate`).then((r) => {
            mmInvalidateCache('warehouses:')
            mmInvalidateCache('org:warehouses')
            return r.data
        }),

    remove: (id: string) =>
        ErpAxiosBase.delete(`${BASE}/${id}`).then((r) => {
            mmInvalidateCache('warehouses:')
            mmInvalidateCache('org:warehouses')
            return r.data
        }),
}
