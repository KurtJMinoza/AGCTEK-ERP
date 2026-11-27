import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import { toApiError } from '@/modules/sd/services/apiError'
import type {
    ApAgingReport,
    ApClearingRow,
    ApDashboard,
    ApDocumentRow,
    ApOpenItemRow,
    ApPaymentProposal,
    ApPaymentRow,
    ApReconciliationReport,
    ApReferenceData,
    ApSupplierStatement,
    CreateApAdjustmentInput,
    CreateApClearingInput,
    CreateApDirectInvoiceInput,
    CreateApPaymentInput,
} from '../types/accountsPayable'

const BASE = '/fico/accounts-payable'

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

export const accountsPayableService = {
    async fetchDashboard(params: {
        companyId: string
        asOfDate?: string
        fromDate?: string
        toDate?: string
    }) {
        try {
            const { data } = await ErpAxiosBase.get<ApDashboard>(
                `${BASE}/dashboard${queryString(params)}`,
            )
            return data
        } catch (error) {
            throw toApiError(error, 'Unable to load AP dashboard')
        }
    },

    async fetchAging(companyId: string, asOfDate?: string) {
        try {
            const { data } = await ErpAxiosBase.get<ApAgingReport>(
                `${BASE}/aging${queryString({ companyId, asOfDate })}`,
            )
            return data
        } catch (error) {
            throw toApiError(error, 'Unable to load AP aging')
        }
    },

    async fetchReconciliation(companyId: string) {
        try {
            const { data } = await ErpAxiosBase.get<ApReconciliationReport>(
                `${BASE}/reconciliation${queryString({ companyId })}`,
            )
            return data
        } catch (error) {
            throw toApiError(error, 'Unable to load AP reconciliation')
        }
    },

    async fetchPaymentProposals(companyId: string, asOfDate?: string) {
        try {
            const { data } = await ErpAxiosBase.get<ApPaymentProposal[]>(
                `${BASE}/payment-proposals${queryString({ companyId, asOfDate })}`,
            )
            return data
        } catch (error) {
            throw toApiError(error, 'Unable to load payment proposals')
        }
    },

    async fetchSupplierStatement(params: {
        companyId: string
        supplierId: string
        fromDate?: string
        toDate?: string
    }) {
        try {
            const { data } = await ErpAxiosBase.get<ApSupplierStatement>(
                `${BASE}/supplier-statement${queryString(params)}`,
            )
            return data
        } catch (error) {
            throw toApiError(error, 'Unable to load supplier statement')
        }
    },

    async fetchReferenceData(companyId: string, supplierId?: string) {
        try {
            const { data } = await ErpAxiosBase.get<ApReferenceData>(
                `${BASE}/reference-data${queryString({ companyId, supplierId })}`,
            )
            return data
        } catch (error) {
            throw toApiError(error, 'Unable to load AP reference data')
        }
    },

    async fetchOpenItems(params: {
        companyId: string
        supplierId?: string
        status?: string
        overdueOnly?: boolean
        asOfDate?: string
    }) {
        try {
            const { data } = await ErpAxiosBase.get<ApOpenItemRow[]>(
                `${BASE}/open-items${queryString({
                    ...params,
                    overdueOnly: params.overdueOnly ? true : undefined,
                })}`,
            )
            return data
        } catch (error) {
            throw toApiError(error, 'Unable to load AP open items')
        }
    },

    async fetchDocuments(params: {
        companyId: string
        supplierId?: string
        documentType?: string
        status?: string
        search?: string
    }) {
        try {
            const { data } = await ErpAxiosBase.get<ApDocumentRow[]>(
                `${BASE}/documents${queryString(params)}`,
            )
            return data
        } catch (error) {
            throw toApiError(error, 'Unable to load AP documents')
        }
    },

    async fetchDocument(documentId: string, companyId: string) {
        try {
            const { data } = await ErpAxiosBase.get<ApDocumentRow & Record<string, unknown>>(
                `${BASE}/documents/${documentId}${queryString({ companyId })}`,
            )
            return data
        } catch (error) {
            throw toApiError(error, 'Unable to load AP document')
        }
    },

    async fetchPayments(params: {
        companyId: string
        supplierId?: string
        status?: string
    }) {
        try {
            const { data } = await ErpAxiosBase.get<ApPaymentRow[]>(
                `${BASE}/payments${queryString(params)}`,
            )
            return data
        } catch (error) {
            throw toApiError(error, 'Unable to load AP payments')
        }
    },

    async fetchClearings(params: {
        companyId: string
        supplierId?: string
        status?: string
    }) {
        try {
            const { data } = await ErpAxiosBase.get<ApClearingRow[]>(
                `${BASE}/clearings${queryString(params)}`,
            )
            return data
        } catch (error) {
            throw toApiError(error, 'Unable to load AP clearings')
        }
    },

    async postPayment(input: CreateApPaymentInput) {
        try {
            const { data } = await ErpAxiosBase.post<{
                id: string
                paymentNumber?: string
                duplicate?: boolean
            }>(`${BASE}/payments`, input)
            return data
        } catch (error) {
            throw toApiError(error, 'Unable to post supplier payment')
        }
    },

    async postAdjustment(input: CreateApAdjustmentInput) {
        try {
            const { data } = await ErpAxiosBase.post<{
                id: string
                duplicate?: boolean
                created?: boolean
            }>(`${BASE}/documents`, input)
            return data
        } catch (error) {
            throw toApiError(error, 'Unable to post AP adjustment')
        }
    },

    async postDirectSupplierInvoice(input: CreateApDirectInvoiceInput) {
        try {
            const { data } = await ErpAxiosBase.post<{
                id: string
                journalEntryId?: string
                duplicate?: boolean
                created?: boolean
            }>(`${BASE}/supplier-invoices`, input)
            return data
        } catch (error) {
            throw toApiError(error, 'Unable to post supplier invoice')
        }
    },

    async postClearing(input: CreateApClearingInput) {
        try {
            const { data } = await ErpAxiosBase.post<{
                id: string
                clearingNumber?: string
                duplicate?: boolean
            }>(`${BASE}/clearings`, input)
            return data
        } catch (error) {
            throw toApiError(error, 'Unable to post AP clearing')
        }
    },
}