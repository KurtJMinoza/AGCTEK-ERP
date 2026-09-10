'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiGetTrackingHistory } from '../services/scmApi'
import type { GpsLog } from '../types'

const HISTORY_LIMIT = 100
const MERGED_CAP = 100

/**
 * Breadcrumb / trail for the focused unit.
 * Pass `liveTrail` from Socket.IO so the polyline grows without waiting for HTTP.
 */
export function useFocusedVehicleTrail(
    vehicleId: string | null,
    liveTrail: GpsLog[] = [],
) {
    const [history, setHistory] = useState<GpsLog[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        if (!vehicleId) {
            setHistory([])
            setError(null)
            setLoading(false)
            return
        }

        setLoading(true)
        setError(null)
        try {
            const data = await apiGetTrackingHistory(vehicleId, {
                limit: HISTORY_LIMIT,
            })
            setHistory(data)
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Failed to load GPS history',
            )
            setHistory([])
        } finally {
            setLoading(false)
        }
    }, [vehicleId])

    useEffect(() => {
        void reload()
    }, [reload])

    const mergedHistory = useMemo(() => {
        if (!vehicleId) return []
        const byId = new Map<string, GpsLog>()
        for (const point of [...history, ...liveTrail]) {
            byId.set(point.id, point)
        }
        return Array.from(byId.values())
            .sort(
                (a, b) =>
                    new Date(b.recordedAt).getTime() -
                    new Date(a.recordedAt).getTime(),
            )
            .slice(0, MERGED_CAP)
    }, [history, liveTrail, vehicleId])

    return { history: mergedHistory, loading, error, reload }
}
