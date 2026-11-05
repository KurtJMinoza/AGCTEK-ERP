import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    FicoAccountDetermination,
    FicoAccountGroup,
    FicoAccountMapping,
    FicoAccountingEventDetail,
    FicoAccountingEventList,
    FicoAuditEntry,
    FicoChart,
    FicoCompany,
    FicoCompanyGlAccount,
    FicoCompanySettings,
    FicoCompanySettingsRow,
    FicoFiscalVariant,
    FicoFiscalYearPreview,
    FicoFiscalYearSummary,
    FicoGlAccount,
    FicoGlAccountUsage,
    FicoGlImportReport,
    FicoGlImportRow,
    FicoDocumentType,
    FicoDocumentTypeInput,
    FicoJournalEntry,
    FicoJournalEntryInput,
    FicoJournalEntryParams,
    FicoOverview,
    FicoPaginated,
    FicoPeriod,
    FicoPostingVariant,
} from '../types'

const API = '/fico'

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

export const ficoSettingsService = {
    listCompanies: () =>
        ErpAxiosBase.get<FicoCompanySettingsRow[]>(
            `${API}/company-settings/companies`,
        ).then((r) => r.data),
    /** Companies the user belongs to, for readers without company-settings access. */
    listAccessibleCompanies: () =>
        ErpAxiosBase.get<FicoCompany[]>(`${API}/companies`).then((r) => r.data),
    defaults: () =>
        ErpAxiosBase.get<Record<string, unknown>>(
            `${API}/company-settings/defaults`,
        ).then((r) => r.data),
    get: async (companyId: string) => {
        try {
            const response = await ErpAxiosBase.get<FicoCompanySettings>(
                `${API}/company-settings/${companyId}`,
            )
            return response.data
        } catch (error: unknown) {
            const status = (error as { response?: { status?: number } })?.response
                ?.status
            if (status === 404) return null
            throw error
        }
    },
    create: (companyId: string, data: Record<string, unknown>) =>
        ErpAxiosBase.post<FicoCompanySettings>(
            `${API}/company-settings/${companyId}`,
            data,
        ).then((r) => r.data),
    update: (companyId: string, data: Record<string, unknown>) =>
        ErpAxiosBase.put<FicoCompanySettings>(
            `${API}/company-settings/${companyId}`,
            data,
        ).then((r) => r.data),
    validate: (companyId: string) =>
        ErpAxiosBase.post<{
            valid: boolean
            errors: Array<{ code: string; message: string; field?: string }>
            warnings: Array<{ code: string; message: string }>
        }>(`${API}/company-settings/${companyId}/validate`).then((r) => r.data),
    activate: (companyId: string) =>
        ErpAxiosBase.post<FicoCompanySettings>(
            `${API}/company-settings/${companyId}/activate`,
        ).then((r) => r.data),
    deactivate: (companyId: string, reason?: string) =>
        ErpAxiosBase.post<FicoCompanySettings>(
            `${API}/company-settings/${companyId}/deactivate`,
            { reason },
        ).then((r) => r.data),
}

export const ficoChartService = {
    list: (query: { search?: string; status?: string } = {}) =>
        ErpAxiosBase.get<FicoChart[]>(
            `${API}/chart-of-accounts${queryString(query)}`,
        ).then((r) => r.data),
    get: (id: string) =>
        ErpAxiosBase.get<FicoChart>(`${API}/chart-of-accounts/${id}`).then(
            (r) => r.data,
        ),
    create: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<FicoChart>(`${API}/chart-of-accounts`, data).then(
            (r) => r.data,
        ),
    update: (id: string, data: Record<string, unknown>) =>
        ErpAxiosBase.patch<FicoChart>(
            `${API}/chart-of-accounts/${id}`,
            data,
        ).then((r) => r.data),
    remove: (id: string) =>
        ErpAxiosBase.delete(`${API}/chart-of-accounts/${id}`).then(
            (r) => r.data,
        ),
    duplicate: (id: string, data: Record<string, unknown>) =>
        ErpAxiosBase.post<FicoChart>(
            `${API}/chart-of-accounts/${id}/duplicate`,
            data,
        ).then((r) => r.data),
    listGroups: (chartId: string) =>
        ErpAxiosBase.get<FicoAccountGroup[]>(
            `${API}/chart-of-accounts/${chartId}/groups`,
        ).then((r) => r.data),
    createGroup: (chartId: string, data: Record<string, unknown>) =>
        ErpAxiosBase.post<FicoAccountGroup>(
            `${API}/chart-of-accounts/${chartId}/groups`,
            data,
        ).then((r) => r.data),
    updateGroup: (
        chartId: string,
        groupId: string,
        data: Record<string, unknown>,
    ) =>
        ErpAxiosBase.patch<FicoAccountGroup>(
            `${API}/chart-of-accounts/${chartId}/groups/${groupId}`,
            data,
        ).then((r) => r.data),
    removeGroup: (chartId: string, groupId: string) =>
        ErpAxiosBase.delete(
            `${API}/chart-of-accounts/${chartId}/groups/${groupId}`,
        ).then((r) => r.data),
}

export const ficoGlAccountService = {
    list: (query: {
        chartOfAccountsId?: string
        accountType?: string
        status?: string
        search?: string
        companyId?: string
    } = {}) =>
        ErpAxiosBase.get<FicoGlAccount[]>(
            `${API}/gl-accounts${queryString(query)}`,
        ).then((r) => r.data),
    get: (id: string) =>
        ErpAxiosBase.get<FicoGlAccount>(`${API}/gl-accounts/${id}`).then(
            (r) => r.data,
        ),
    create: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<FicoGlAccount>(`${API}/gl-accounts`, data).then(
            (r) => r.data,
        ),
    update: (id: string, data: Record<string, unknown>) =>
        ErpAxiosBase.patch<FicoGlAccount>(
            `${API}/gl-accounts/${id}`,
            data,
        ).then((r) => r.data),
    remove: (id: string) =>
        ErpAxiosBase.delete(`${API}/gl-accounts/${id}`).then((r) => r.data),
    usage: (id: string) =>
        ErpAxiosBase.get<FicoGlAccountUsage>(`${API}/gl-accounts/${id}/usage`).then(
            (r) => r.data,
        ),
    /** Dry run validates only; a commit is all-or-nothing on the server. */
    importAccounts: (data: {
        chartOfAccountsId: string
        rows: FicoGlImportRow[]
        dryRun: boolean
    }) =>
        ErpAxiosBase.post<FicoGlImportReport>(
            `${API}/gl-accounts/import`,
            data,
        ).then((r) => r.data),
    listCompanyAssignments: (companyId: string) =>
        ErpAxiosBase.get<FicoCompanyGlAccount[]>(
            `${API}/gl-accounts/companies/${companyId}`,
        ).then((r) => r.data),
    upsertCompanyAssignment: (
        glAccountId: string,
        companyId: string,
        data: Record<string, unknown>,
    ) =>
        ErpAxiosBase.put<FicoCompanyGlAccount>(
            `${API}/gl-accounts/${glAccountId}/companies/${companyId}`,
            data,
        ).then((r) => r.data),
    removeCompanyAssignment: (glAccountId: string, companyId: string) =>
        ErpAxiosBase.delete(
            `${API}/gl-accounts/${glAccountId}/companies/${companyId}`,
        ).then((r) => r.data),
}

export const ficoAccountingEventService = {
    list: (query: {
        companyId: string
        status?: string
        sourceModule?: string
        search?: string
        page?: number
        pageSize?: number
    }) =>
        ErpAxiosBase.get<FicoAccountingEventList>(
            `${API}/accounting-events${queryString(query)}`,
        ).then((r) => r.data),
    get: (id: string) =>
        ErpAxiosBase.get<FicoAccountingEventDetail>(`${API}/accounting-events/${id}`).then(
            (r) => r.data,
        ),
}

export const ficoAccountDeterminationService = {
    get: (companyId: string) =>
        ErpAxiosBase.get<FicoAccountDetermination>(
            `${API}/account-determination${queryString({ companyId })}`,
        ).then((r) => r.data),
    createMapping: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<FicoAccountMapping>(
            `${API}/account-determination/mappings`,
            data,
        ).then((r) => r.data),
    updateMapping: (id: string, data: Record<string, unknown>) =>
        ErpAxiosBase.patch<FicoAccountMapping>(
            `${API}/account-determination/mappings/${id}`,
            data,
        ).then((r) => r.data),
    removeMapping: (id: string) =>
        ErpAxiosBase.delete(`${API}/account-determination/mappings/${id}`).then(
            (r) => r.data,
        ),
}

export const ficoCalendarService = {
    listFiscalVariants: () =>
        ErpAxiosBase.get<FicoFiscalVariant[]>(
            `${API}/fiscal-years/variants`,
        ).then((r) => r.data),
    createFiscalVariant: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<FicoFiscalVariant>(
            `${API}/fiscal-years/variants`,
            data,
        ).then((r) => r.data),
    updateFiscalVariant: (id: string, data: Record<string, unknown>) =>
        ErpAxiosBase.patch<FicoFiscalVariant>(
            `${API}/fiscal-years/variants/${id}`,
            data,
        ).then((r) => r.data),
    duplicateFiscalVariant: (
        id: string,
        data: { code: string; name: string; description?: string },
    ) =>
        ErpAxiosBase.post<FicoFiscalVariant>(
            `${API}/fiscal-years/variants/${id}/duplicate`,
            data,
        ).then((r) => r.data),
    /** Read-only: pass a saved variant id or an unsaved configuration. */
    preview: (data: {
        fiscalYear: number
        fiscalYearVariantId?: string
        startMonth?: number
        startDay?: number
        normalPeriodCount?: number
        specialPeriodCount?: number
        yearAssignment?: string
    }) =>
        ErpAxiosBase.post<FicoFiscalYearPreview>(
            `${API}/fiscal-years/preview`,
            data,
        ).then((r) => r.data),
    listPostingVariants: () =>
        ErpAxiosBase.get<FicoPostingVariant[]>(
            `${API}/fiscal-years/posting-variants`,
        ).then((r) => r.data),
    createPostingVariant: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<FicoPostingVariant>(
            `${API}/fiscal-years/posting-variants`,
            data,
        ).then((r) => r.data),
    updatePostingVariant: (id: string, data: Record<string, unknown>) =>
        ErpAxiosBase.patch<FicoPostingVariant>(
            `${API}/fiscal-years/posting-variants/${id}`,
            data,
        ).then((r) => r.data),
    listFiscalYears: (companyId: string) =>
        ErpAxiosBase.get<FicoFiscalYearSummary[]>(
            `${API}/fiscal-years${queryString({ companyId })}`,
        ).then((r) => r.data),
    generate: (data: Record<string, unknown>) =>
        ErpAxiosBase.post<{
            created: boolean
            existing: boolean
            periods: FicoPeriod[]
        }>(`${API}/fiscal-years/generate`, data).then((r) => r.data),
}

export const ficoPeriodService = {
    list: (query: {
        companyId: string
        fiscalYear?: number
        status?: string
        periodType?: string
    }) =>
        ErpAxiosBase.get<FicoPeriod[]>(
            `${API}/posting-periods${queryString(query)}`,
        ).then((r) => r.data),
    resolve: (companyId: string, postingDate: string) =>
        ErpAxiosBase.get<{
            period: FicoPeriod | null
            periodKey: string | null
            status: string | null
            canPost: boolean
        }>(
            `${API}/posting-periods/resolve${queryString({
                companyId,
                postingDate,
            })}`,
        ).then((r) => r.data),
    history: (id: string) =>
        ErpAxiosBase.get<
            Array<{
                id: string
                action: string
                fromStatus: string | null
                toStatus: string | null
                reason: string | null
                actorId: string | null
                createdAt: string
            }>
        >(`${API}/posting-periods/${id}/history`).then((r) => r.data),
    action: (
        id: string,
        action:
            | 'open'
            | 'restrict'
            | 'close'
            | 'lock'
            | 'reopen'
            | 'unlock',
        companyId: string,
        reason?: string,
    ) =>
        ErpAxiosBase.post<FicoPeriod>(
            `${API}/posting-periods/${id}/${action}`,
            { companyId, reason },
        ).then((r) => r.data),
}

export const ficoAuditService = {
    list: (query: {
        companyId?: string
        action?: string
        entityType?: string
        actorId?: string
        dateFrom?: string
        dateTo?: string
        page?: number
        pageSize?: number
    } = {}) =>
        ErpAxiosBase.get<{
            items: FicoAuditEntry[]
            total: number
            page: number
            pageSize: number
        }>(`${API}/audit${queryString(query)}`).then((r) => r.data),
}

export const ficoOverviewService = {
    get: (companyId: string) =>
        ErpAxiosBase.get<FicoOverview>(
            `${API}/overview${queryString({ companyId })}`,
        ).then((r) => r.data),
}

export function ficoErrorMessage(error: unknown, fallback: string) {
    const response = (
        error as {
            response?: {
                data?: {
                    message?: string | string[]
                    error?: string
                }
            }
        }
    )?.response?.data
    const message = response?.message
    if (Array.isArray(message)) return message.join(', ')
    if (typeof message === 'string' && message.trim()) return message
    if (typeof response?.error === 'string' && response.error.trim()) {
        return response.error
    }
    return fallback
}

export const ficoDocumentTypeService = {
    list: () =>
        ErpAxiosBase.get<FicoDocumentType[]>(`${API}/document-types`).then(
            (r) => r.data,
        ),
    create: (data: FicoDocumentTypeInput) =>
        ErpAxiosBase.post<FicoDocumentType>(
            `${API}/document-types`,
            data,
        ).then((r) => r.data),
    update: (id: string, data: Partial<FicoDocumentTypeInput>) =>
        ErpAxiosBase.patch<FicoDocumentType>(
            `${API}/document-types/${id}`,
            data,
        ).then((r) => r.data),
    deactivate: (id: string) =>
        ErpAxiosBase.delete<FicoDocumentType>(
            `${API}/document-types/${id}`,
        ).then((r) => r.data),
}

export const ficoJournalService = {
    list: (query: FicoJournalEntryParams = {}) =>
        ErpAxiosBase.get<FicoPaginated<FicoJournalEntry>>(
            `${API}/journal-entries${queryString(query)}`,
        ).then((r) => r.data),
    get: (id: string) =>
        ErpAxiosBase.get<FicoJournalEntry>(
            `${API}/journal-entries/${id}`,
        ).then((r) => r.data),
    create: (data: FicoJournalEntryInput) =>
        ErpAxiosBase.post<FicoJournalEntry>(
            `${API}/journal-entries`,
            data,
        ).then((r) => r.data),
    post: (id: string) =>
        ErpAxiosBase.patch<FicoJournalEntry>(
            `${API}/journal-entries/${id}/post`,
        ).then((r) => r.data),
    reverse: (id: string, postingDate?: string) =>
        ErpAxiosBase.post<FicoJournalEntry>(
            `${API}/journal-entries/${id}/reverse`,
            { postingDate },
        ).then((r) => r.data),
}
