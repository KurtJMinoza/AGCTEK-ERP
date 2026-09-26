import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    CreateStoPayload,
    DispatchStoPayload,
    ReceiveStoPayload,
    StockTransferOrder,
    StoListResponse,
    StoQueryParams,
} from '../types'

const BASE = '/mm/stock-transfer-orders'

export const stockTransferOrderService = {
    list: (params?: StoQueryParams) =>
        ErpAxiosBase.get<StoListResponse>(BASE, { params }).then((r) => r.data),

    get: (id: string) =>
        ErpAxiosBase.get<StockTransferOrder>(`${BASE}/${id}`).then((r) => r.data),

    create: (data: CreateStoPayload) =>
        ErpAxiosBase.post<StockTransferOrder>(BASE, data).then((r) => r.data),

    submit: (id: string) =>
        ErpAxiosBase.post<StockTransferOrder>(`${BASE}/${id}/submit`).then((r) => r.data),

    approve: (id: string, approvedBy?: string) =>
        ErpAxiosBase.post<StockTransferOrder>(`${BASE}/${id}/approve`, {
            approvedBy,
        }).then((r) => r.data),

    allocate: (id: string) =>
        ErpAxiosBase.post<StockTransferOrder>(`${BASE}/${id}/allocate`).then((r) => r.data),

    dispatch: (id: string, data?: DispatchStoPayload) =>
        ErpAxiosBase.post<StockTransferOrder>(`${BASE}/${id}/dispatch`, data ?? {}).then(
            (r) => r.data,
        ),

    receive: (id: string, data: ReceiveStoPayload) =>
        ErpAxiosBase.post<StockTransferOrder>(`${BASE}/${id}/receive`, data).then(
            (r) => r.data,
        ),

    cancel: (id: string) =>
        ErpAxiosBase.post<StockTransferOrder>(`${BASE}/${id}/cancel`).then((r) => r.data),
}
