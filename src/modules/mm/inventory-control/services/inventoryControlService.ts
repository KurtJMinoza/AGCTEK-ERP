import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    CountRule,
    InventoryCount,
    InventoryCountLine,
    ListMeta,
} from '../types'

const BASE = '/mm/inventory-control'

export const inventoryControlService = {
    // Rules
    listRules: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: CountRule[]; meta: ListMeta }>(
            `${BASE}/count-rules`,
            { params },
        ).then((r) => r.data),

    createRule: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<CountRule>(`${BASE}/count-rules`, data).then((r) => r.data),

    updateRule: (id: string, data: Record<string, unknown>) =>
        ErpAxiosBase.patch<CountRule>(`${BASE}/count-rules/${id}`, data).then(
            (r) => r.data,
        ),

    deleteRule: (id: string) =>
        ErpAxiosBase.delete(`${BASE}/count-rules/${id}`).then((r) => r.data),

    // Counts
    listCounts: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: InventoryCount[]; meta: ListMeta }>(
            `${BASE}/counts`,
            { params },
        ).then((r) => r.data),

    getCount: (id: string, blind?: boolean) =>
        ErpAxiosBase.get<InventoryCount>(`${BASE}/counts/${id}`, {
            params: blind ? { blind: true } : undefined,
        }).then((r) => r.data),

    createCount: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<InventoryCount>(`${BASE}/counts`, data).then(
            (r) => r.data,
        ),

    generate: (id: string, data?: Record<string, unknown>) =>
        ErpAxiosBase.post<InventoryCount>(
            `${BASE}/counts/${id}/generate`,
            data ?? {},
        ).then((r) => r.data),

    start: (id: string) =>
        ErpAxiosBase.post<InventoryCount>(`${BASE}/counts/${id}/start`, {}).then(
            (r) => r.data,
        ),

    computeVariances: (id: string) =>
        ErpAxiosBase.post<InventoryCount>(
            `${BASE}/counts/${id}/compute-variances`,
            {},
        ).then((r) => r.data),

    submitApproval: (id: string) =>
        ErpAxiosBase.post<InventoryCount>(
            `${BASE}/counts/${id}/submit-approval`,
            {},
        ).then((r) => r.data),

    approve: (id: string, data?: Record<string, unknown>) =>
        ErpAxiosBase.post<InventoryCount>(
            `${BASE}/counts/${id}/approve`,
            data ?? {},
        ).then((r) => r.data),

    reject: (id: string, data?: Record<string, unknown>) =>
        ErpAxiosBase.post<InventoryCount>(
            `${BASE}/counts/${id}/reject`,
            data ?? {},
        ).then((r) => r.data),

    postAdjustments: (id: string, data?: Record<string, unknown>) =>
        ErpAxiosBase.post<InventoryCount>(
            `${BASE}/counts/${id}/post-adjustments`,
            data ?? {},
        ).then((r) => r.data),

    close: (id: string) =>
        ErpAxiosBase.post<InventoryCount>(`${BASE}/counts/${id}/close`, {}).then(
            (r) => r.data,
        ),

    // Lines
    listLines: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: InventoryCountLine[]; meta: ListMeta }>(
            `${BASE}/count-lines`,
            { params },
        ).then((r) => r.data),

    blindCount: (id: string, data: Record<string, unknown>) =>
        ErpAxiosBase.post<InventoryCountLine>(
            `${BASE}/count-lines/${id}/blind-count`,
            data,
        ).then((r) => r.data),

    recount: (id: string, data: Record<string, unknown>) =>
        ErpAxiosBase.post<InventoryCountLine>(
            `${BASE}/count-lines/${id}/recount`,
            data,
        ).then((r) => r.data),

    // Phase 7 canonical APIs
    listPolicies: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: any[]; total: number }>(`${BASE}/count-policies`, {
            params,
        }).then((r) => r.data),

    createPolicy: (data: Record<string, unknown>) =>
        ErpAxiosBase.post(`${BASE}/count-policies`, data).then((r) => r.data),

    listPlans: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: any[]; total: number }>(`${BASE}/count-plans`, {
            params,
        }).then((r) => r.data),

    createPlan: (data: Record<string, unknown>) =>
        ErpAxiosBase.post(`${BASE}/count-plans`, data).then((r) => r.data),

    generatePlan: (id: string, data?: Record<string, unknown>) =>
        ErpAxiosBase.post(`${BASE}/count-plans/${id}/generate`, data ?? {}).then(
            (r) => r.data,
        ),

    listSessions: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: any[]; total: number }>(`${BASE}/count-sessions`, {
            params,
        }).then((r) => r.data),

    getSession: (id: string, blind?: boolean) =>
        ErpAxiosBase.get(`${BASE}/count-sessions/${id}`, {
            params: blind ? { blind: true } : undefined,
        }).then((r) => r.data),

    startSession: (id: string) =>
        ErpAxiosBase.post(`${BASE}/count-sessions/${id}/start`, {}).then((r) => r.data),

    createEntry: (data: Record<string, unknown>) =>
        ErpAxiosBase.post(`${BASE}/count-entries`, data).then((r) => r.data),

    listRecounts: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: any[]; total: number }>(`${BASE}/recounts`, {
            params,
        }).then((r) => r.data),

    createRecount: (data: Record<string, unknown>) =>
        ErpAxiosBase.post(`${BASE}/recounts`, data).then((r) => r.data),

    listAdjustmentRequests: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: any[]; total: number }>(
            `${BASE}/adjustment-requests`,
            { params },
        ).then((r) => r.data),

    createAdjustmentRequest: (data: Record<string, unknown>) =>
        ErpAxiosBase.post(`${BASE}/adjustment-requests`, data).then((r) => r.data),

    approveAdjustmentRequest: (id: string, data?: Record<string, unknown>) =>
        ErpAxiosBase.post(
            `${BASE}/adjustment-requests/${id}/approve`,
            data ?? {},
        ).then((r) => r.data),

    rejectAdjustmentRequest: (id: string, data?: Record<string, unknown>) =>
        ErpAxiosBase.post(
            `${BASE}/adjustment-requests/${id}/reject`,
            data ?? {},
        ).then((r) => r.data),
}
