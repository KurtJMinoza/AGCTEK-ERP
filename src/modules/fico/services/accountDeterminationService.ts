import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    FicoAccountResolutionResult,
    FicoDeterminationHistoryEntry,
    FicoDeterminationList,
    FicoDeterminationModule,
    FicoDeterminationReference,
    FicoDeterminationRule,
    FicoDeterminationSummary,
    FicoDeterminationWorkbenchOverview,
    TransactionKeyCatalogRow,
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
    workbenchOverview: (companyId: string) =>
        ErpAxiosBase.get<FicoDeterminationWorkbenchOverview>(
            `${API}/workbench/overview${queryString({ companyId })}`,
        ).then((response) => response.data),
    transactionKeyCatalog: () =>
        ErpAxiosBase.get<{ catalog: TransactionKeyCatalogRow[] }>(
            `${API}/transaction-keys`,
        ).then((response) => response.data.catalog),
    resolveDetermination: (payload: Record<string, unknown>) =>
        ErpAxiosBase.post<Record<string, unknown>>(
            `${API}/resolve-determination`,
            payload,
        ).then((response) => response.data),
    simulate: (payload: Record<string, unknown>) =>
        ErpAxiosBase.post<import('../accountDeterminationTypes').DeterminationSimulationResult>(
            `${API}/simulate`,
            payload,
        ).then((response) => response.data),
    validateDraft: (payload: Record<string, unknown>) =>
        ErpAxiosBase.post<{ ok: boolean; errors: string[]; warnings: string[] }>(
            `${API}/rules/validate-draft`,
            payload,
        ).then((response) => response.data),
    eligibleGlAccounts: (query: {
        companyId: string
        search?: string
        transactionKeyCode?: string
    }) =>
        ErpAxiosBase.get<
            import('../accountDeterminationTypes').FicoDeterminationEligibleGlAccount[]
        >(
            `${API}/gl-accounts${queryString(query)}`,
        ).then((response) => response.data),
    duplicateRule: (id: string) =>
        ErpAxiosBase.post<FicoDeterminationRule>(`${API}/rules/${id}/duplicate`).then(
            (response) => response.data,
        ),
    validateRule: (id: string) =>
        ErpAxiosBase.post<{
            ruleId: string
            determinationCode: string
            ok: boolean
            errors: string[]
            warnings: string[]
        }>(`${API}/rules/${id}/validate`).then((response) => response.data),
    newVersion: (id: string, body: { effectiveFrom?: string; changeReason?: string }) =>
        ErpAxiosBase.post<{
            predecessor: { id: string; determinationCode: string; proposedEffectiveTo: string }
            successor: FicoDeterminationRule
            note: string
        }>(`${API}/rules/${id}/new-version`, body).then((response) => response.data),
    exceptions: (query: {
        companyId: string
        category?: string
        page?: number
        pageSize?: number
    }) =>
        ErpAxiosBase.get<
            import('../accountDeterminationTypes').FicoDeterminationExceptionList
        >(`${API}/exceptions${queryString(query)}`).then((response) => response.data),
    moduleCoverage: (companyId: string) =>
        ErpAxiosBase.get<
            import('../accountDeterminationTypes').FicoDeterminationModuleCoverage
        >(`${API}/module-coverage${queryString({ companyId })}`).then(
            (response) => response.data,
        ),
    usage: (query: {
        companyId: string
        glAccountId?: string
        transactionKeyCode?: string
    }) =>
        ErpAxiosBase.get<{
            companyId: string
            rules: FicoDeterminationRule[]
            legacyMappingCount: number
            postedJournalLineCount: number
        }>(`${API}/usage${queryString(query)}`).then((response) => response.data),
    validateConflicts: (body: {
        companyId: string
        sourceModule?: string
        transactionKeyCode?: string
    }) =>
        ErpAxiosBase.post<{
            safeDryRun: boolean
            examinedRules: number
            ambiguous: number
            conflicts: Array<{
                left: string
                right: string
                transactionType: string
                reason: string
                sameTarget: boolean
            }>
        }>(`${API}/validate-conflicts`, body).then((response) => response.data),
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
