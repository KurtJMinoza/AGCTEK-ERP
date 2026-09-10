import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    InventoryAdjustment,
    StockOpsListResponse,
    StockOpsQueryParams,
} from '../types'

const BASE = '/mm/adjustments'

export const adjustmentService = {
    list: (params?: StockOpsQueryParams) =>
        ErpAxiosBase.get<StockOpsListResponse<InventoryAdjustment>>(BASE, { params }).then((r) => r.data),

    get: (id: string) =>
        ErpAxiosBase.get<InventoryAdjustment>(`${BASE}/${id}`).then((r) => r.data),

    create: (data: any) =>
        ErpAxiosBase.post<InventoryAdjustment>(BASE, data).then((r) => r.data),

    submit: (id: string) =>
        ErpAxiosBase.post<InventoryAdjustment>(`${BASE}/${id}/submit`).then((r) => r.data),

    approve: (id: string, approvedBy?: string) =>
        ErpAxiosBase.post<InventoryAdjustment>(`${BASE}/${id}/approve`, { approvedBy }).then((r) => r.data),

    reject: (id: string, reason?: string) =>
        ErpAxiosBase.post<InventoryAdjustment>(`${BASE}/${id}/reject`, { reason }).then((r) => r.data),

    cancel: (id: string) =>
        ErpAxiosBase.post<InventoryAdjustment>(`${BASE}/${id}/cancel`).then((r) => r.data),

    reverse: (id: string) =>
        ErpAxiosBase.post<InventoryAdjustment>(`${BASE}/${id}/reverse`).then((r) => r.data),
}
