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
    FicoDocumentType,
    FicoDocumentTypeHistoryResponse,
    FicoDocumentTypeListResponse,
    FicoDocumentTypeReferenceData,
    FicoDocumentTypeSummary,
    FicoFiscalVariant,
    FicoFiscalYearPreview,
    FicoFiscalYearSummary,
    FicoGlAccount,
    FicoGlAccountBalances,
    FicoGlAccountCompanyContext,
    FicoGlAccountDependencies,
    FicoGlAccountUsage,
    FicoGlImportReport,
    FicoGlImportRow,
    FicoNumberRange,
    FicoNumberRangeLog,
    FicoOverview,
    FicoPeriod,
    FicoPeriodDetail,
    FicoPeriodHistoryEntry,
    FicoPeriodSummary,
    FicoPostingVariant,
    FicoTaxCode,
    FicoTaxCodeHistoryResponse,
    FicoTaxCodeListResponse,
    FicoTaxCodeSummary,
    FicoTaxCalculationResult,
    FicoTaxRate,
    FicoTaxRateListResponse,
    FicoJournalEntryDetail,
    FicoJournalListQuery,
    FicoJournalListResponse,
    FicoJournalSimulateResult,
    FicoJournalWorkbenchSummary,
    FicoGlLedgerLineItemsResponse,
    FicoGlAccountBalanceSummary,
    FicoTrialBalanceResponse,
    FicoAuditEntry,
    FicoArAgingResponse,
    FicoArDocumentDetail,
    FicoArOpenItem,
    FicoArOpenItemQuery,
} from '../types'

type UpdateJournalEntryBody = {
    companyId: string
    postingDate?: string
    description?: string
    currencyCode?: string
    supplierId?: string | null
    lines?: Array<{
        glAccountId: string
        debitAmount?: number
        creditAmount?: number
        description?: string
    }>
}

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

type GlAccountListPayload =
    | FicoGlAccount[]
    | { items?: FicoGlAccount[]; total?: number; page?: number; pageSize?: number }

/** Backend may return a bare array or a paginated envelope when `page` is set. */
function normalizeGlAccountList(data: GlAccountListPayload): FicoGlAccount[] {
    if (Array.isArray(data)) return data
    if (data && typeof data === 'object' && Array.isArray(data.items)) {
        return data.items
    }
    return []
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
    remove: (companyId: string, reason?: string) =>
        ErpAxiosBase.delete<{ companyId: string; deleted: boolean }>(
            `${API}/company-settings/${companyId}${queryString({ reason })}`,
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

export type FicoGlAccountListSummary = {
    totalAccounts: number
    activeAccounts: number
    inactiveAccounts: number
    draftAccounts: number
    blockedAccounts: number
    reconciliationAccounts: number
    withoutCompanyAssignment: number
}

export const ficoGlAccountService = {
    list: (query: {
        chartOfAccountsId?: string
        accountType?: string
        status?: string
        search?: string
        companyId?: string
    } = {}) =>
        ErpAxiosBase.get<GlAccountListPayload>(
            `${API}/gl-accounts${queryString(query)}`,
        ).then((r) => normalizeGlAccountList(r.data)),
    summary: (query: {
        chartOfAccountsId?: string
        accountType?: string
        status?: string
        search?: string
        companyId?: string
    } = {}) =>
        ErpAxiosBase.get<FicoGlAccountListSummary>(
            `${API}/gl-accounts/summary${queryString(query)}`,
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
    activate: (id: string) =>
        ErpAxiosBase.post<FicoGlAccount>(`${API}/gl-accounts/${id}/activate`).then(
            (r) => r.data,
        ),
    deactivate: (id: string, reason?: string) =>
        ErpAxiosBase.post<FicoGlAccount>(`${API}/gl-accounts/${id}/deactivate`, {
            reason: reason ?? undefined,
        }).then((r) => r.data),
    reactivate: (id: string, reason?: string) =>
        ErpAxiosBase.post<FicoGlAccount>(`${API}/gl-accounts/${id}/reactivate`, {
            reason: reason ?? undefined,
        }).then((r) => r.data),
    whereUsed: (id: string) =>
        ErpAxiosBase.get(`${API}/gl-accounts/${id}/where-used`).then((r) => r.data),
    deletionEligibility: (id: string) =>
        ErpAxiosBase.get<Pick<FicoGlAccountDependencies, 'canDelete' | 'reasons' | 'categories'>>(
            `${API}/gl-accounts/${id}/deletion-eligibility`,
        ).then((r) => r.data),
    changeHistory: (id: string, query: { page?: number; pageSize?: number } = {}) =>
        ErpAxiosBase.get(`${API}/gl-accounts/${id}/change-history${queryString(query)}`).then(
            (r) => r.data,
        ),
    lineItems: (
        id: string,
        query: { companyId?: string; page?: number; pageSize?: number } = {},
    ) =>
        ErpAxiosBase.get(`${API}/gl-accounts/${id}/line-items${queryString(query)}`).then(
            (r) => r.data,
        ),
    blockCompanyPosting: (id: string, companyId: string, reason?: string) =>
        ErpAxiosBase.post(
            `${API}/gl-accounts/${id}/companies/${companyId}/block-posting`,
            { reason: reason ?? undefined },
        ).then((r) => r.data),
    unblockCompanyPosting: (id: string, companyId: string, reason?: string) =>
        ErpAxiosBase.post(
            `${API}/gl-accounts/${id}/companies/${companyId}/unblock-posting`,
            { reason: reason ?? undefined },
        ).then((r) => r.data),
    validateImport: (data: {
        chartOfAccountsId: string
        rows: FicoGlImportRow[]
        dryRun?: boolean
    }) =>
        ErpAxiosBase.post<FicoGlImportReport>(
            `${API}/gl-accounts/import/validate`,
            data,
        ).then((r) => r.data),
    confirmImport: (data: {
        chartOfAccountsId: string
        rows: FicoGlImportRow[]
    }) =>
        ErpAxiosBase.post<FicoGlImportReport>(
            `${API}/gl-accounts/import/confirm`,
            data,
        ).then((r) => r.data),
    dependencies: (id: string) =>
        ErpAxiosBase.get<FicoGlAccountDependencies>(
            `${API}/gl-accounts/${id}/dependencies`,
        ).then((r) => r.data),
    companySettings: (id: string) =>
        ErpAxiosBase.get<FicoGlAccountCompanyContext>(
            `${API}/gl-accounts/${id}/company-settings`,
        ).then((r) => r.data),
    balances: (id: string, query: { companyId?: string } = {}) =>
        ErpAxiosBase.get<FicoGlAccountBalances>(
            `${API}/gl-accounts/${id}/balances${queryString(query)}`,
        ).then((r) => r.data),
    duplicate: (id: string, accountCode: string) =>
        ErpAxiosBase.post<FicoGlAccount>(
            `${API}/gl-accounts/${id}/duplicate`,
            { accountCode },
        ).then((r) => r.data),
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
        /** Business module filter: MM, SD, PP or OTHER. */
        module?: string
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
    retry: (id: string) =>
        ErpAxiosBase.post<{ id: string; status: string }>(
            `${API}/accounting-events/${id}/retry`,
        ).then((r) => r.data),
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
    summary: (query: { companyId: string; fiscalYear?: number }) =>
        ErpAxiosBase.get<FicoPeriodSummary>(
            `${API}/posting-periods/summary${queryString(query)}`,
        ).then((r) => r.data),
    get: (id: string) =>
        ErpAxiosBase.get<FicoPeriodDetail>(
            `${API}/posting-periods/${id}`,
        ).then((r) => r.data),
    update: (
        id: string,
        data: {
            remarks?: string | null
            closingDate?: string | null
            lockDate?: string | null
        },
    ) =>
        ErpAxiosBase.patch<FicoPeriod>(
            `${API}/posting-periods/${id}`,
            data,
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
        ErpAxiosBase.get<FicoPeriodHistoryEntry[]>(
            `${API}/posting-periods/${id}/history`,
        ).then((r) => r.data),
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

export const ficoNumberRangeService = {
    list: (query: {
        companyId: string
        search?: string
        status?: string
        documentCategory?: string
        numberingMethod?: string
        resetFrequency?: string
        page?: number
        pageSize?: number
    }) =>
        ErpAxiosBase.get<{
            items: FicoNumberRange[]
            total: number
            page: number
            pageSize: number
        }>(`${API}/number-ranges${queryString(query)}`).then((r) => r.data),
    get: (id: string) =>
        ErpAxiosBase.get<FicoNumberRange>(
            `${API}/number-ranges/${id}`,
        ).then((r) => r.data),
    create: (dto: {
        companyId: string
        rangeCode: string
        rangeName: string
        description?: string | null
        documentCategory: string
        assignmentType?: string | null
        numberingMethod?: string | null
        prefix?: string | null
        suffix?: string | null
        startNumber?: number | null
        endNumber?: number | null
        currentNumber?: number | null
        paddingLength?: number | null
        validFrom?: string | null
        validTo?: string | null
        fiscalYearId?: string | null
        resetFrequency?: string | null
        allowManualAssignment?: boolean | null
        allowExternalAssignment?: boolean | null
        allowGaps?: boolean | null
        status?: string | null
        remarks?: string | null
    }) =>
        ErpAxiosBase.post<FicoNumberRange>(
            `${API}/number-ranges`,
            dto,
        ).then((r) => r.data),
    update: (
        id: string,
        dto: {
            rangeName?: string | null
            description?: string | null
            documentCategory?: string | null
            assignmentType?: string | null
            numberingMethod?: string | null
            prefix?: string | null
            suffix?: string | null
            startNumber?: number | null
            endNumber?: number | null
            currentNumber?: number | null
            paddingLength?: number | null
            validFrom?: string | null
            validTo?: string | null
            fiscalYearId?: string | null
            resetFrequency?: string | null
            allowManualAssignment?: boolean | null
            allowExternalAssignment?: boolean | null
            allowGaps?: boolean | null
            status?: string | null
            remarks?: string | null
        },
    ) =>
        ErpAxiosBase.patch<FicoNumberRange>(
            `${API}/number-ranges/${id}`,
            dto,
        ).then((r) => r.data),
    remove: (id: string) =>
        ErpAxiosBase.delete<{ deleted: boolean }>(
            `${API}/number-ranges/${id}`,
        ).then((r) => r.data),
    activate: (companyId: string, rangeCode: string, reason?: string) =>
        ErpAxiosBase.post<FicoNumberRange>(
            `${API}/number-ranges/${rangeCode}/activate`,
            { companyId, reason },
        ).then((r) => r.data),
    deactivate: (companyId: string, rangeCode: string, reason?: string) =>
        ErpAxiosBase.post<FicoNumberRange>(
            `${API}/number-ranges/${rangeCode}/deactivate`,
            { companyId, reason },
        ).then((r) => r.data),
    nextNumber: (dto: {
        companyId: string
        rangeCode: string
        documentReference?: string | null
        allowExternal?: boolean | null
        externalNumber?: string | null
    }) =>
        ErpAxiosBase.post<{
            generatedNumber: string
            numericSequence: number
            assignmentMethod: string
            documentReference: string | null
            assignedAt: string
        }>(`${API}/number-ranges/${dto.rangeCode}/next`, dto).then(
            (r) => r.data,
        ),
    utilization: (id: string) =>
        ErpAxiosBase.get<{
            rangeId: string
            rangeCode: string
            totalAllocated: number
            currentSequence: number
            remaining: number
            utilizationPercent: number
            isExhausted: boolean
            startNumber: number
            endNumber: number
        }>(`${API}/number-ranges/${id}/utilization`).then((r) => r.data),
    history: (query: {
        numberRangeId: string
        companyId?: string
        assignmentMethod?: string
        fiscalYearId?: string | null
        dateFrom?: string
        dateTo?: string
        page?: number
        pageSize?: number
    }) =>
        ErpAxiosBase.get<{
            items: FicoNumberRangeLog[]
            total: number
            page: number
            pageSize: number
        }>(`${API}/number-ranges/${query.numberRangeId}/history${queryString(query)}`).then(
            (r) => r.data,
        ),
}

export const ficoTaxService = {
    list: (query: {
        companyId?: string
        search?: string
        status?: string
        taxCategory?: string
        taxType?: string
        taxJurisdiction?: string
        countryCode?: string
        calculationMethod?: string
        effectiveDate?: string
        transactionType?: string
        page?: number
        pageSize?: number
    } = {}) =>
        ErpAxiosBase.get<FicoTaxCodeListResponse>(
            `${API}/tax-codes${queryString(query)}`,
        ).then((r) => r.data),
    summary: (companyId: string) =>
        ErpAxiosBase.get<FicoTaxCodeSummary>(
            `${API}/tax-codes/summary${queryString({ companyId })}`,
        ).then((r) => r.data),
    get: (id: string) =>
        ErpAxiosBase.get<FicoTaxCode>(`${API}/tax-codes/${id}`).then(
            (r) => r.data,
        ),
    create: (data: {
        companyId?: string | null
        code: string
        name: string
        description?: string | null
        taxCategory: string
        taxType: string
        taxJurisdiction?: string | null
        countryCode?: string | null
        calculationMethod?: string | null
        rateUnit?: string | null
        roundingMethod?: string | null
        decimalPrecision?: number | null
        roundingLevel?: string | null
        calculationPriority?: number | null
        isSalesApplicable?: boolean | null
        isPurchaseApplicable?: boolean | null
        isServiceApplicable?: boolean | null
        isInventoryApplicable?: boolean | null
        isRecoverable?: boolean | null
        inputTaxGlAccountId?: string | null
        outputTaxGlAccountId?: string | null
        withholdingPayableGlAccountId?: string | null
        withholdingReceivableGlAccountId?: string | null
        nonRecoverableTaxGlAccountId?: string | null
        initialRate?: number | null
        initialRateUnit?: string | null
        effectiveFrom?: string | null
        effectiveTo?: string | null
        rateDescription?: string | null
        status?: string | null
        remarks?: string | null
    }) =>
        ErpAxiosBase.post<FicoTaxCode>(`${API}/tax-codes`, data).then(
            (r) => r.data,
        ),
    update: (
        id: string,
        data: {
            name?: string | null
            description?: string | null
            taxJurisdiction?: string | null
            countryCode?: string | null
            calculationMethod?: string | null
            rateUnit?: string | null
            roundingMethod?: string | null
            decimalPrecision?: number | null
            roundingLevel?: string | null
            calculationPriority?: number | null
            isSalesApplicable?: boolean | null
            isPurchaseApplicable?: boolean | null
            isServiceApplicable?: boolean | null
            isInventoryApplicable?: boolean | null
            isRecoverable?: boolean | null
            inputTaxGlAccountId?: string | null
            outputTaxGlAccountId?: string | null
            withholdingPayableGlAccountId?: string | null
            withholdingReceivableGlAccountId?: string | null
            nonRecoverableTaxGlAccountId?: string | null
            status?: string | null
            remarks?: string | null
        },
    ) =>
        ErpAxiosBase.patch<FicoTaxCode>(`${API}/tax-codes/${id}`, data).then(
            (r) => r.data,
        ),
    remove: (id: string) =>
        ErpAxiosBase.delete<{ deleted: boolean }>(
            `${API}/tax-codes/${id}`,
        ).then((r) => r.data),
    activate: (
        id: string,
        dto: { companyId: string; taxCodeId: string; reason?: string },
    ) =>
        ErpAxiosBase.post<FicoTaxCode>(
            `${API}/tax-codes/${id}/activate`,
            dto,
        ).then((r) => r.data),
    deactivate: (
        id: string,
        dto: { companyId: string; taxCodeId: string; reason?: string },
    ) =>
        ErpAxiosBase.post<FicoTaxCode>(
            `${API}/tax-codes/${id}/deactivate`,
            dto,
        ).then((r) => r.data),
    duplicate: (
        id: string,
        data: {
            companyId?: string
            code: string
            name?: string
            includeRates?: boolean
        },
    ) =>
        ErpAxiosBase.post<{ taxCode: FicoTaxCode; warnings: string[] }>(
            `${API}/tax-codes/${id}/duplicate`,
            data,
        ).then((r) => r.data),
    history: (
        taxCodeId: string,
        query: {
            search?: string
            action?: string
            actorId?: string
            dateFrom?: string
            dateTo?: string
            page?: number
            pageSize?: number
        } = {},
    ) =>
        ErpAxiosBase.get<FicoTaxCodeHistoryResponse>(
            `${API}/tax-codes/${taxCodeId}/history${queryString(query)}`,
        ).then((r) => r.data),
    listRates: (query: {
        taxCodeId: string
        companyId?: string
        status?: string
        effectiveFrom?: string
        effectiveTo?: string
        page?: number
        pageSize?: number
    }) =>
        ErpAxiosBase.get<FicoTaxRateListResponse>(
            `${API}/tax-codes/${query.taxCodeId}/rates${queryString(query)}`,
        ).then((r) => r.data),
    createRate: (taxCodeId: string, data: {
        taxCodeId: string
        companyId: string
        rate: number
        rateUnit?: string | null
        effectiveFrom: string
        effectiveTo?: string | null
        description?: string | null
    }) =>
        ErpAxiosBase.post<FicoTaxRate>(
            `${API}/tax-codes/${taxCodeId}/rates`,
            data,
        ).then((r) => r.data),
    updateRate: (
        taxCodeId: string,
        rateId: string,
        data: {
            rate?: number | null
            rateUnit?: string | null
            effectiveFrom?: string | null
            effectiveTo?: string | null
            description?: string | null
            status?: string | null
        },
    ) =>
        ErpAxiosBase.patch<FicoTaxRate>(
            `${API}/tax-codes/${taxCodeId}/rates/${rateId}`,
            data,
        ).then((r) => r.data),
    calculate: (data: {
        taxCodeId: string
        companyId: string
        transactionDate: string
        transactionType: string
        amount: number | string
        documentReference?: string | null
        dryRun?: boolean
    }) =>
        ErpAxiosBase.post<FicoTaxCalculationResult>(
            `${API}/tax-codes/calculate`,
            data,
        ).then((r) => r.data),
    utilization: (id: string) =>
        ErpAxiosBase.get<{
            taxCodeId: string
            taxCode: string
            taxCodeName: string
            rateCount: number
            auditLogCount: number
            isActive: boolean
            status: string
            canDelete: boolean
        }>(`${API}/tax-codes/${id}/utilization`).then((r) => r.data),
}

export const ficoDocumentTypeService = {
    list: (query: {
        companyId: string
        search?: string
        status?: string
        documentCategory?: string
        reversalAllowed?: string
        numberRangeId?: string
        sortBy?: string
        sortOrder?: 'asc' | 'desc'
        page?: number
        pageSize?: number
    }) =>
        ErpAxiosBase.get<FicoDocumentTypeListResponse>(
            `${API}/document-types${queryString(query)}`,
        ).then((r) => r.data),
    summary: (companyId: string) =>
        ErpAxiosBase.get<FicoDocumentTypeSummary>(
            `${API}/document-types/summary${queryString({ companyId })}`,
        ).then((r) => r.data),
    referenceData: () =>
        ErpAxiosBase.get<FicoDocumentTypeReferenceData>(
            `${API}/document-types/reference-data`,
        ).then((r) => r.data),
    get: (id: string) =>
        ErpAxiosBase.get<FicoDocumentType>(
            `${API}/document-types/${id}`,
        ).then((r) => r.data),
    create: (data: {
        companyId: string
        code: string
        name: string
        description?: string | null
        documentCategory: string
        numberRangeId?: string | null
        numberAssignment?: string
        externalNumberAllowed?: boolean
        numberRangeRequired?: boolean
        allowedAccountTypes: string[]
        debitPostingAllowed?: boolean
        creditPostingAllowed?: boolean
        negativePostingAllowed?: boolean
        reversalAllowed?: boolean
        reversalDocumentTypeId?: string | null
        originalDocumentReferenceRequired?: boolean
        reversalReasonRequired?: boolean
        referenceRequired?: boolean
        headerTextRequired?: boolean
        lineTextRequired?: boolean
        status?: string
        remarks?: string | null
    }) =>
        ErpAxiosBase.post<FicoDocumentType>(
            `${API}/document-types`,
            data,
        ).then((r) => r.data),
    update: (
        id: string,
        data: {
            name?: string
            description?: string | null
            documentCategory?: string
            numberRangeId?: string | null
            numberAssignment?: string
            externalNumberAllowed?: boolean
            numberRangeRequired?: boolean
            allowedAccountTypes?: string[]
            debitPostingAllowed?: boolean
            creditPostingAllowed?: boolean
            negativePostingAllowed?: boolean
            reversalAllowed?: boolean
            reversalDocumentTypeId?: string | null
            originalDocumentReferenceRequired?: boolean
            reversalReasonRequired?: boolean
            referenceRequired?: boolean
            headerTextRequired?: boolean
            lineTextRequired?: boolean
            status?: string
            remarks?: string | null
        },
    ) =>
        ErpAxiosBase.patch<FicoDocumentType>(
            `${API}/document-types/${id}`,
            data,
        ).then((r) => r.data),
    activate: (id: string, dto: { reason?: string } = {}) =>
        ErpAxiosBase.post<FicoDocumentType>(
            `${API}/document-types/${id}/activate`,
            dto,
        ).then((r) => r.data),
    deactivate: (id: string, dto: { reason?: string } = {}) =>
        ErpAxiosBase.post<FicoDocumentType>(
            `${API}/document-types/${id}/deactivate`,
            dto,
        ).then((r) => r.data),
    remove: (id: string) =>
        ErpAxiosBase.delete<{ deleted: boolean }>(
            `${API}/document-types/${id}`,
        ).then((r) => r.data),
    history: (
        id: string,
        query: { page?: number; pageSize?: number } = {},
    ) =>
        ErpAxiosBase.get<FicoDocumentTypeHistoryResponse>(
            `${API}/document-types/${id}/history${queryString(query)}`,
        ).then((r) => r.data),
}

export const ficoJournalService = {
    list: (query: FicoJournalListQuery & { companyId: string }) =>
        ErpAxiosBase.get<FicoJournalListResponse>(
            `${API}/journal-entries${queryString(query)}`,
        ).then((r) => r.data),
    summary: (
        companyId: string,
        query: { dateFrom?: string; dateTo?: string } = {},
    ) =>
        ErpAxiosBase.get<FicoJournalWorkbenchSummary>(
            `${API}/journal-entries/summary${queryString({ companyId, ...query })}`,
        ).then((r) => r.data),
    get: (id: string, companyId: string) =>
        ErpAxiosBase.get<FicoJournalEntryDetail>(
            `${API}/journal-entries/${id}${queryString({ companyId })}`,
        ).then((r) => r.data),
    create: (body: {
        companyId: string
        postingDate: string
        description?: string
        currencyCode?: string
        supplierId?: string | null
        lines: Array<{
            glAccountId: string
            debitAmount?: number
            creditAmount?: number
            description?: string
        }>
    }) =>
        ErpAxiosBase.post<FicoJournalEntryDetail>(
            `${API}/journal-entries`,
            body,
        ).then((r) => r.data),
    submit: (id: string, body: { companyId: string; reason?: string }) =>
        ErpAxiosBase.post(`${API}/journal-entries/${id}/submit`, body).then(
            (r) => r.data,
        ),
    approve: (id: string, body: { companyId: string; reason?: string }) =>
        ErpAxiosBase.post(`${API}/journal-entries/${id}/approve`, body).then(
            (r) => r.data,
        ),
    reject: (id: string, body: { companyId: string; reason: string }) =>
        ErpAxiosBase.post(`${API}/journal-entries/${id}/reject`, body).then(
            (r) => r.data,
        ),
    resubmit: (id: string) =>
        ErpAxiosBase.post(`${API}/journal-entries/${id}/resubmit`).then(
            (r) => r.data,
        ),
    post: (id: string) =>
        ErpAxiosBase.post(`${API}/journal-entries/${id}/post`).then(
            (r) => r.data,
        ),
    reverse: (
        id: string,
        body: { companyId: string; reason: string; postingDate?: string },
    ) =>
        ErpAxiosBase.post(`${API}/journal-entries/${id}/reverse`, body).then(
            (r) => r.data,
        ),
    update: (id: string, body: UpdateJournalEntryBody) =>
        ErpAxiosBase.patch<FicoJournalEntryDetail>(
            `${API}/journal-entries/${id}`,
            body,
        ).then((r) => r.data),
    cancel: (id: string, body: { companyId: string; reason?: string }) =>
        ErpAxiosBase.post(`${API}/journal-entries/${id}/cancel`, body).then(
            (r) => r.data,
        ),
    withdraw: (id: string, body: { companyId: string }) =>
        ErpAxiosBase.post(`${API}/journal-entries/${id}/withdraw`, body).then(
            (r) => r.data,
        ),
    approvalHistory: (id: string, companyId: string) =>
        ErpAxiosBase.get<FicoAuditEntry[]>(
            `${API}/journal-entries/${id}/approval-history${queryString({ companyId })}`,
        ).then((r) => r.data),
    simulate: (body: {
        companyId: string
        postingDate: string
        description?: string
        currencyCode?: string
        lines: Array<{
            glAccountId: string
            debitAmount?: number
            creditAmount?: number
            description?: string
        }>
    }) =>
        ErpAxiosBase.post<FicoJournalSimulateResult>(
            `${API}/journal-entries/simulate`,
            body,
        ).then((r) => r.data),
    validatePosting: (body: Record<string, unknown>) =>
        ErpAxiosBase.post(`${API}/posting-validation`, body).then(
            (r) => r.data,
        ),
}

export const ficoAccountsReceivableService = {
    listOpenItems: (query: FicoArOpenItemQuery) =>
        ErpAxiosBase.get<FicoArOpenItem[]>(
            `${API}/accounts-receivable/open-items${queryString(query)}`,
        ).then((r) => r.data),
    getAging: (companyId: string, asOfDate?: string) =>
        ErpAxiosBase.get<FicoArAgingResponse>(
            `${API}/accounts-receivable/aging${queryString({ companyId, asOfDate })}`,
        ).then((r) => r.data),
    listDocuments: (query: {
        companyId: string
        customerId?: string
        status?: string
        search?: string
    }) =>
        ErpAxiosBase.get<FicoArDocumentDetail[]>(
            `${API}/accounts-receivable/documents${queryString(query)}`,
        ).then((r) => r.data),
    getDocument: (id: string, companyId: string) =>
        ErpAxiosBase.get<FicoArDocumentDetail>(
            `${API}/accounts-receivable/documents/${id}${queryString({ companyId })}`,
        ).then((r) => r.data),
}

export const ficoReconciliationService = {
    scan: (query: {
        companyId: string
        dateFrom?: string
        dateTo?: string
        syncCases?: boolean
    }) =>
        ErpAxiosBase.get<import('../types').FicoReconciliationScan>(
            `${API}/reconciliation/scan${queryString(query)}`,
        ).then((r) => r.data),
    updateCase: (
        id: string,
        body: {
            status?: string
            investigationNotes?: string
            assignedTo?: string
            resolutionCode?: string
            resolutionNotes?: string
        },
    ) =>
        ErpAxiosBase.patch<import('../types').FicoReconciliationCase>(
            `${API}/reconciliation/cases/${id}`,
            body,
        ).then((r) => r.data),
}

export const ficoOpeningBalanceService = {
    template: () =>
        ErpAxiosBase.get<{
            content: string
            fileName: string
            contentType: string
        }>(`${API}/opening-balances/template`).then((r) => r.data),
    list: (companyId: string) =>
        ErpAxiosBase.get<import('../types').FicoOpeningBalanceBatch[]>(
            `${API}/opening-balances${queryString({ companyId })}`,
        ).then((r) => r.data),
    get: (id: string) =>
        ErpAxiosBase.get(`${API}/opening-balances/${id}`).then((r) => r.data),
    create: (body: Record<string, unknown>) =>
        ErpAxiosBase.post<import('../types').FicoOpeningBalanceBatch>(
            `${API}/opening-balances`,
            body,
        ).then((r) => r.data),
    import: (
        id: string,
        body: {
            rows: Array<{
                accountCode: string
                debitAmount?: number
                creditAmount?: number
                accountName?: string
            }>
        },
    ) =>
        ErpAxiosBase.post<{
            valid: boolean
            errors: string[]
            totalDebit?: string
            totalCredit?: string
        }>(`${API}/opening-balances/${id}/import`, body).then((r) => r.data),
    submit: (id: string) =>
        ErpAxiosBase.post(`${API}/opening-balances/${id}/submit`).then(
            (r) => r.data,
        ),
    approve: (id: string) =>
        ErpAxiosBase.post(`${API}/opening-balances/${id}/approve`).then(
            (r) => r.data,
        ),
    post: (id: string) =>
        ErpAxiosBase.post(`${API}/opening-balances/${id}/post`).then(
            (r) => r.data,
        ),
    lock: (id: string) =>
        ErpAxiosBase.post(`${API}/opening-balances/${id}/lock`).then(
            (r) => r.data,
        ),
}

export const ficoPeriodClosingService = {
    readiness: (query: { companyId: string; fiscalPeriodId: string }) =>
        ErpAxiosBase.get<import('../types').FicoPeriodClosingReadiness>(
            `${API}/period-closing/readiness${queryString(query)}`,
        ).then((r) => r.data),
}

export const ficoYearEndClosingService = {
    get: (query: { companyId: string; fiscalYear: number }) =>
        ErpAxiosBase.get<import('../types').FicoYearEndOverview>(
            `${API}/closing/year-end${queryString(query)}`,
        ).then((r) => r.data),
    validate: (body: { companyId: string; fiscalYear: number }) =>
        ErpAxiosBase.post(`${API}/closing/year-end/validate`, body).then(
            (r) => r.data,
        ),
    approve: (body: { companyId: string; fiscalYear: number }) =>
        ErpAxiosBase.post(`${API}/closing/year-end/approve`, body).then(
            (r) => r.data,
        ),
    execute: (body: { companyId: string; fiscalYear: number }) =>
        ErpAxiosBase.post(`${API}/closing/year-end/execute`, body).then(
            (r) => r.data,
        ),
}

export const ficoTrialBalanceService = {
    get: (query: {
        companyId: string
        dateFrom?: string
        dateTo?: string
        accountType?: string
        includeZeroBalances?: boolean
        page?: number
        pageSize?: number
    }) =>
        ErpAxiosBase.get<FicoTrialBalanceResponse>(
            `${API}/reports/trial-balance${queryString(query)}`,
        ).then((r) => r.data),
}

export const ficoGeneralLedgerService = {
    lineItems: (
        glAccountId: string,
        query: {
            companyId?: string
            dateFrom?: string
            dateTo?: string
            page?: number
            pageSize?: number
        } = {},
    ) =>
        ErpAxiosBase.get<FicoGlLedgerLineItemsResponse>(
            `${API}/gl-accounts/${glAccountId}/line-items${queryString(query)}`,
        ).then((r) => r.data),
    accountBalances: (
        glAccountId: string,
        query: { companyId?: string } = {},
    ) =>
        ErpAxiosBase.get<FicoGlAccountBalanceSummary>(
            `${API}/gl-accounts/${glAccountId}/balances${queryString(query)}`,
        ).then((r) => r.data),
}

function flattenApiMessage(
    message: string | string[] | Record<string, unknown> | undefined,
): string | null {
    if (!message) return null
    if (Array.isArray(message)) return message.join(', ')
    if (typeof message === 'string' && message.trim()) return message
    if (typeof message === 'object' && message !== null) {
        const nested = message.message
        if (typeof nested === 'string' && nested.trim()) return nested
    }
    return null
}

export function ficoErrorMessage(error: unknown, fallback: string) {
    const response = (
        error as {
            response?: {
                data?: {
                    message?: string | string[] | Record<string, unknown>
                    error?: string
                }
            }
        }
    )?.response?.data
    const fromMessage = flattenApiMessage(response?.message)
    if (fromMessage) return fromMessage
    if (typeof response?.error === 'string' && response.error.trim()) {
        return response.error
    }
    return fallback
}
