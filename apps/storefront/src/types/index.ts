/**
 * Storefront domain models: a customer-facing projection of the same SD data
 * the web marketplace (/shop) uses — never raw ERP entities, fleet/GPS
 * telemetry, or driver details.
 */

export type DivisionId = 'DIV_RETAIL' | 'DIV_LPG' | 'DIV_APPLIANCES'

export type Spec = { label: string; value: string }

export type Review = {
    id: string
    rating: number
    title?: string
    body?: string
    author?: string
    date?: string
}

/** One sellable SD catalogue product (same records as the web marketplace). */
export type Product = {
    id: string
    divisionId: string
    sku: string
    name: string
    description: string
    category: string
    price: number
    originalPrice: number | null
    badge: string | null
    /** Absolute image URLs, cover first. */
    images: string[]
    tagline: string | null
    details: string | null
    features: string[]
    inclusions: string[]
    specs: Spec[]
    reviews: Review[]
    warranty: string | null
    /** LPG add-ons cannot be ordered without a refill or set. */
    isAddon: boolean
}

export type AvailabilityState =
    | 'IN_STOCK'
    | 'LOW_STOCK'
    | 'OUT_OF_STOCK'
    | 'NOT_MAPPED'
    | 'NON_INVENTORY'

/** Commercial availability supplied by the ERP; the app never computes ATP. */
export type Availability = {
    state: AvailabilityState
    availableQuantity: number
}

/** Delivery details collected at checkout (same fields as the web form). */
export type ShippingDetails = {
    fullName: string
    email: string
    phone: string
    addressLine1: string
    city: string
    region: string
    postalCode: string
    country: string
}

/** Signed-in marketplace customer (ERP retail client). */
export type Customer = ShippingDetails & { customerId: string }

export type SignInInput = { email: string; password: string }

export type RegisterInput = ShippingDetails & { password: string }

export type ProfileUpdate = Omit<ShippingDetails, 'email'>

/** Customer-facing order status, same wording as the web "My orders". */
export type OrderStatus =
    | 'PENDING_APPROVAL'
    | 'PREPARING_TO_SHIP'
    | 'DISPATCHED'
    | 'DELIVERED'
    | 'COMPLETED'
    | 'CANCELLED'

export type OrderLine = {
    /** Store (division) that sells this line. */
    divisionId: string | null
    sku: string
    name: string
    quantity: number
    unitPrice: number
    lineTotal: number
}

/** One sales order; a marketplace checkout records the whole cart as one master order. */
export type Order = {
    id: string
    orderNumber: string
    /** Every store on the order, first seen first. */
    divisionIds: string[]
    status: OrderStatus
    placedAt: string
    updatedAt: string
    lines: OrderLine[]
    subtotal: number
    discountAmount: number
    promoCode: string | null
    shippingAmount: number
    totalAmount: number
    paymentMethod: string | null
    shipTo: {
        fullName: string
        phone: string
        address: string
    } | null
}

export type PricedLine = {
    sku: string
    name: string
    quantity: number
    unitPrice: number
    lineTotal: number
}

export type StoreCartPricing = {
    divisionId: DivisionId
    lines: PricedLine[]
    promoCode: string | null
    subtotal: number
    discountAmount: number
    shipping: number
    grandTotal: number
}

export type CartPricing = {
    stores: StoreCartPricing[]
    promoCode: string | null
    subtotal: number
    discountAmount: number
    shipping: number
    grandTotal: number
}

export type PaymentMethod = 'CASH_ON_DELIVERY' | 'GCASH' | 'MAYA' | 'BANK_TRANSFER'

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
    CASH_ON_DELIVERY: 'Cash on Delivery',
    GCASH: 'GCash',
    MAYA: 'Maya',
    BANK_TRANSFER: 'Bank Transfer',
}

export type CheckoutInput = {
    /** Reused on retry so a resubmitted checkout is not recorded twice. */
    checkoutId: string
    customerId: string
    shipping: ShippingDetails
    pricing: CartPricing
    /** Defaults to CASH_ON_DELIVERY if not supplied. */
    paymentMethod?: PaymentMethod
}

export type CheckoutResult = {
    checkoutId: string
    /** The single master sales order for the whole cart. */
    orderId: string
    orderNumber: string
    grandTotal: number
    paymentMethod?: PaymentMethod
    /** Per-store breakdown of that order, for the receipt. */
    stores: StoreCartPricing[]
}

// ─── Notifications ───────────────────────────────────────────────────────────

export type Notification = {
    id: string
    title: string | null
    message: string | null
    /** SO-number or other deep-link target. */
    target: string | null
    /** Web path to open, e.g. `/shop/track/<token>` for delivery updates. */
    location: string | null
    isRead: boolean
    createdAt: string | null
}

// ─── Order Tracking (server-computed; the app only displays it) ─────────────

export type CustomerOrderStatus =
    | 'PLACED'
    | 'CONFIRMED'
    | 'PREPARING'
    | 'READY_FOR_DELIVERY'
    | 'IN_TRANSIT'
    | 'DELIVERED'
    | 'DELIVERY_FAILED'
    | 'CANCELLED'

export type TrackingCheckpoint = {
    code: CustomerOrderStatus
    label: string
    at: string | null
    done: boolean
    current: boolean
    /** Customer-safe note, e.g. the failed-delivery reason or departure hub. */
    note?: string | null
}

export type DeliveryEta = { from: string; to: string; basis: 'road' | 'straight_line' }

/** Delayed courier position; never the vehicle, plate or device identity. */
export type TrackingMap = {
    available: boolean
    reason: 'NOT_IN_TRANSIT' | 'NO_GPS_YET' | 'WAITING_FOR_UPDATE' | null
    delaySeconds: number
    lastMile: boolean
    latitude: number | null
    longitude: number | null
    recordedAt: string | null
    lastUpdatedLabel: string | null
    eta: DeliveryEta | null
}

export type OrderTracking = {
    orderId: string
    orderNumber: string
    customerStatus: CustomerOrderStatus
    customerStatusLabel: string
    checkpoints: TrackingCheckpoint[]
    map: TrackingMap | null
}

export type TrackingLink = { token: string; expiresAt: string }

// ─── Return Requests ─────────────────────────────────────────────────────────

export type ReturnReason =
    | 'Wrong item received'
    | 'Item damaged on arrival'
    | 'Item defective / not working'
    | 'Changed my mind'
    | 'Other'

export const RETURN_REASONS: ReturnReason[] = [
    'Wrong item received',
    'Item damaged on arrival',
    'Item defective / not working',
    'Changed my mind',
    'Other',
]

export type ReturnRequest = {
    orderId: string
    reason: ReturnReason
    notes: string
}

// ─── Cancel Reasons ───────────────────────────────────────────────────────────

export const CANCEL_REASONS = [
    'Changed my mind',
    'Found a better price elsewhere',
    'Ordered by mistake',
    'Delivery time is too long',
    'Other',
] as const

export type CancelReason = typeof CANCEL_REASONS[number]

// ─── Saved Addresses ─────────────────────────────────────────────────────────

export type AddressType = 'HOME' | 'WORK' | 'OTHER'

export type SavedAddress = {
    id: string
    addressType: AddressType
    label: string | null
    addressLine: string | null
    barangay: string | null
    city: string | null
    province: string | null
    postalCode: string | null
    country: string | null
    formattedAddress: string | null
    latitude: number | null
    longitude: number | null
    isDefault: boolean
    additionalInfo: string | null
}

export type SavedAddressInput = Omit<SavedAddress, 'id' | 'formattedAddress' | 'label'>
