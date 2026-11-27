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
    overdueDays?: number
    daysUntilDue?: number
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

export type ArAgingBuckets = {
    current: string
    days1To30: string
    days31To60: string
    days61To90: string
    over90: string
    customerCredits: string
}

export type ArAgingReport = {
    asOfDate: string
    totalReceivable: string
    buckets: ArAgingBuckets
    items: ArOpenItemRow[]
}

export type ArDashboard = {
    baseCurrency: string
    totalOutstanding: string
    totalOverdue: string
    collectionsInPeriod: string
    creditLimit: string
    creditExposure: string
    availableCredit?: string
    customerAdvanceBalance?: string
    unappliedReceiptBalance?: string
    postingExceptions: number
    agingBuckets?: ArAgingBuckets
    totalReceivable?: string
}

export const accountsReceivableService = {
    async fetchDashboard(
        companyId: string,
        fromDate?: string,
        toDate?: string,
        asOfDate?: string,
    ) {
        try {
            const params = new URLSearchParams({ companyId })
            if (fromDate) params.set('fromDate', fromDate)
            if (toDate) params.set('toDate', toDate)
            if (asOfDate) params.set('asOfDate', asOfDate)
            const { data } = await ErpAxiosBase.get<ArDashboard>(
                `${BASE}/dashboard?${params}`,
            )
            return data
        } catch (error) {
            throw toApiError(error, 'Unable to load AR dashboard')
        }
    },

    async fetchOpenItems(companyId: string, overdueOnly?: boolean, asOfDate?: string) {
        try {
            const params = new URLSearchParams({ companyId })
            if (overdueOnly) params.set('overdueOnly', 'true')
            if (asOfDate) params.set('asOfDate', asOfDate)
            const { data } = await ErpAxiosBase.get<ArOpenItemRow[]>(
                `${BASE}/open-items?${params}`,
            )
            return data
        } catch (error) {
            throw toApiError(error, 'Unable to load AR open items')
        }
    },

    async fetchAging(companyId: string, asOfDate?: string) {
        try {
            const params = new URLSearchParams({ companyId })
            if (asOfDate) params.set('asOfDate', asOfDate)
            const { data } = await ErpAxiosBase.get<ArAgingReport>(
                `${BASE}/aging?${params}`,
            )
            return data
        } catch (error) {
            throw toApiError(error, 'Unable to load AR aging')
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