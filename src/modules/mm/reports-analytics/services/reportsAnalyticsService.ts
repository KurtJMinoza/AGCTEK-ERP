import ErpAxiosBase from '@/services/axios/ErpAxiosBase'

const BASE = '/mm/reports'

export type ReportParams = {
    companyId: string
    warehouseId?: string
    branchId?: string
    materialCategoryId?: string
    supplierId?: string
    materialId?: string
    dateFrom?: string
    dateTo?: string
    deadStockDays?: number
    agingBuckets?: string
    groupBy?: string
    page?: number
    limit?: number
    role?: string
    authority?: string
}

export const reportsAnalyticsService = {
    stock: (params: ReportParams) =>
        ErpAxiosBase.get(`${BASE}/stock`, { params }).then((r) => r.data),

    inventoryValuation: (params: ReportParams) =>
        ErpAxiosBase.get(`${BASE}/inventory-valuation`, { params }).then((r) => r.data),

    aging: (params: ReportParams) =>
        ErpAxiosBase.get(`${BASE}/aging`, { params }).then((r) => r.data),

    deadStock: (params: ReportParams) =>
        ErpAxiosBase.get(`${BASE}/dead-stock`, { params }).then((r) => r.data),

    turnover: (params: ReportParams) =>
        ErpAxiosBase.get(`${BASE}/turnover`, { params }).then((r) => r.data),

    procurement: (params: ReportParams) =>
        ErpAxiosBase.get(`${BASE}/procurement`, { params }).then((r) => r.data),

    supplierPerformance: (params: ReportParams) =>
        ErpAxiosBase.get(`${BASE}/supplier-performance`, { params }).then((r) => r.data),

    warehousePerformance: (params: ReportParams) =>
        ErpAxiosBase.get(`${BASE}/warehouse-performance`, { params }).then((r) => r.data),

    stockVariance: (params: ReportParams) =>
        ErpAxiosBase.get(`${BASE}/stock-variance`, { params }).then((r) => r.data),
}

export type ReportEndpoint =
    | 'aging'
    | 'dead-stock'
    | 'turnover'
    | 'procurement'
    | 'supplier-performance'
    | 'warehouse-performance'
    | 'stock-variance'
    | 'stock'
    | 'inventory-valuation'

export async function fetchReport(endpoint: ReportEndpoint, params: ReportParams) {
    switch (endpoint) {
        case 'aging':
            return reportsAnalyticsService.aging(params)
        case 'dead-stock':
            return reportsAnalyticsService.deadStock(params)
        case 'turnover':
            return reportsAnalyticsService.turnover(params)
        case 'procurement':
            return reportsAnalyticsService.procurement(params)
        case 'supplier-performance':
            return reportsAnalyticsService.supplierPerformance(params)
        case 'warehouse-performance':
            return reportsAnalyticsService.warehousePerformance(params)
        case 'stock-variance':
            return reportsAnalyticsService.stockVariance(params)
        case 'stock':
            return reportsAnalyticsService.stock(params)
        case 'inventory-valuation':
            return reportsAnalyticsService.inventoryValuation(params)
    }
}
