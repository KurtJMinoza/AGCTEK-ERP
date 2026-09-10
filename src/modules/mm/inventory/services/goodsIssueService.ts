import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    GoodsIssue,
    StockOpsListResponse,
    StockOpsQueryParams,
} from '../types'

const BASE = '/mm/goods-issues'

export const goodsIssueService = {
    list: (params?: StockOpsQueryParams) =>
        ErpAxiosBase.get<StockOpsListResponse<GoodsIssue>>(BASE, { params }).then((r) => r.data),

    get: (id: string) =>
        ErpAxiosBase.get<GoodsIssue>(`${BASE}/${id}`).then((r) => r.data),

    create: (data: any) =>
        ErpAxiosBase.post<GoodsIssue>(BASE, data).then((r) => r.data),

    post: (id: string) =>
        ErpAxiosBase.post<GoodsIssue>(`${BASE}/${id}/post`).then((r) => r.data),

    cancel: (id: string) =>
        ErpAxiosBase.post<GoodsIssue>(`${BASE}/${id}/cancel`).then((r) => r.data),

    reverse: (id: string) =>
        ErpAxiosBase.post<GoodsIssue>(`${BASE}/${id}/reverse`).then((r) => r.data),
}
