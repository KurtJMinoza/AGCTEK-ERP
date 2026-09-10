import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    CreateGoodsReceiptPayload,
    GoodsReceipt,
    StockOpsListResponse,
    StockOpsQueryParams,
} from '../types'

const BASE = '/mm/goods-receipts'

export const goodsReceiptService = {
    list: (params?: StockOpsQueryParams) =>
        ErpAxiosBase.get<StockOpsListResponse<GoodsReceipt>>(BASE, { params }).then((r) => r.data),

    get: (id: string) =>
        ErpAxiosBase.get<GoodsReceipt>(`${BASE}/${id}`).then((r) => r.data),

    create: (data: CreateGoodsReceiptPayload) =>
        ErpAxiosBase.post<GoodsReceipt>(BASE, data).then((r) => r.data),

    post: (id: string) =>
        ErpAxiosBase.post<GoodsReceipt>(`${BASE}/${id}/post`).then((r) => r.data),

    cancel: (id: string) =>
        ErpAxiosBase.post<GoodsReceipt>(`${BASE}/${id}/cancel`).then((r) => r.data),

    reverse: (id: string) =>
        ErpAxiosBase.post<GoodsReceipt>(`${BASE}/${id}/reverse`).then((r) => r.data),
}
