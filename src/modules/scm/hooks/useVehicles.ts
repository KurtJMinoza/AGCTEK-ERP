'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    apiCreateVehicle,
    apiDeleteVehicle,
    apiGetVehicles,
    apiUpdateVehicle,
} from '../services/scmApi'
import type { ListParams, Paginated, Vehicle } from '../types'

const empty: Paginated<Vehicle> = {
    data: [],
    total: 0,
    page: 1,
    pageSize: 20,
}

export function useVehicles(initial?: ListParams) {
    const [params, setParams] = useState<ListParams>({
        page: 1,
        pageSize: 10,
        ...initial,
    })
    const [result, setResult] = useState<Paginated<Vehicle>>(empty)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await apiGetVehicles(params)
            setResult(data)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load vehicles')
            setResult(empty)
        } finally {
            setLoading(false)
        }
    }, [params])

    useEffect(() => {
        void reload()
    }, [reload])

    const create = async (body: Partial<Vehicle>) => {
        const created = await apiCreateVehicle(body)
        await reload()
        return created
    }

    const update = async (id: string, body: Partial<Vehicle>) => {
        const updated = await apiUpdateVehicle(id, body)
        await reload()
        return updated
    }

    const remove = async (id: string) => {
        await apiDeleteVehicle(id)
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
        remove,
    }
}
