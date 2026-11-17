import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    FicoAccountResolutionResult,
    FicoDeterminationHistoryEntry,
    FicoDeterminationList,
    FicoDeterminationModule,
    FicoDeterminationReference,
    FicoDeterminationRule,
    FicoDeterminationSummary,
} from '../accountDeterminationTypes'

const API = '/fico/account-determination'

type QueryValue = string | number | boolean | undefined | null

function queryString(query: Record<string, QueryValue>) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === '') continue
        params.set(key, String(value))
    }
    const text = params.toString()
    return text ? `?${text}` : ''
}

export type DeterminationRuleQuery = {
    companyId: string
    sourceModule?: FicoDeterminationModule
    transactionType?: string
    status?: string
    search?: string
    page?: number
    pageSize?: number
}

/** Centralized account determination: rule maintenance, approval and resolution. */
export const ficoAccountDeterminationRuleService = {
    list: (query: DeterminationRuleQuery) =>
        ErpAxiosBase.get<FicoDeterminationList>(
            `${API}/rules${queryString(query)}`,
        ).then((response) => response.data),
    get: (id: string) =>
        ErpAxiosBase.get<FicoDeterminationRule>(`${API}/rules/${id}`).then(
            (response) => response.data,
        ),
    create: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<FicoDeterminationRule>(`${API}/rules`, data).then(
            (response) => response.data,
        ),
    update: (id: string, data: Record<string, unknown>) =>
        ErpAxiosBase.patch<FicoDeterminationRule>(`${API}/rules/${id}`, data).then(
            (response) => response.data,
        ),
    remove: (id: string) =>
        ErpAxiosBase.delete(`${API}/rules/${id}`).then((response) => response.data),
    submit: (id: string) =>
        ErpAxiosBase.post<FicoDeterminationRule>(`${API}/rules/${id}/submit`).then(
            (response) => response.data,
        ),
    resubmit: (id: string) =>
        ErpAxiosBase.post<FicoDeterminationRule>(`${API}/rules/${id}/resubmit`).then(
            (response) => response.data,
        ),
    approve: (id: string, reason?: string) =>
        ErpAxiosBase.post<FicoDeterminationRule>(`${API}/rules/${id}/approve`, {
            reason,
        }).then((response) => response.data),
    reject: (id: string, reason: string) =>
        ErpAxiosBase.post<FicoDeterminationRule>(`${API}/rules/${id}/reject`, {
            reason,
        }).then((response) => response.data),
    activate: (id: string) =>
        ErpAxiosBase.post<FicoDeterminationRule>(`${API}/rules/${id}/activate`).then(
            (response) => response.data,
        ),
    deactivate: (id: string, reason?: string) =>
        ErpAxiosBase.post<FicoDeterminationRule>(`${API}/rules/${id}/deactivate`, {
            reason,
        }).then((response) => response.data),
    history: (id: string) =>
        ErpAxiosBase.get<FicoDeterminationHistoryEntry[]>(
            `${API}/rules/${id}/history`,
        ).then((response) => response.data),
    configurationHistory: (query: DeterminationRuleQuery) =>
        ErpAxiosBase.get<{
            items: FicoDeterminationHistoryEntry[]
            total: number
            page: number
            pageSize: number
        }>(`${API}/rules/history${queryString(query)}`).then((response) => response.data),
    summary: (companyId: string) =>
        ErpAxiosBase.get<FicoDeterminationSummary>(
            `${API}/summary${queryString({ companyId })}`,
        ).then((response) => response.data),
    reference: (companyId: string) =>
        ErpAxiosBase.get<FicoDeterminationReference>(
            `${API}/reference${queryString({ companyId })}`,
        ).then((response) => response.data),
    resolve: (payload: Record<string, unknown>) =>
        ErpAxiosBase.post<FicoAccountResolutionResult>(
            `${API}/resolve`,
            payload,
        ).then((response) => response.data),
}
