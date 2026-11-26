import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import { toApiError } from '@/modules/sd/services/apiError'

const BASE = '/fico/accounts-receivable'

export type ArOpenItemRow = {
    id: string
    companyId: string
    customerId: string
    openAmount: string | number
    currencyCode: string
    dueDate: string | null
    status: string
    itemType: string
    direction: string
    customer?: {
        id: string
        customerNumber: string
        companyName: string
        contactName: string
    }
    document?: {
        id: string
        referenceNumber: string | null
        journalEntryId: string | null
    }
}

export type ArDashboard = {
    baseCurrency: string
    totalOutstanding: string
    totalOverdue: string
    collectionsInPeriod: string
    creditLimit: string
    creditExposure: string
    postingExceptions: number
}

export const accountsReceivableService = {
    async fetchDashboard(companyId: string, fromDate?: string, toDate?: string) {
        try {
            const params = new URLSearchParams({ companyId })
            if (fromDate) params.set('fromDate', fromDate)
            if (toDate) params.set('toDate', toDate)
            const { data } = await ErpAxiosBase.get<ArDashboard>(
                `${BASE}/dashboard?${params}`,
            )
            return data
        } catch (error) {
            throw toApiError(error, 'Unable to load AR dashboard')
        }
    },

    async fetchOpenItems(companyId: string, overdueOnly?: boolean) {
        try {
            const params = new URLSearchParams({ companyId })
            if (overdueOnly) params.set('overdueOnly', 'true')
            const { data } = await ErpAxiosBase.get<ArOpenItemRow[]>(
                `${BASE}/open-items?${params}`,
            )
            return data
        } catch (error) {
            throw toApiError(error, 'Unable to load AR open items')
        }
    },

    async fetchReconciliation(companyId: string) {
        try {
            const { data } = await ErpAxiosBase.get(`${BASE}/reconciliation?companyId=${companyId}`)
            return data
        } catch (error) {
            throw toApiError(error, 'Unable to load AR reconciliation')
        }
    },
}