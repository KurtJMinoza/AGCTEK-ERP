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
    | 'DELIVERED'
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

export type CheckoutInput = {
    /** Reused on retry so a resubmitted checkout is not recorded twice. */
    checkoutId: string
    customerId: string
    shipping: ShippingDetails
    pricing: CartPricing
}

export type CheckoutResult = {
    checkoutId: string
    /** The single master sales order for the whole cart. */
    orderId: string
    orderNumber: string
    grandTotal: number
    /** Per-store breakdown of that order, for the receipt. */
    stores: StoreCartPricing[]
}
