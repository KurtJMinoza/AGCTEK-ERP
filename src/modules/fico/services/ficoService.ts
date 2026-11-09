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

export const ficoJournalService = {
    list: (query: {
        companyId: string
        status?: string
        dateFrom?: string
        dateTo?: string
        page?: number
        pageSize?: number
    }) =>
        ErpAxiosBase.get<{
            items: unknown[]
            total: number
            page: number
            pageSize: number
            totalPages: number
        }>(`${API}/journal-entries${queryString(query)}`).then((r) =>
            r.data,
        ),
    get: (id: string, companyId: string) =>
        ErpAxiosBase.get<{
            id: string
            documentNumber: string | null
            postingDate: string
            fiscalYear: number | null
            fiscalPeriodId: string | null
            totalAmount: string
            currencyCode: string
            status: string
            description: string | null
            documentType: string
            postedAt: string | null
            postedBy: string | null
            createdAt: string
            fiscalPeriod: {
                id: string
                fiscalYear: number
                periodNumber: number
                name: string
                status: string
            } | null
            lines: unknown[]
        }>(`${API}/journal-entries/${id}?companyId=${companyId}`).then(
            (r) => r.data,
        ),
    create: (
        dto: {
            companyId: string
            postingDate: string
            description?: string
            currencyCode?: string
            lines: {
                glAccountId: string
                debitAmount?: number
                creditAmount?: number
                description?: string
            }[]
        },
        signal?: AbortSignal,
    ) =>
        ErpAxiosBase.post<{
            id: string
            documentNumber: string
            postingDate: string
            fiscalYear: number | null
            fiscalPeriodId: string | null
            totalAmount: string
            currencyCode: string
            status: string
            description: string | null
            postedAt: string | null
            lines: unknown[]
        }>(`${API}/journal-entries`, dto, { signal }).then((r) => r.data),
    reverse: (
        id: string,
        companyId: string,
        reason: string,
    ) =>
        ErpAxiosBase.post<{
            originalId: string
            originalStatus: string
            reversalId: string
            reversalDocumentNumber: string | null
            reversalPostedAt: string | null
        }>(`${API}/journal-entries/${id}/reverse`, {
            companyId,
            journalEntryId: id,
            reason,
        }).then((r) => r.data),
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
