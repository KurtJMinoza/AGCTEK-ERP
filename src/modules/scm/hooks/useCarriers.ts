'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    apiCreateCarrier,
    apiDeleteCarrier,
    apiGetCarriers,
    apiUpdateCarrier,
    type CarrierBody,
    type CarrierListParams,
} from '../services/scmApi'
import type { Carrier, Paginated } from '../types'

const empty: Paginated<Carrier> = {
    data: [],
    total: 0,
    page: 1,
    pageSize: 20,
}

export function useCarriers(initial?: CarrierListParams) {
    const [params, setParams] = useState<CarrierListParams>({
        page: 1,
        pageSize: 20,
        ...initial,
    })
    const [result, setResult] = useState<Paginated<Carrier>>(empty)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setResult(await apiGetCarriers(params))
        } catch (err) {
            setError(
                err instanceof Error ? err.message : 'Failed to load couriers',
            )
            setResult(empty)
        } finally {
            setLoading(false)
        }
    }, [params])

    useEffect(() => {
        void reload()
    }, [reload])

    const create = async (body: CarrierBody) => {
        const created = await apiCreateCarrier(body)
        await reload()
        return created
    }

    const update = async (id: string, body: CarrierBody) => {
        const updated = await apiUpdateCarrier(id, body)
        await reload()
        return updated
    }

    const remove = async (id: string) => {
        await apiDeleteCarrier(id)
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
