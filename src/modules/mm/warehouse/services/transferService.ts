import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    WarehouseTransfer,
    TransferListResponse,
    TransferQueryParams,
    CreateTransferPayload,
} from '../types'

const BASE = '/mm/warehouse-transfers'

export const transferService = {
    list: (params?: TransferQueryParams) =>
        ErpAxiosBase.get<TransferListResponse>(BASE, { params }).then(
            (r) => r.data,
        ),

    get: (id: string) =>
        ErpAxiosBase.get<WarehouseTransfer>(`${BASE}/${id}`).then(
            (r) => r.data,
        ),

    create: (data: CreateTransferPayload) =>
        ErpAxiosBase.post<WarehouseTransfer>(BASE, data).then((r) => r.data),

    approve: (id: string) =>
        ErpAxiosBase.post<WarehouseTransfer>(`${BASE}/${id}/approve`).then(
            (r) => r.data,
        ),

    pick: (id: string, data: { lineId: string; pickedQty: number }) =>
        ErpAxiosBase.post<WarehouseTransfer>(
            `${BASE}/${id}/pick`,
            data,
        ).then((r) => r.data),

    dispatch: (id: string) =>
        ErpAxiosBase.post<WarehouseTransfer>(`${BASE}/${id}/dispatch`).then(
            (r) => r.data,
        ),

    receive: (id: string, data: { lineId: string; receivedQty: number }) =>
        ErpAxiosBase.post<WarehouseTransfer>(
            `${BASE}/${id}/receive`,
            data,
        ).then((r) => r.data),

    complete: (id: string) =>
        ErpAxiosBase.post<WarehouseTransfer>(`${BASE}/${id}/complete`).then(
            (r) => r.data,
        ),

    cancel: (id: string) =>
        ErpAxiosBase.post<WarehouseTransfer>(`${BASE}/${id}/cancel`).then(
            (r) => r.data,
        ),
}
