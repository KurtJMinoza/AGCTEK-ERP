'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    apiCreateTrip,
    apiDeleteTrip,
    apiGetTrips,
    apiUpdateTrip,
    apiUpdateTripStatus,
} from '../services/scmApi'
import type { ListParams, Paginated, Trip } from '../types'

const empty: Paginated<Trip> = {
    data: [],
    total: 0,
    page: 1,
    pageSize: 20,
}

export function useTrips(initial?: ListParams) {
    const [params, setParams] = useState<ListParams>({
        page: 1,
        pageSize: 10,
        ...initial,
    })
    const [result, setResult] = useState<Paginated<Trip>>(empty)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await apiGetTrips(params)
            setResult(data)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load trips')
            setResult(empty)
        } finally {
            setLoading(false)
        }
    }, [params])

    useEffect(() => {
        void reload()
    }, [reload])

    const create = async (body: Record<string, unknown>) => {
        const created = await apiCreateTrip(body)
        await reload()
        return created
    }

    const update = async (id: string, body: Record<string, unknown>) => {
        const updated = await apiUpdateTrip(id, body)
        await reload()
        return updated
    }

    const updateStatus = async (id: string, status: string) => {
        const updated = await apiUpdateTripStatus(id, status)
        await reload()
        return updated
    }

    const remove = async (id: string) => {
        await apiDeleteTrip(id)
        await reload()
    }

    return {
        ...result,
        loading,
        error,
        params,
        setParams,
        reload,
        create,
        update,
        updateStatus,
        remove,
    }
}
