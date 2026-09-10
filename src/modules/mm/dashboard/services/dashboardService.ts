import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type { MmDashboard } from '../types'

const BASE = '/mm/dashboard'

export type DashboardParams = {
    companyId: string
    warehouseId?: string
    branchId?: string
    materialCategoryId?: string
    supplierId?: string
    dateFrom?: string
    dateTo?: string
    deadStockDays?: number
    role?: string
    authority?: string
}

export const dashboardService = {
    get: (params: DashboardParams) =>
        ErpAxiosBase.get<MmDashboard>(BASE, { params }).then((r) => r.data),

    getKpis: (params: DashboardParams) =>
        ErpAxiosBase.get(`${BASE}/kpis`, { params }).then((r) => r.data),

    getAlerts: (params: DashboardParams) =>
        ErpAxiosBase.get(`${BASE}/alerts`, { params }).then((r) => r.data),

    getAnalytics: (type: string, params: DashboardParams) =>
        ErpAxiosBase.get(`${BASE}/analytics/${type}`, { params }).then((r) => r.data),

    refresh: (body: DashboardParams) =>
        ErpAxiosBase.post(`${BASE}/refresh`, body).then((r) => r.data),
}
