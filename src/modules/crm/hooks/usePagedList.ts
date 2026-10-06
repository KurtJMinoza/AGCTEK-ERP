'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Paginated, PageParams } from '../types'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'

/** SCM-style list state: params + reload, no client cache. */
export function usePagedList<T, P extends PageParams>(
    fetcher: (params: P) => Promise<Paginated<T>>,
    initial: P,
    errorMessage: string,
) {
    const [params, setParams] = useState<P>({ page: 1, pageSize: 10, ...initial })
    const [result, setResult] = useState<Paginated<T>>({
        data: [],
        total: 0,
        page: 1,
        pageSize: params.pageSize ?? 10,
    })
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setResult(await fetcher(params))
        } catch (err) {
            setError(getApiErrorMessage(err, errorMessage))
            setResult((current) => ({ ...current, data: [], total: 0 }))
        } finally {
            setLoading(false)
        }
    }, [fetcher, params, errorMessage])

    useEffect(() => {
        void reload()
    }, [reload])

    return { ...result, loading, error, params, setParams, reload }
}
