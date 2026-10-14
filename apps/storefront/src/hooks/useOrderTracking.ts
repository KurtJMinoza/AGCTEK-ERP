import { useEffect } from 'react'
import type { OrderTracking } from '../types'
import { useCommerceQuery } from './useCommerceQuery'

const IN_TRANSIT_POLL_MS = 45_000

/**
 * Server-computed tracking for one order. Re-polls while the order is in
 * transit; the courier position is already delayed by the server.
 */
export function useOrderTracking(orderId: string | null, enabled: boolean) {
    const query = useCommerceQuery<OrderTracking | null>(
        (api) => (orderId && enabled ? api.getOrderTracking(orderId) : Promise.resolve(null)),
        [orderId, enabled],
    )
    const inTransit = query.data?.customerStatus === 'IN_TRANSIT'
    const { refresh } = query

    useEffect(() => {
        if (!inTransit) return
        const timer = setInterval(() => void refresh(), IN_TRANSIT_POLL_MS)
        return () => clearInterval(timer)
    }, [inTransit, refresh])

    return query
}
