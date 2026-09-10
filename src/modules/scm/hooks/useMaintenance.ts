'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    apiCreateMaintenance,
    apiDeleteMaintenance,
    apiGetMaintenance,
    apiUpdateMaintenance,
    type CreateMaintenanceBody,
} from '../services/scmApi'
import type { ListParams, MaintenanceRecord, Paginated } from '../types'

const empty: Paginated<MaintenanceRecord> = {
    data: [],
    total: 0,
    page: 1,
    pageSize: 20,
}

export function useMaintenance(initial?: ListParams) {
    const [params, setParams] = useState<ListParams>({
        page: 1,
        pageSize: 10,
        ...initial,
    })
    const [result, setResult] = useState<Paginated<MaintenanceRecord>>(empty)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await apiGetMaintenance(params)
            setResult(data)
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Failed to load maintenance records',
            )
            setResult(empty)
        } finally {
            setLoading(false)
        }
    }, [params])

    useEffect(() => {
        void reload()
    }, [reload])

    const create = async (body: CreateMaintenanceBody) => {
        const created = await apiCreateMaintenance(body)
        await reload()
        return created
    }

    const update = async (id: string, body: Partial<CreateMaintenanceBody>) => {
        const updated = await apiUpdateMaintenance(id, body)
        await reload()
        return updated
    }

    const remove = async (id: string) => {
        await apiDeleteMaintenance(id)
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
