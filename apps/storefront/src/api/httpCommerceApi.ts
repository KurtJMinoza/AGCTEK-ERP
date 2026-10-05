import {
    CommerceApiError,
    type CommerceApi,
    type CreateOrderInput,
    type Customer,
    type Order,
    type OrderTracking,
    type Product,
    type ProductQuery,
    type SignInInput,
} from './commerceApi'

/**
 * HTTP implementation against the Nest API (`/api/v1`).
 *
 * Storefront endpoints do not exist in the backend yet; paths will be agreed
 * with SD (orders) and SCM (tracking projection) before these are wired.
 * Until then every method fails loudly instead of guessing a contract.
 */
export class HttpCommerceApi implements CommerceApi {
    constructor(private readonly baseUrl: string) {}

    signIn(_input: SignInInput): Promise<Customer> {
        return this.notImplemented('signIn')
    }

    getProducts(_query?: ProductQuery): Promise<Product[]> {
        return this.notImplemented('getProducts')
    }

    getProduct(_id: string): Promise<Product> {
        return this.notImplemented('getProduct')
    }

    createOrder(_input: CreateOrderInput): Promise<Order> {
        return this.notImplemented('createOrder')
    }

    getOrders(): Promise<Order[]> {
        return this.notImplemented('getOrders')
    }

    getOrder(_id: string): Promise<Order> {
        return this.notImplemented('getOrder')
    }

    getTracking(_orderId: string): Promise<OrderTracking> {
        return this.notImplemented('getTracking')
    }

    private notImplemented<T>(method: string): Promise<T> {
        return Promise.reject(
            new CommerceApiError(
                `HttpCommerceApi.${method} is not available yet (${this.baseUrl}). Set EXPO_PUBLIC_USE_MOCK_API=true.`,
                'NOT_IMPLEMENTED',
            ),
        )
    }
}
