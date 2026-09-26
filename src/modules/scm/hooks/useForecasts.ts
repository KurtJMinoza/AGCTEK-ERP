'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    apiCreateForecast,
    apiDeleteForecast,
    apiGetForecasts,
} from '../services/scmApi'
import { getApiErrorMessage } from '../utils/apiError'
import type {
    CreateDemandForecastInput,
    DemandForecast,
    ListParams,
    Paginated,
} from '../types'

const empty: Paginated<DemandForecast> = {
    data: [],
    total: 0,
    page: 1,
    pageSize: 20,
}

export function useForecasts(initial?: ListParams) {
    const [params, setParams] = useState<ListParams>({
        page: 1,
        pageSize: 10,
        ...initial,
    })
    const [result, setResult] = useState<Paginated<DemandForecast>>(empty)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await apiGetForecasts(params)
            setResult(data)
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to load forecasts'))
            setResult(empty)
        } finally {
            setLoading(false)
        }
    }, [params])

    useEffect(() => {
        void reload()
    }, [reload])

    const create = async (body: CreateDemandForecastInput) => {
        const created = await apiCreateForecast(body)
        await reload()
        return created
    }

    const remove = async (id: string) => {
        await apiDeleteForecast(id)
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
