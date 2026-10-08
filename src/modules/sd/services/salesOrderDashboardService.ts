import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import { toApiError as toError } from './apiError'
import type { PricedLine } from './pricingEngine'
import type { SalesOrderShippingDetails } from '@/types/storefront/retail'
import {
    RetailSessionExpiredError,
    bearer,
    isSessionRejected,
} from '@/services/storefront/retailClientService'

export type SalesOrderChannel = 'POS' | 'E-commerce' | 'Standard'
export type SalesOrderStatus =
    | 'Completed'
    | 'Pending Delivery'
    | 'Draft'
    | 'Cancelled'

export type SalesOrderRecord = {
    /** Database id */
    id: string
    /** Business document number (POS-000001 / SO-000001) */
    orderId: string
    channel: SalesOrderChannel
    /** Header division; null for marketplace orders that span divisions. */
    divisionId: string | null
    /** Every division on the order (header, else its lines'), first seen first. */
    divisionIds: string[]
    branchId: string | null
    customer: { id: string; name: string; email: string | null }
    lines: (PricedLine & { divisionId: string | null })[]
    subtotal: number
    promoCode: string | null
    discountAmount: number
    shipping: number
    totalAmount: number
    /** POS only — cash tendered and change given. */
    paymentReceived: number | null
    change: number | null
    status: SalesOrderStatus
    createdAt: string
}

export type SalesOrderSummary = {
    orderCount: number
    posCount: number
    ecommerceCount: number
    pendingDeliveryCount: number
    totalRevenue: number
}

export type CreateRetailSalesOrderInput = {
    channel: 'POS' | 'ECOMMERCE'
    idempotencyKey: string
    divisionId: string
    /** Selling branch; required for POS. */
    branchId?: string
    customerId: string
    customerName: string
    customerEmail?: string
    lines: PricedLine[]
    subtotal: number
    discountAmount: number
    promoCode?: string | null
    shippingAmount: number
    totalAmount: number
    paymentReceived?: number
}

type DecimalString = string | number | null

type ApiSalesOrderLine = {
    divisionId: string | null
    sku: string | null
    description: string | null
    quantity: DecimalString
    unitPrice: DecimalString
    lineTotal: DecimalString
}

type ApiSalesOrder = {
    id: string
    orderNumber: string
    channel: 'STANDARD' | 'POS' | 'ECOMMERCE'
    divisionId: string | null
    branchId: string | null
    customerId: string
    customerName: string | null
    customerEmail: string | null
    subtotal: DecimalString
    discountAmount: DecimalString
    promoCode: string | null
    shippingAmount: DecimalString
    totalAmount: DecimalString
    paymentReceived: DecimalString
    changeAmount: DecimalString
    status: string
    createdAt: string
    lines: ApiSalesOrderLine[]
}

/** Fired after this tab persists an order so cached dashboard data refetches. */
export const SALES_ORDER_RECORDED_EVENT = 'sd:sales-order-recorded'

const CHANNEL_LABEL: Record<ApiSalesOrder['channel'], SalesOrderChannel> = {
    STANDARD: 'Standard',
    POS: 'POS',
    ECOMMERCE: 'E-commerce',
}

const STATUS_LABEL: Record<string, SalesOrderStatus> = {
    COMPLETED: 'Completed',
    CONFIRMED: 'Pending Delivery',
    DRAFT: 'Draft',
    CANCELLED: 'Cancelled',
}

const num = (value: DecimalString) => (value === null ? 0 : Number(value))
const numOrNull = (value: DecimalString) =>
    value === null ? null : Number(value)

function toRecord(order: ApiSalesOrder): SalesOrderRecord {
    const lineDivisions = order.lines
        .map((line) => line.divisionId ?? order.divisionId)
        .filter((id): id is string => Boolean(id))
    return {
        id: order.id,
        orderId: order.orderNumber,
        channel: CHANNEL_LABEL[order.channel] ?? 'Standard',
        divisionId: order.divisionId,
        divisionIds: order.divisionId
            ? [order.divisionId]
            : [...new Set(lineDivisions)],
        branchId: order.branchId ?? null,
        customer: {
            id: order.customerId,
            name: order.customerName ?? order.customerId,
            email: order.customerEmail,
        },
        lines: order.lines.map((line) => ({
            divisionId: line.divisionId ?? order.divisionId,
            sku: line.sku ?? '—',
            name: line.description ?? line.sku ?? '—',
            quantity: num(line.quantity),
            unitPrice: num(line.unitPrice),
            lineTotal: num(line.lineTotal),
        })),
        subtotal: num(order.subtotal),
        promoCode: order.promoCode,
        discountAmount: num(order.discountAmount),
        shipping: num(order.shippingAmount),
        totalAmount: num(order.totalAmount),
        paymentReceived: numOrNull(order.paymentReceived),
        change: numOrNull(order.changeAmount),
        status: STATUS_LABEL[order.status] ?? 'Draft',
        createdAt: order.createdAt,
    }
}

export function newIdempotencyKey(prefix: string): string {
    const random =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    return `${prefix}-${random}`
}

/** Persists a priced POS / e-commerce order in SD (POST /sd/sales-orders/retail). */
export async function createRetailSalesOrder(
    input: CreateRetailSalesOrderInput,
): Promise<SalesOrderRecord> {
    try {
        const { data } = await ErpAxiosBase.post<ApiSalesOrder>(
            '/sd/sales-orders/retail',
            {
                ...input,
                promoCode: input.promoCode ?? undefined,
                lines: input.lines.map((line) => ({
                    sku: line.sku,
                    description: line.name,
                    quantity: line.quantity,
                    unitPrice: line.unitPrice,
                    lineTotal: line.lineTotal,
                })),
            },
        )
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event(SALES_ORDER_RECORDED_EVENT))
        }
        return toRecord(data)
    } catch (error) {
        throw toError(error, 'Unable to save sales order')
    }
}

export type MarketplaceCheckoutInput = {
    /** Stable across retries of the same checkout; the server dedupes on it. */
    checkoutId: string
    customerId: string
    customerName: string
    customerEmail?: string
    shippingAddress: Omit<SalesOrderShippingDetails, 'email'>
    /** Every cart item, tagged with the division that sells it. */
    cartItems: (PricedLine & { divisionId: string })[]
    /** Whole-cart charges. */
    subtotal: number
    discountAmount: number
    promoCode?: string | null
    shippingAmount: number
    totalAmount: number
}

/**
 * Mixed-division storefront checkout (POST /sd/sales-orders/retail/checkout):
 * the server records ONE master e-commerce sales order whose lines keep their
 * `divisionId`; MM splits fulfillment later.
 */
export async function createMarketplaceCheckout(
    input: MarketplaceCheckoutInput,
    sessionToken: string,
): Promise<SalesOrderRecord> {
    try {
        const { data } = await ErpAxiosBase.post<{ order: ApiSalesOrder }>(
            '/sd/sales-orders/retail/checkout',
            {
                ...input,
                promoCode: input.promoCode ?? undefined,
                cartItems: input.cartItems.map((line) => ({
                    divisionId: line.divisionId,
                    sku: line.sku,
                    description: line.name,
                    quantity: line.quantity,
                    unitPrice: line.unitPrice,
                    lineTotal: line.lineTotal,
                })),
            },
            { headers: bearer(sessionToken) },
        )
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event(SALES_ORDER_RECORDED_EVENT))
        }
        return toRecord(data.order)
    } catch (error) {
        if (isSessionRejected(error)) throw new RetailSessionExpiredError()
        throw toError(error, 'Unable to place your order')
    }
}

export type SalesOrderDateRange = 'today' | 'last7days' | 'last30days' | 'all'

export type SalesOrderListParams = {
    /** Order number, customer name or email. */
    search?: string
    dateRange?: SalesOrderDateRange
    /** Only this customer's orders (storefront order history). */
    customerId?: string
    divisionId?: string
    /** Selling branch code; `'all'` or empty means every branch. */
    branchId?: string
}

/** Retail statuses an admin can move a Pending Delivery order to. */
export type RetailStatusTarget = 'Completed' | 'Cancelled'

const STATUS_TARGET_API: Record<RetailStatusTarget, 'COMPLETED' | 'CANCELLED'> =
    {
        Completed: 'COMPLETED',
        Cancelled: 'CANCELLED',
    }

/** Lists persisted sales orders, newest first (GET /sd/sales-orders). */
export async function getSalesOrders(
    params: SalesOrderListParams = {},
): Promise<SalesOrderRecord[]> {
    const search = params.search?.trim()
    try {
        const { data } = await ErpAxiosBase.get<ApiSalesOrder[]>(
            '/sd/sales-orders',
            {
                params: {
                    search: search || undefined,
                    customerId: params.customerId,
                    divisionId: params.divisionId,
                    branchId:
                        params.branchId && params.branchId !== 'all'
                            ? params.branchId
                            : undefined,
                    dateRange:
                        params.dateRange && params.dateRange !== 'all'
                            ? params.dateRange
                            : undefined,
                },
            },
        )
        return data.map(toRecord)
    } catch (error) {
        throw toError(error, 'Unable to load sales orders')
    }
}

/** PATCH /sd/sales-orders/retail/:id/status — only Pending Delivery orders may move. */
export async function updateRetailSalesOrderStatus(
    id: string,
    status: RetailStatusTarget,
): Promise<SalesOrderRecord> {
    try {
        const { data } = await ErpAxiosBase.patch<ApiSalesOrder>(
            `/sd/sales-orders/retail/${encodeURIComponent(id)}/status`,
            { status: STATUS_TARGET_API[status] },
        )
        return toRecord(data)
    } catch (error) {
        throw toError(error, 'Unable to update order status')
    }
}

export function summarizeSalesOrders(
    orders: SalesOrderRecord[],
): SalesOrderSummary {
    return {
        orderCount: orders.length,
        posCount: orders.filter((o) => o.channel === 'POS').length,
        ecommerceCount: orders.filter((o) => o.channel === 'E-commerce').length,
        pendingDeliveryCount: orders.filter(
            (o) => o.status === 'Pending Delivery',
        ).length,
        totalRevenue: Number(
            orders
                .filter((o) => o.status !== 'Cancelled')
                .reduce((sum, o) => sum + o.totalAmount, 0)
                .toFixed(2),
        ),
    }
}
