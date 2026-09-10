import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    ListMeta,
    ScoreWeightConfig,
    AlertConfig,
    SupplierEvaluation,
    SupplierPerfAlert,
    PerformanceDashboard,
    SupplierPerformanceDetail,
    ManualAssessment,
} from '../types'

const BASE = '/mm/supplier-performance'

export const supplierPerformanceService = {
    getWeights: (companyId: string) =>
        ErpAxiosBase.get<ScoreWeightConfig>(`${BASE}/weight-config`, {
            params: { companyId },
        }).then((r) => r.data),

    upsertWeights: (data: ScoreWeightConfig) =>
        ErpAxiosBase.patch<ScoreWeightConfig>(`${BASE}/weight-config`, data).then(
            (r) => r.data,
        ),

    getAlertConfig: (companyId: string) =>
        ErpAxiosBase.get<AlertConfig>(`${BASE}/alert-config`, {
            params: { companyId },
        }).then((r) => r.data),

    upsertAlertConfig: (data: Record<string, unknown>) =>
        ErpAxiosBase.patch<AlertConfig>(`${BASE}/alert-config`, data).then(
            (r) => r.data,
        ),

    runEvaluation: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<{
            evaluated: number
            data: SupplierEvaluation[]
        }>(`${BASE}/evaluations/run`, data).then((r) => r.data),

    listEvaluations: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: SupplierEvaluation[]; meta: ListMeta }>(
            `${BASE}/evaluations`,
            { params },
        ).then((r) => r.data),

    getEvaluation: (id: string) =>
        ErpAxiosBase.get<SupplierEvaluation>(`${BASE}/evaluations/${id}`).then(
            (r) => r.data,
        ),

    dashboard: (params: Record<string, unknown>) =>
        ErpAxiosBase.get<PerformanceDashboard>(`${BASE}/dashboard`, {
            params,
        }).then((r) => r.data),

    trends: (params: Record<string, unknown>) =>
        ErpAxiosBase.get<{
            supplierId: string
            data: PerformanceDashboard['trend']
        }>(`${BASE}/trends`, { params }).then((r) => r.data),

    supplierDetail: (supplierId: string, params: Record<string, unknown>) =>
        ErpAxiosBase.get<SupplierPerformanceDetail>(
            `${BASE}/suppliers/${supplierId}/detail`,
            { params },
        ).then((r) => r.data),

    compare: (params: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: any[] }>(`${BASE}/compare`, { params }).then(
            (r) => r.data,
        ),

    listAlerts: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: SupplierPerfAlert[]; meta: ListMeta }>(
            `${BASE}/alerts`,
            { params },
        ).then((r) => r.data),

    acknowledgeAlert: (id: string) =>
        ErpAxiosBase.post<SupplierPerfAlert>(
            `${BASE}/alerts/${id}/acknowledge`,
            {},
        ).then((r) => r.data),

    dismissAlert: (id: string) =>
        ErpAxiosBase.post<SupplierPerfAlert>(
            `${BASE}/alerts/${id}/dismiss`,
            {},
        ).then((r) => r.data),

    listManualAssessments: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: ManualAssessment[]; meta: ListMeta }>(
            `${BASE}/manual-assessments`,
            { params },
        ).then((r) => r.data),

    createManualAssessment: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<ManualAssessment>(
            `${BASE}/manual-assessments`,
            data,
        ).then((r) => r.data),
}
