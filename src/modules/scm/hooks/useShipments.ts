'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiCreateShipment, apiDeleteShipment, apiGetShipments } from '../services/scmApi'
import type { ListParams, Paginated, Shipment } from '../types'

const empty: Paginated<Shipment> = {
    data: [],
    total: 0,
    page: 1,
    pageSize: 20,
}

export function useShipments(initial?: ListParams) {
    const [params, setParams] = useState<ListParams>({
        page: 1,
        pageSize: 10,
        status: 'READY',
        ...initial,
    })
    const [result, setResult] = useState<Paginated<Shipment>>(empty)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await apiGetShipments(params)
            setResult(data)
        } catch (err) {
            setError(
                err instanceof Error ? err.message : 'Failed to load shipments',
            )
            setResult(empty)
        } finally {
            setLoading(false)
        }
    }, [params])

    useEffect(() => {
        void reload()
    }, [reload])

    const create = async (body: Partial<Shipment>) => {
        const created = await apiCreateShipment(body)
        await reload()
        return created
    }

    const remove = async (id: string) => {
        await apiDeleteShipment(id)
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
        remove,
    }
}
