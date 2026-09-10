import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type { SupplierInvoice, MatchException, ListMeta } from '../types'

const BASE = '/mm/three-way-match'

export const threeWayMatchService = {
    listInvoices: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: SupplierInvoice[]; meta: ListMeta }>(
            `${BASE}/invoices`,
            { params },
        ).then((r) => r.data),

    getInvoice: (id: string) =>
        ErpAxiosBase.get<SupplierInvoice>(`${BASE}/invoices/${id}`).then(
            (r) => r.data,
        ),

    createInvoice: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<SupplierInvoice>(`${BASE}/invoices`, data).then(
            (r) => r.data,
        ),

    updateInvoice: (id: string, data: Record<string, unknown>) =>
        ErpAxiosBase.patch<SupplierInvoice>(`${BASE}/invoices/${id}`, data).then(
            (r) => r.data,
        ),

    submitInvoice: (id: string) =>
        ErpAxiosBase.post<SupplierInvoice>(
            `${BASE}/invoices/${id}/submit`,
            {},
        ).then((r) => r.data),

    matchPreview: (id: string) =>
        ErpAxiosBase.get(`${BASE}/invoices/${id}/match-preview`).then(
            (r) => r.data,
        ),

    runMatch: (id: string) =>
        ErpAxiosBase.post<SupplierInvoice>(
            `${BASE}/invoices/${id}/run-match`,
            {},
        ).then((r) => r.data),

    approveInvoice: (id: string, data?: Record<string, unknown>) =>
        ErpAxiosBase.post<SupplierInvoice>(
            `${BASE}/invoices/${id}/approve`,
            data ?? {},
        ).then((r) => r.data),

    listExceptions: (params?: Record<string, unknown>) =>
        ErpAxiosBase.get<{ data: MatchException[]; meta: ListMeta }>(
            `${BASE}/exceptions`,
            { params },
        ).then((r) => r.data),

    acknowledgeException: (id: string) =>
        ErpAxiosBase.post(`${BASE}/exceptions/${id}/acknowledge`, {}).then(
            (r) => r.data,
        ),

    resolveException: (id: string, data?: Record<string, unknown>) =>
        ErpAxiosBase.post(`${BASE}/exceptions/${id}/resolve`, data ?? {}).then(
            (r) => r.data,
        ),

    waiveException: (id: string, data?: Record<string, unknown>) =>
        ErpAxiosBase.post(`${BASE}/exceptions/${id}/waive`, data ?? {}).then(
            (r) => r.data,
        ),

    getTolerance: (companyId: string) =>
        ErpAxiosBase.get(`${BASE}/tolerance-config`, {
            params: { companyId },
        }).then((r) => r.data),

    upsertTolerance: (data: Record<string, unknown>) =>
        ErpAxiosBase.patch(`${BASE}/tolerance-config`, data).then((r) => r.data),
}
