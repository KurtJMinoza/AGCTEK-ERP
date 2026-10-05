import type { Order, OrderTracking } from '../types'
import { useCommerceQuery } from './useCommerceQuery'

export function useOrders() {
    return useCommerceQuery<Order[]>((api) => api.getOrders(), [])
}

export function useOrder(id: string | undefined) {
    return useCommerceQuery<Order | null>(
        (api) => (id ? api.getOrder(id) : Promise.resolve(null)),
        [id],
    )
}

export function useTracking(orderId: string | undefined) {
    return useCommerceQuery<OrderTracking | null>(
        (api) => (orderId ? api.getTracking(orderId) : Promise.resolve(null)),
        [orderId],
    )
}
