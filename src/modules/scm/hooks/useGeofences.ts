'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    apiCreateGeofence,
    apiDeleteGeofence,
    apiGetGeofences,
    apiUpdateGeofence,
} from '../services/scmApi'
import type { GeofenceZone } from '../utils/geofences'

export function useGeofences() {
    const [data, setData] = useState<GeofenceZone[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const result = await apiGetGeofences({
                page: 1,
                pageSize: 100,
                active: 'true',
            })
            setData(result.data)
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Failed to load geofences',
            )
            setData([])
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void reload()
    }, [reload])

    const create = async (body: Partial<GeofenceZone>) => {
        const created = await apiCreateGeofence(body)
        await reload()
        return created
    }

    const update = async (id: string, body: Partial<GeofenceZone>) => {
        const updated = await apiUpdateGeofence(id, body)
        await reload()
        return updated
    }

    const remove = async (id: string) => {
        await apiDeleteGeofence(id)
        await reload()
    }

    return { data, loading, error, reload, create, update, remove }
}
