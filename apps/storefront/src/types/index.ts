/**
 * Storefront domain models. These are a customer-facing projection of SD/SCM
 * data — never raw ERP entities, fleet/GPS telemetry, or driver details.
 */

export type CurrencyCode = 'PHP'

/**
 * Customer-facing order lifecycle.
 *
 * | Status            | ERP meaning (documentation only) |
 * | ----------------- | -------------------------------- |
 * | PLACED            | Customer submitted               |
 * | CONFIRMED         | Order accepted (SD)              |
 * | PACKED            | Warehouse prepared               |
 * | OUT_FOR_DELIVERY  | Dispatched (SCM)                 |
 * | DELIVERED         | POD done                         |
 * | CANCELLED         | Cancelled                        |
 */
export type OrderStatus =
    | 'PLACED'
    | 'CONFIRMED'
    | 'PACKED'
    | 'OUT_FOR_DELIVERY'
    | 'DELIVERED'
    | 'CANCELLED'

export type Product = {
    id: string
    sku: string
    name: string
    description: string
    category: string
    unitPrice: number
    currency: CurrencyCode
    uom: string
    imageUrl: string | null
    /** Availability flag supplied by the backend; the app never computes ATP. */
    available: boolean
}

export type ProductQuery = {
    search?: string
    category?: string
}

export type OrderLine = {
    productId: string
    sku: string
    name: string
    uom: string
    quantity: number
    unitPrice: number
    lineTotal: number
}

export type Order = {
    id: string
    orderNumber: string
    status: OrderStatus
    placedAt: string
    lines: OrderLine[]
    subtotal: number
    currency: CurrencyCode
    shippingAddress: string | null
    notes: string | null
}

export type CreateOrderItem = {
    productId: string
    quantity: number
}

export type CreateOrderInput = {
    items: CreateOrderItem[]
    shippingAddress?: string | null
    notes?: string | null
}

export type TrackingEvent = {
    status: OrderStatus
    label: string
    occurredAt: string
    /** Coarse area (e.g. city / hub), never coordinates. */
    area: string | null
}

export type OrderTracking = {
    orderId: string
    orderNumber: string
    status: OrderStatus
    events: TrackingEvent[]
    eta: string | null
    lastKnownArea: string | null
}

export type Customer = {
    id: string
    name: string
    email: string
    defaultAddress: string | null
}

export type SignInInput = {
    email: string
    password: string
}
