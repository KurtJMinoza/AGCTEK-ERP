import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import { toApiError } from './apiError'

export type CollectionBucketTotals = {
    cash: number
    gcash: number
    bankTransfer: number
    cheque: number
    others: number
    total: number
}

export type MonthlyCollectionRow = CollectionBucketTotals & {
    collectionDate: string
    arNumber: string
    customerName: string
    particular: string
    orderNumber: string
}

export type MonthlyCollectionMonth = {
    month: number
    monthLabel: string
    summary: CollectionBucketTotals
    rows: MonthlyCollectionRow[]
}

export type MonthlyCollectionReport = {
    year: number
    companyName: string
    companyAddress: string
    reportTitle: string
    yearSummary: Array<{
        month: number
        monthLabel: string
        summary: CollectionBucketTotals
    }>
    months: MonthlyCollectionMonth[]
}

export async function fetchMonthlyCollection(
    year: number,
    month?: number,
): Promise<MonthlyCollectionReport> {
    try {
        const { data } = await ErpAxiosBase.get<MonthlyCollectionReport>(
            '/sd/analytics/monthly-collection',
            { params: { year, ...(month ? { month } : {}) } },
        )
        return data
    } catch (error) {
        throw toApiError(error, 'Unable to load the monthly collection report')
    }
}