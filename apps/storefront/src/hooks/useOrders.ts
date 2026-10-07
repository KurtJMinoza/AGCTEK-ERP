import type { Order } from '../types'
import { useCommerceQuery } from './useCommerceQuery'

/** The signed-in customer's marketplace orders (newest first). */
export function useOrders(customerId: string | null) {
    return useCommerceQuery<Order[]>(
        async (api) => {
            if (!customerId) return []
            const orders = await api.getOrders(customerId)
            return [...orders].sort((a, b) => b.placedAt.localeCompare(a.placedAt))
        },
        [customerId],
    )
}
