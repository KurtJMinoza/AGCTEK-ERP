'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    apiGetConsignments,
    type ConsignmentListParams,
} from '../services/scmApi'
import type { CourierConsignment, Paginated } from '../types'

const empty: Paginated<CourierConsignment> = {
    data: [],
    total: 0,
    page: 1,
    pageSize: 20,
}

export function useConsignments(initial?: ConsignmentListParams) {
    const [params, setParams] = useState<ConsignmentListParams>({
        page: 1,
        pageSize: 10,
        ...initial,
    })
    const [result, setResult] = useState<Paginated<CourierConsignment>>(empty)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setResult(await apiGetConsignments(params))
        } catch (err) {
            setError(
                err instanceof Error ? err.message : 'Failed to load consignments',
            )
            setResult(empty)
        } finally {
            setLoading(false)
        }
    }, [params])

    useEffect(() => {
        void reload()
    }, [reload])

    return { ...result, loading, error, params, setParams, reload }
}
