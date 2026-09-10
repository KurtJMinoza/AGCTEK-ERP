import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    ListMeta,
    PlanningDemand,
    ReorderRule,
    MrpRun,
    MaterialRequirement,
    ProcurementSuggestion,
    PlanningDashboard,
} from '../types'

const BASE = '/mm/planning'

export const planningService = {
    dashboard: (params: { companyId: string; warehouseId?: string }) =>
        ErpAxiosBase.get<PlanningDashboard>(`${BASE}/dashboard`, { params }).then(
            (r) => r.data,
        ),

    listDemand: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: PlanningDemand[]; meta: ListMeta }>(
            `${BASE}/demand`,
            { params },
        ).then((r) => r.data),

    createDemand: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<PlanningDemand>(`${BASE}/demand`, data).then(
            (r) => r.data,
        ),

    updateDemand: (id: string, data: Record<string, unknown>) =>
        ErpAxiosBase.patch<PlanningDemand>(`${BASE}/demand/${id}`, data).then(
            (r) => r.data,
        ),

    deleteDemand: (id: string) =>
        ErpAxiosBase.delete(`${BASE}/demand/${id}`).then((r) => r.data),

    listReorderRules: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: ReorderRule[]; meta: ListMeta }>(
            `${BASE}/reorder-rules`,
            { params },
        ).then((r) => r.data),

    createReorderRule: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<ReorderRule>(`${BASE}/reorder-rules`, data).then(
            (r) => r.data,
        ),

    updateReorderRule: (id: string, data: Record<string, unknown>) =>
        ErpAxiosBase.patch<ReorderRule>(
            `${BASE}/reorder-rules/${id}`,
            data,
        ).then((r) => r.data),

    deleteReorderRule: (id: string) =>
        ErpAxiosBase.delete(`${BASE}/reorder-rules/${id}`).then((r) => r.data),

    listMrpRuns: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: MrpRun[]; meta: ListMeta }>(
            `${BASE}/mrp-runs`,
            { params },
        ).then((r) => r.data),

    getMrpRun: (id: string) =>
        ErpAxiosBase.get<MrpRun>(`${BASE}/mrp-runs/${id}`).then((r) => r.data),

    createMrpRun: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<MrpRun>(`${BASE}/mrp-runs`, data).then((r) => r.data),

    executeMrpRun: (id: string) =>
        ErpAxiosBase.post<MrpRun>(`${BASE}/mrp-runs/${id}/execute`, {}).then(
            (r) => r.data,
        ),

    listRequirements: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: MaterialRequirement[]; meta: ListMeta }>(
            `${BASE}/material-requirements`,
            { params },
        ).then((r) => r.data),

    listSuggestions: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: ProcurementSuggestion[]; meta: ListMeta }>(
            `${BASE}/suggestions`,
            { params },
        ).then((r) => r.data),

    convertSuggestion: (id: string, data: Record<string, unknown>) =>
        ErpAxiosBase.post<{
            suggestion: ProcurementSuggestion
            purchaseRequisition: { id: string; requisitionNumber: string }
        }>(`${BASE}/suggestions/${id}/convert-pr`, data).then((r) => r.data),

    dismissSuggestion: (id: string) =>
        ErpAxiosBase.post<ProcurementSuggestion>(
            `${BASE}/suggestions/${id}/dismiss`,
            {},
        ).then((r) => r.data),
}
