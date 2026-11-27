import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import { toApiError } from '@/modules/sd/services/apiError'

const BASE = '/fico/treasury'

export type TreasuryAccount = {
    id: string
    accountCode: string
    accountName: string
    accountKind: string
    currencyCode: string
    status: string
    postingBlocked: boolean
    paymentMethodCode: string | null
    providerCode: string | null
    bankName: string | null
    accountNumberMask: string | null
    glAccount: { id: string; accountCode: string; accountName: string }
    branch?: { id: string; code: string; name: string } | null
}

export type TreasurySettlement = {
    id: string
    settlementNumber: string
    settlementType: string
    status: string
    grossAmount: string
    feeAmount: string
    netAmount: string
    currencyCode: string
    postingDate: string
    paymentMethodCode: string | null
    reference: string | null
    fromTreasuryAccount?: { accountCode: string; accountName: string } | null
    toTreasuryAccount?: { accountCode: string; accountName: string } | null
    journalEntry?: { documentNumber: string | null } | null
}

export type TaxReconciliationResponse = {
    companyId: string
    summary: {
        outputTaxFromSnapshots: string
        inputTaxFromSnapshots: string
        withholdingPayableFromSnapshots: string
        withholdingReceivableFromSnapshots: string
    }
    rows: Array<{
        taxCode: string
        taxName: string
        taxType: string
        snapshotTaxAmount: string
        glBalance: string
        variance: string
        reconciled: boolean
    }>
}

export const treasuryService = {
    async listAccounts(companyId: string) {
        try {
            const { data } = await ErpAxiosBase.get<TreasuryAccount[]>(
                `${BASE}/accounts?companyId=${encodeURIComponent(companyId)}`,
            )
            return data
        } catch (e) {
            throw toApiError(e)
        }
    },

    async saveAccount(body: Record<string, unknown>, accountId?: string) {
        try {
            const url = accountId ? `${BASE}/accounts/${accountId}` : `${BASE}/accounts`
            const method = accountId ? 'put' : 'post'
            const { data } = await ErpAxiosBase[method]<TreasuryAccount>(url, body)
            return data
        } catch (e) {
            throw toApiError(e)
        }
    },

    async listSettlements(companyId: string) {
        try {
            const { data } = await ErpAxiosBase.get<TreasurySettlement[]>(
                `${BASE}/settlements?companyId=${encodeURIComponent(companyId)}`,
            )
            return data
        } catch (e) {
            throw toApiError(e)
        }
    },

    async createSettlement(body: Record<string, unknown>) {
        try {
            const { data } = await ErpAxiosBase.post(`${BASE}/settlements`, body)
            return data
        } catch (e) {
            throw toApiError(e)
        }
    },

    async fetchTaxReconciliation(params: {
        companyId: string
        fromDate?: string
        toDate?: string
    }) {
        try {
            const search = new URLSearchParams()
            for (const [key, value] of Object.entries(params)) {
                if (value) search.set(key, value)
            }
            const { data } = await ErpAxiosBase.get<TaxReconciliationResponse>(
                `${BASE}/tax-reconciliation?${search.toString()}`,
            )
            return data
        } catch (e) {
            throw toApiError(e)
        }
    },
}