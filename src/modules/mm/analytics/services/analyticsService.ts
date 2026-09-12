import ErpAxiosBase from '@/services/axios/ErpAxiosBase'

export type AnalyticsParams = {
    companyId: string
    warehouseId?: string
    branchId?: string
    materialCategoryId?: string
    supplierId?: string
    dateFrom?: string
    dateTo?: string
    deadStockDays?: number
    expiryDays?: number
    role?: string
    authority?: string
    page?: number
    limit?: number
}

const BASE = '/mm/analytics'

/** Canonical MM-14 analytics facade — read-only aggregates. */
export const analyticsService = {
    inventory: (params: AnalyticsParams) =>
        ErpAxiosBase.get(`${BASE}/inventory`, { params }).then((r) => r.data),

    procurement: (params: AnalyticsParams) =>
        ErpAxiosBase.get(`${BASE}/procurement`, { params }).then((r) => r.data),

    warehouse: (params: AnalyticsParams) =>
        ErpAxiosBase.get(`${BASE}/warehouse`, { params }).then((r) => r.data),

    quality: (params: AnalyticsParams) =>
        ErpAxiosBase.get(`${BASE}/quality`, { params }).then((r) => r.data),

    valuation: (params: AnalyticsParams) =>
        ErpAxiosBase.get(`${BASE}/valuation`, { params }).then((r) => r.data),
}
