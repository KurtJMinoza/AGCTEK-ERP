import type {
    CreateOrderInput,
    Customer,
    Order,
    OrderTracking,
    Product,
    ProductQuery,
    SignInInput,
} from '../types'

export type * from '../types'

/**
 * The only boundary screens/hooks may use to reach commerce data.
 *
 * Screen → Hook/Context → CommerceApi → MockCommerceApi | HttpCommerceApi → ERP
 *
 * Keep this contract stable; swapping implementations must not require UI changes.
 */
export interface CommerceApi {
    signIn(input: SignInInput): Promise<Customer>
    getProducts(query?: ProductQuery): Promise<Product[]>
    getProduct(id: string): Promise<Product>
    createOrder(input: CreateOrderInput): Promise<Order>
    getOrders(): Promise<Order[]>
    getOrder(id: string): Promise<Order>
    /** Read-only customer projection: milestones, ETA, coarse area. */
    getTracking(orderId: string): Promise<OrderTracking>
}

export class CommerceApiError extends Error {
    constructor(
        message: string,
        readonly code: 'NOT_FOUND' | 'VALIDATION' | 'NOT_IMPLEMENTED' | 'NETWORK',
    ) {
        super(message)
        this.name = 'CommerceApiError'
    }
}
