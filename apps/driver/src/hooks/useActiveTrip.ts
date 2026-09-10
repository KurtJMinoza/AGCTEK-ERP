import { useCallback, useEffect, useState } from 'react'
import { apiGetActiveTrip, apiGetTrip } from '../api/client'
import type { Trip } from '../types'

export function useActiveTrip(driverId: string | undefined) {
    const [trip, setTrip] = useState<Trip | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        if (!driverId) {
            setTrip(null)
            setLoading(false)
            return
        }
        setLoading(true)
        setError(null)
        try {
            const data = await apiGetActiveTrip(driverId)
            setTrip(data)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load trip')
            setTrip(null)
        } finally {
            setLoading(false)
        }
    }, [driverId])

    useEffect(() => {
        void reload()
    }, [reload])

    const refreshTrip = useCallback(
        async (tripId?: string) => {
            const id = tripId ?? trip?.id
            if (!id) {
                await reload()
                return
            }
            try {
                const data = await apiGetTrip(id)
                setTrip(data)
            } catch {
                await reload()
            }
        },
        [trip?.id, reload],
    )

    return { trip, loading, error, reload, refreshTrip, setTrip }
}

export function stopQty(stop: {
    shipments?: Array<{ shipment?: { quantity?: number } | null }>
}): number {
    return (stop.shipments ?? []).reduce(
        (sum, link) => sum + (link.shipment?.quantity ?? 0),
        0,
    )
}
