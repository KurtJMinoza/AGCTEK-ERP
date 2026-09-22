import ErpAxiosBase from '@/services/axios/ErpAxiosBase'

export type AnalyticsParams = {
    companyId: string
    warehouseId?: string
    branchId?: string
    materialCategoryId?: string
    supplierId?: string
    materialId?: string
    dateFrom?: string
    dateTo?: string
    deadStockDays?: number
    expiryDays?: number
    role?: string
    authority?: string
    page?: number
    limit?: number
}

export type DefectTrendBucket = {
    week: string
    total: number
    codes: { code: string; count: number }[]
}

export type SupplierQualityMetricRow = {
    supplierId: string
    supplierCode: string
    supplierName: string
    lotsInspected: number
    totalQty: number
    acceptedQty: number
    rejectedQty: number
    defectQty: number
    acceptanceRate: number
    rejectionRate: number
    openNcCount: number
}

export type MaterialQualityMetricRow = {
    materialId: string
    materialCode: string
    materialName: string
    lotsInspected: number
    totalQty: number
    acceptedQty: number
    rejectedQty: number
    defectQty: number
    acceptanceRate: number
    rejectionRate: number
}

export type QualityAnalyticsResponse = {
    type: 'QUALITY'
    readOnly: true
    receivingAccuracy: {
        total: number
        varianceLines: number
        accuracyRate: number
    }
    qualityInspection: {
        lotCount: number
        pending: number
        activeHolds: number
        openNonconformances: number
        acceptedQty: number
        rejectedQty: number
        acceptanceRate: number
        rejectionRate: number
    }
    defectTrend: {
        buckets: DefectTrendBucket[]
        topDefects: { code: string; count: number }[]
    }
    supplierQualityMetric: SupplierQualityMetricRow[]
    materialQualityMetric: MaterialQualityMetricRow[]
    qualityHoldAging: {
        activeCount: number
        buckets: Record<string, number>
        releasedCount: number
        avgHoldDurationHours: number
    }
    inspectionTurnaround: {
        sampleSize: number
        avgHours: number
        medianHours: number
        p90Hours: number
        byPriority: Record<string, { avgHours: number; medianHours: number; p90Hours: number }>
    }
    nonconformanceMetric: {
        total: number
        byStatus: Record<string, number>
        bySeverity: Record<string, number>
        openCount: number
        resolvedCount: number
        avgResolutionDays: number
        openCapaCount: number
    }
    drillDown: Record<string, string>
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
        ErpAxiosBase.get<QualityAnalyticsResponse>(`${BASE}/quality`, { params }).then((r) => r.data),

    valuation: (params: AnalyticsParams) =>
        ErpAxiosBase.get(`${BASE}/valuation`, { params }).then((r) => r.data),
}
