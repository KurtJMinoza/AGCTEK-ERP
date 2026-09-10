import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    WarehouseTransferOrder,
    StockOpsListResponse,
    StockOpsQueryParams,
} from '../types'

const BASE = '/mm/warehouse-transfer-orders'

export const warehouseTransferOrderService = {
    list: (params?: StockOpsQueryParams) =>
        ErpAxiosBase.get<StockOpsListResponse<WarehouseTransferOrder>>(BASE, { params }).then((r) => r.data),

    get: (id: string) =>
        ErpAxiosBase.get<WarehouseTransferOrder>(`${BASE}/${id}`).then((r) => r.data),

    create: (data: any) =>
        ErpAxiosBase.post<WarehouseTransferOrder>(BASE, data).then((r) => r.data),

    approve: (id: string, approvedBy?: string) =>
        ErpAxiosBase.post<WarehouseTransferOrder>(`${BASE}/${id}/approve`, { approvedBy }).then((r) => r.data),

    pick: (id: string) =>
        ErpAxiosBase.post<WarehouseTransferOrder>(`${BASE}/${id}/pick`).then((r) => r.data),

    dispatch: (id: string) =>
        ErpAxiosBase.post<WarehouseTransferOrder>(`${BASE}/${id}/dispatch`).then((r) => r.data),

    receive: (id: string, lineId: string, receivedQty: number) =>
        ErpAxiosBase.post<WarehouseTransferOrder>(`${BASE}/${id}/receive`, { lineId, receivedQty }).then((r) => r.data),

    complete: (id: string) =>
        ErpAxiosBase.post<WarehouseTransferOrder>(`${BASE}/${id}/complete`).then((r) => r.data),

    cancel: (id: string) =>
        ErpAxiosBase.post<WarehouseTransferOrder>(`${BASE}/${id}/cancel`).then((r) => r.data),
}
