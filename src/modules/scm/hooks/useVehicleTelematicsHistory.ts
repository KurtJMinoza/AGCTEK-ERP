'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiGetTelematicsHistory } from '../services/scmApi'
import { getApiErrorMessage } from '../utils/apiError'
import type {
    TelematicsHistoryQuery,
    TelematicsHistoryResponse,
} from '../types'

const empty: TelematicsHistoryResponse = {
    data: [],
    total: 0,
    page: 1,
    pageSize: 20,
    generatedAt: '',
}

export function useVehicleTelematicsHistory(vehicleId: string | undefined) {
    const [params, setParams] = useState<TelematicsHistoryQuery>({
        page: 1,
        pageSize: 20,
    })
    const [result, setResult] = useState<TelematicsHistoryResponse>(empty)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        if (!vehicleId) return
        setLoading(true)
        setError(null)
        try {
            setResult(await apiGetTelematicsHistory(vehicleId, params))
        } catch (err) {
            setError(
                getApiErrorMessage(err, 'Failed to load telematics history'),
            )
            setResult(empty)
        } finally {
            setLoading(false)
        }
    }, [vehicleId, params])

    useEffect(() => {
        void reload()
    }, [reload])

    /** Any filter change goes back to page 1. */
    const setFilters = useCallback(
        (filters: Pick<TelematicsHistoryQuery, 'from' | 'to' | 'search'>) => {
            setParams((current) => ({ ...current, ...filters, page: 1 }))
        },
        [],
    )

    return {
        ...result,
        loading,
        error,
        params,
        setParams,
        setFilters,
        reload,
    }
}
