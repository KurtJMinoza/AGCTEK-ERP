import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import { toApiError } from './apiError'

export type SalesAnalyticsRange =
    | 'today'
    | '7days'
    | 'month'
    | 'ytd'
    | 'custom'
/** EXTERNAL = manually recorded external platform sales (Shopee, Lazada, …). */
export type SalesAnalyticsChannel = 'ALL' | 'ECOMMERCE' | 'POS' | 'EXTERNAL'

const SALES_CHANNEL_LABEL: Record<string, string> = {
    ECOMMERCE: 'E-commerce',
    POS: 'POS',
    STANDARD: 'Standard',
    EXTERNAL: 'External platforms',
}

/** Display name of a sales channel; external platform rows already carry the platform name. */
export const salesChannelLabel = (channel: string) =>
    SALES_CHANNEL_LABEL[channel] ?? channel

export type SalesAnalyticsTotals = {
    totalRevenue: number
    totalOrders: number
    averageOrderValue: number
    totalUnits: number
    /** Distinct buyers; walk-in sales without a name count as one. */
    uniqueCustomers: number
}

export type SalesLineReportRow = {
    productImageUrl: string | null
    /** POS | ECOMMERCE | STANDARD, or the external platform name (Shopee, Lazada, …). */
    salesChannel: string
    customerName: string
    location: string
    barcode: string
    accountTitle: string
    particular: string
    quantity: number
    uom: string
    unitCost: number
    totalCost: number
    srp: number
    sales: number
    discount: number
    subtotal: number
    totalSales: number
    salesType: string
    invoiceType: string
    invoiceNumber: string
    orderNumber: string
    createdAt: string
}

export type SalesAnalyticsBuyer = {
    customerKey: string
    customerName: string
    customerNumber: string | null
    revenue: number
    units: number
    orders: number
}

export type SalesAnalytics = SalesAnalyticsTotals & {
    range: SalesAnalyticsRange
    channel: SalesAnalyticsChannel
    from: string
    to: string
    currency: string
    /** Trend granularity: day labels are YYYY-MM-DD, month labels YYYY-MM. */
    bucket: 'day' | 'month'
    /** Same-length window immediately before `from`. */
    previous: SalesAnalyticsTotals & { from: string; to: string }
    channelSplit: Array<{ channel: string; revenue: number; orders: number }>
    trend: Array<{ bucket: string; revenue: number; orders: number }>
    topProducts: Array<{
        sku: string | null
        productName: string
        revenue: number
        units: number
        orders: number
        customers: number
        /** Largest buyers of the product in the period. */
        buyers: SalesAnalyticsBuyer[]
    }>
    topCustomers: Array<{
        customerKey: string
        /** Customer Master id; null for a name typed at the sale. */
        customerId: string | null
        customerName: string
        customerNumber: string | null
        revenue: number
        orders: number
        units: number
        lastPurchaseAt: string
    }>
    recentOrders: Array<{
        id: string
        orderNumber: string
        createdAt: string
        channel: string
        customerName: string
        customerNumber: string | null
        revenue: number
        units: number
        products: string[]
    }>
    /** One row per order line — mirrors the legacy sales register layout. */
    lineReport: SalesLineReportRow[]
}

export async function fetchSalesAnalytics(params: {
    range: SalesAnalyticsRange
    channel: SalesAnalyticsChannel
    from?: string
    to?: string
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
