import type {
    Availability,
    CheckoutInput,
    CheckoutResult,
    Customer,
    Order,
    Product,
    ProfileUpdate,
    RegisterInput,
    SignInInput,
} from '../types'

export type * from '../types'

/**
 * The only boundary screens/hooks may use to reach commerce data.
 *
 * Screen → Hook/Context → CommerceApi → MockCommerceApi | HttpCommerceApi → ERP
 *
 * The HTTP implementation calls the same SD endpoints as the web marketplace,
 * so both channels share one catalogue, one checkout and one order history.
 */
export interface CommerceApi {
    /** Active products from every official store. */
    getProducts(): Promise<Product[]>
    getAvailability(divisionId: string, sku: string): Promise<Availability>
    /** Signs in and keeps the session token for later account / checkout calls. */
    signIn(input: SignInInput): Promise<Customer>
    register(input: RegisterInput): Promise<Customer>
    /** Token issued by the last sign-in / register, for persisting with the session. */
    getSessionToken(): string | null
    /** Restores a persisted token, or clears it on sign-out. */
    setSessionToken(token: string | null): void
    updateProfile(customerId: string, update: ProfileUpdate): Promise<Customer>
    /** Places one order per store in a single checkout. */
    checkout(input: CheckoutInput): Promise<CheckoutResult>
    getOrders(customerId: string): Promise<Order[]>
}

export class CommerceApiError extends Error {
    constructor(
        message: string,
        readonly code:
            | 'NOT_FOUND'
            | 'VALIDATION'
            | 'CONFLICT'
            | 'NETWORK'
            | 'UNAUTHORIZED',
    ) {
        super(message)
        this.name = 'CommerceApiError'
    }
}
