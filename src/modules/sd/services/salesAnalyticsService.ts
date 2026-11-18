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
    /** Unpaid remainder (down payment / partial) across the period's orders. */
    totalBalanceDue: number
    /** Orders that still carry a balance due. */
    ordersWithBalance: number
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
    /** Paid | Partially Paid | Unpaid — never blank for report rows. */
    paidStatus: string
    /** Unpaid remainder of the order, apportioned to this line (0 when settled). */
    balanceDue: number
    /** `SPLIT` when settled with more than one method; otherwise the method code ('' if unknown). */
    paymentMethod: string
    /** Tenders captured for the sale, in the order they were taken. */
    payments: SalesLinePayment[]
    /** Payment remarks from Take Payment (POS) or platform sale notes. */
    remarks: string
}

export type SalesLinePayment = {
    method: string
    amount: number
    reference: string
    status: string
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
    SPLIT: 'Split payment',
    CASH: 'Cash',
    GCASH: 'GCash',
    BANK_TRANSFER: 'Bank transfer',
    CARD: 'Card',
    CHEQUE: 'Cheque',
    SALARY_LOAN: 'Salary deduction',
    COD: 'Cash on delivery',
}

/** Display name of a payment method code; unknown codes are title-cased. */
export const salesPaymentMethodLabel = (code: string) => {
    const key = (code ?? '').trim().toUpperCase()
    if (!key) return '—'
    return (
        PAYMENT_METHOD_LABELS[key] ??
        key
            .toLowerCase()
            .replace(/_/g, ' ')
            .replace(/^\w/, (c) => c.toUpperCase())
    )
}

export type SalesAnalyticsReceivable = {
    customerKey: string
    customerId: string | null
    customerName: string
    customerNumber: string | null
    /** Total of the customer's orders that still carry a balance. */
    revenue: number
    balanceDue: number
    openOrders: number
    oldestOpenAt: string
    latestOpenAt: string
    /** Newest first. */
    orderNumbers: string[]
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
        balanceDue: number
        ordersWithBalance: number
    }>
    /** Customers who still owe money on orders of the period, largest first. */
    customerReceivables: SalesAnalyticsReceivable[]
    recentOrders: Array<{
        id: string
        orderNumber: string
        createdAt: string
        channel: string
        customerName: string
        customerNumber: string | null
        revenue: number
        balanceDue: number
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
