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
    signIn(input: SignInInput): Promise<Customer>
    register(input: RegisterInput): Promise<Customer>
    updateProfile(customerId: string, update: ProfileUpdate): Promise<Customer>
    /** Places one order per store in a single checkout. */
    checkout(input: CheckoutInput): Promise<CheckoutResult>
    getOrders(customerId: string): Promise<Order[]>
}

export class CommerceApiError extends Error {
    constructor(
        message: string,
        readonly code: 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'NETWORK',
    ) {
        super(message)
        this.name = 'CommerceApiError'
    }
}
