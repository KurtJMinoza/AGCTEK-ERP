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
    | 'Delivered'
    | 'Dispatched'
    | 'Pending Delivery'
    | 'Draft'
    | 'Cancelled'

/** Demo-only checkout payment methods (no real gateways are connected). */
export const CHECKOUT_PAYMENT_METHODS = [
    'COD',
    'CARD_DEMO',
    'WALLET_DEMO',
    'QR_DEMO',
    'BANK_TRANSFER_DEMO',
] as const
export type CheckoutPaymentMethod = (typeof CHECKOUT_PAYMENT_METHODS)[number]

export const PAYMENT_METHOD_LABEL: Record<CheckoutPaymentMethod, string> = {
    COD: 'Cash on Delivery',
    CARD_DEMO: 'Credit/Debit Card (Demo Only)',
    WALLET_DEMO: 'Digital Wallet (Demo Only)',
    QR_DEMO: 'QR Payment (Demo Only)',
    BANK_TRANSFER_DEMO: 'Bank Transfer (Demo Only)',
}

/** Customer's checkout selection, sent to the backend with the order. */
export type CheckoutPaymentSelection = {
    method: CheckoutPaymentMethod
    provider?: string
    /** Demo card: simulate a failed authorization (no picking afterwards). */
    cardDemoSimulateFailure?: boolean
}

/** Customer-facing reasons offered in the cancel-order dialog. */
export const CUSTOMER_CANCEL_REASONS = [
    'Changed my mind',
    'Wrong item',
    'Wrong address',
    'Payment issue',
    'Other',
] as const
export type CustomerCancelReason = (typeof CUSTOMER_CANCEL_REASONS)[number]

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
    /** Organization / MM company joined from salesOrder.companyId. */
    company: { id: string; name: string } | null
    lines: (PricedLine & {
        lineId: string
        divisionId: string | null
        /** Commercial snapshot for order history (image may change later). */
        productImage: string | null
        productName: string | null
        variantName?: string
        /** OPEN | RESERVED | SHORT | FULFILLED | CANCELLED */
        integrationStatus: string | null
    })[]
    subtotal: number
    promoCode: string | null
    discountAmount: number
    shipping: number
    totalAmount: number
    /** Server-computed customer cancellation eligibility. */
    customerCancel: { canCancel: boolean; reason: string | null } | null
    /** POS only — cash tendered and change given. */
    paymentReceived: number | null
    change: number | null
    /** Demo payment snapshot (null for non-checkout orders). */
    payment: {
        method: string | null
        provider: string | null
        status: string | null
        reference: string | null
        isDemo: boolean
    } | null
    /** Snapshot of the delivery address taken at checkout. */
    shippingAddress: {
        name: string | null
        phone: string | null
        line1: string | null
        city: string | null
        region: string | null
        postalCode: string | null
        country: string | null
    } | null
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
    id: string
    divisionId: string | null
    sku: string | null
    description: string | null
    productNameSnapshot: string | null
    productImageSnapshot: string | null
    variantName: string | null
    integrationStatus: string | null
    quantity: DecimalString
    unitPrice: DecimalString
    lineTotal: DecimalString
}

type ApiSalesOrder = {
    id: string
    orderNumber: string
    channel: 'STANDARD' | 'POS' | 'ECOMMERCE'
    companyId: string | null
    company: { id: string; name: string } | null
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
    paymentMethod: string | null
    paymentStatus: string | null
    paymentReference: string | null
    paymentProvider: string | null
    isDemoPayment: boolean | null
    shipToName: string | null
    shipToPhone: string | null
    shipToAddressLine1: string | null
    shipToCity: string | null
    shipToRegion: string | null
    shipToPostalCode: string | null
    shipToCountry: string | null
    customerCancel: {
        canCancel: boolean
        reason: string | null
    } | null
    status: string
    createdAt: string
    lines: ApiSalesOrderLine[]
}

/** Fired after this tab persists an order so cached dashboard data refetches. */
export const SALES_ORDER_RECORDED_EVENT = 'sd:sales-order-recorded'

/**
 * Cross-tab sync: when an order is created/cancelled in ANY tab (storefront,
 * POS, admin), Mission Control refreshes immediately instead of waiting up to
 * 30 s for its polling interval.
 */
export function broadcastSalesOrderChanged(): void {
    try {
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
            const channel = new BroadcastChannel('agc-erp')
            channel.postMessage({ type: 'sales-order-recorded' })
            channel.close()
        }
    } catch {
        // Best-effort cross-tab notification.
    }
}

const CHANNEL_LABEL: Record<ApiSalesOrder['channel'], SalesOrderChannel> = {
    STANDARD: 'Standard',
    POS: 'POS',
    ECOMMERCE: 'E-commerce',
}

const STATUS_LABEL: Record<string, SalesOrderStatus> = {
    COMPLETED: 'Completed',
    DELIVERED: 'Delivered',
    SHIPPED: 'Dispatched',
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
        company: order.company
            ? { id: order.company.id, name: order.company.name }
            : null,
        lines: order.lines.map((line) => ({
            lineId: line.id,
            divisionId: line.divisionId ?? order.divisionId,
            sku: line.sku ?? '—',
            name:
                line.productNameSnapshot ?? line.description ?? line.sku ?? '—',
            productImage: line.productImageSnapshot,
            productName: line.productNameSnapshot,
            variantName: line.variantName ?? undefined,
            integrationStatus: line.integrationStatus ?? null,
            quantity: num(line.quantity),
            unitPrice: num(line.unitPrice),
            lineTotal: num(line.lineTotal),
        })),
        subtotal: num(order.subtotal),
        promoCode: order.promoCode,
        discountAmount: num(order.discountAmount),
        shipping: num(order.shippingAmount),
        totalAmount: num(order.totalAmount),
        customerCancel: order.customerCancel ?? null,
        paymentReceived: numOrNull(order.paymentReceived),
        change: numOrNull(order.changeAmount),
        payment:
            order.paymentMethod !== undefined && order.paymentMethod !== null
                ? {
                      method: order.paymentMethod,
                      provider: order.paymentProvider,
                      status: order.paymentStatus,
                      reference: order.paymentReference,
                      isDemo: Boolean(order.isDemoPayment),
                  }
                : null,
        shippingAddress:
            order.shipToName !== undefined && order.shipToName !== null
                ? {
                      name: order.shipToName,
                      phone: order.shipToPhone,
                      line1: order.shipToAddressLine1,
                      city: order.shipToCity,
                      region: order.shipToRegion,
                      postalCode: order.shipToPostalCode,
                      country: order.shipToCountry,
                  }
                : null,
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
        broadcastSalesOrderChanged()
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
    /** Mode of payment selected at checkout (demo mode — no real gateways). */
    paymentMethod: CheckoutPaymentMethod
    paymentProvider?: string
    /** Demo card: simulate a failed authorization. */
    cardDemoSimulateFailure?: boolean
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
                paymentProvider: input.paymentProvider ?? undefined,
                cardDemoSimulateFailure:
                    input.cardDemoSimulateFailure ?? undefined,
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
        broadcastSalesOrderChanged()
        return toRecord(data.order)
    } catch (error) {
        if (isSessionRejected(error)) throw new RetailSessionExpiredError()
        throw toError(error, 'Unable to place your order')
    }
}

/**
 * Customer self-service cancellation before warehouse processing
 * (POST /sd/sales-orders/retail/:id/cancel). The reservation is released by
 * the backend; an already-cancelled order returns success without re-release.
 */
export async function cancelCustomerOrder(
    id: string,
    reason: string,
    sessionToken: string,
): Promise<SalesOrderRecord> {
    try {
        const { data } = await ErpAxiosBase.post<ApiSalesOrder>(
            `/sd/sales-orders/retail/${encodeURIComponent(id)}/cancel`,
            { reason },
            { headers: bearer(sessionToken) },
        )
        broadcastSalesOrderChanged()
        return toRecord(data)
    } catch (error) {
        if (isSessionRejected(error)) throw new RetailSessionExpiredError()
        throw toError(error, 'Unable to cancel this order')
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
    /** Organization / MM company scope (admin list filter). */
    companyId?: string
}

/** Back-office may cancel before fulfillment or close an already delivered order. */
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
                    companyId:
                        params.companyId && params.companyId !== 'all'
                            ? params.companyId
                            : undefined,
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

/** PATCH /sd/sales-orders/retail/:id/status — cancel before fulfillment or complete after delivery. */
export async function updateRetailSalesOrderStatus(
    id: string,
    status: RetailStatusTarget,
): Promise<SalesOrderRecord> {
    try {
        const { data } = await ErpAxiosBase.patch<ApiSalesOrder>(
            `/sd/sales-orders/retail/${encodeURIComponent(id)}/status`,
            { status: STATUS_TARGET_API[status] },
        )
        broadcastSalesOrderChanged()
        return toRecord(data)
    } catch (error) {
        throw toError(error, 'Unable to update order status')
    }
}

/**
 * Admin: mark an order's demo payment Paid (bank transfer verified, COD
 * collected). When the payment allows fulfillment, the backend triggers
 * reservation + auto picking if they were never created.
 */
export async function markOrderPaymentPaid(
    id: string,
): Promise<SalesOrderRecord> {
    try {
        const { data } = await ErpAxiosBase.patch<ApiSalesOrder>(
            `/sd/sales-orders/${encodeURIComponent(id)}/payment`,
            { status: 'Paid' },
        )
        broadcastSalesOrderChanged()
        return toRecord(data)
    } catch (error) {
        throw toError(error, 'Unable to update payment status')
    }
}

export type CustomerReturnLinePayload = {
    salesOrderLineId: string
    quantity: number
    reason?: string
    conditionNote?: string
}

export type CustomerReturnRequestPayload = {
    reason?: string
    conditionNote?: string
    photos?: string[]
    lines: CustomerReturnLinePayload[]
}

export type CustomerReturnRequestRecord = {
    id: string
    requestNumber: string
    status: string
    reason: string | null
    conditionNote: string | null
    photos: unknown
    mmCustomerReturnId: string | null
    lines: Array<{
        id: string
        salesOrderLineId: string
        quantity: number
        reason: string | null
        disposition: string | null
    }>
}

/**
 * Storefront return request against a delivered order (shopper bearer token).
 * Ownership and company scope are enforced server-side.
 */
export async function createCustomerReturnRequest(
    orderId: string,
    payload: CustomerReturnRequestPayload,
    token: string,
): Promise<CustomerReturnRequestRecord> {
    try {
        const { data } = await ErpAxiosBase.post<CustomerReturnRequestRecord>(
            `/sd/sales-orders/retail/${encodeURIComponent(orderId)}/returns`,
            payload,
            { headers: { Authorization: `Bearer ${token}` } },
        )
        return data
    } catch (error) {
        throw toError(error, 'Unable to submit return request')
    }
}

/** Uploads return evidence photo (POST /sd/returns/photos); returns the public URL. */
export async function uploadReturnPhoto(file: File): Promise<string> {
    const formData = new FormData()
    formData.append('file', file)
    try {
        const { data } = await ErpAxiosBase.post<{ imageUrl: string }>(
            '/sd/returns/photos',
            formData,
            {
                headers: { 'Content-Type': 'multipart/form-data' },
            },
        )
        return data.imageUrl
    } catch (error) {
        throw toError(error, 'Unable to upload photo')
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
