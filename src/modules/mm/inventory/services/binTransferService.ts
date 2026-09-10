import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    BinTransfer,
    StockOpsListResponse,
    StockOpsQueryParams,
} from '../types'

const BASE = '/mm/bin-transfers'

export const binTransferService = {
    list: (params?: StockOpsQueryParams) =>
        ErpAxiosBase.get<StockOpsListResponse<BinTransfer>>(BASE, { params }).then((r) => r.data),

    get: (id: string) =>
        ErpAxiosBase.get<BinTransfer>(`${BASE}/${id}`).then((r) => r.data),

    create: (data: any) =>
        ErpAxiosBase.post<BinTransfer>(BASE, data).then((r) => r.data),

    post: (id: string) =>
        ErpAxiosBase.post<BinTransfer>(`${BASE}/${id}/post`).then((r) => r.data),

    cancel: (id: string) =>
        ErpAxiosBase.post<BinTransfer>(`${BASE}/${id}/cancel`).then((r) => r.data),

    reverse: (id: string) =>
        ErpAxiosBase.post<BinTransfer>(`${BASE}/${id}/reverse`).then((r) => r.data),
}
