'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    apiCreateDriver,
    apiDeleteDriver,
    apiGetDrivers,
    apiUpdateDriver,
    type CreateDriverBody,
} from '../services/scmApi'
import type { Driver, ListParams, Paginated } from '../types'

const empty: Paginated<Driver> = {
    data: [],
    total: 0,
    page: 1,
    pageSize: 20,
}

export function useDrivers(initial?: ListParams) {
    const [params, setParams] = useState<ListParams>({
        page: 1,
        pageSize: 10,
        ...initial,
    })
    const [result, setResult] = useState<Paginated<Driver>>(empty)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await apiGetDrivers(params)
            setResult(data)
        } catch (err) {
            setError(
                err instanceof Error ? err.message : 'Failed to load drivers',
            )
            setResult(empty)
        } finally {
            setLoading(false)
        }
    }, [params])

    useEffect(() => {
        void reload()
    }, [reload])

    const create = async (body: CreateDriverBody) => {
        const created = await apiCreateDriver(body)
        await reload()
        return created
    }

    const update = async (
        id: string,
        body: Partial<Omit<CreateDriverBody, 'userId'>>,
    ) => {
        const updated = await apiUpdateDriver(id, body)
        await reload()
        return updated
    }

    const remove = async (id: string) => {
        await apiDeleteDriver(id)
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
