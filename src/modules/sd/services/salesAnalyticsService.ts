import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import { toApiError } from './apiError'

export type SalesAnalyticsRange = 'today' | '7days' | 'month' | 'ytd'
export type SalesAnalyticsChannel = 'ALL' | 'ECOMMERCE' | 'POS'

export type SalesAnalytics = {
    range: SalesAnalyticsRange
    channel: SalesAnalyticsChannel
    from: string
    to: string
    currency: string
    /** Trend granularity: day labels are YYYY-MM-DD, month labels YYYY-MM. */
    bucket: 'day' | 'month'
    totalRevenue: number
    totalOrders: number
    averageOrderValue: number
    channelSplit: Array<{ channel: string; revenue: number; orders: number }>
    trend: Array<{ bucket: string; revenue: number; orders: number }>
    topProducts: Array<{
        sku: string | null
        productName: string
        revenue: number
        units: number
    }>
}

export async function fetchSalesAnalytics(params: {
    range: SalesAnalyticsRange
    channel: SalesAnalyticsChannel
}): Promise<SalesAnalytics> {
    try {
        const { data } = await ErpAxiosBase.get<SalesAnalytics>(
            '/sd/analytics/sales',
            {
                params,
            },
        )
        return data
    } catch (error) {
        throw toApiError(error, 'Unable to load sales analytics')
    }
}
