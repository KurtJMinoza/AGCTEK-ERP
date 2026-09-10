'use client'

import { useState, useEffect, useCallback } from 'react'

export type QueryListMeta = {
    total: number
    page: number
    limit: number
    totalPages: number
}

export type QueryListResponse<T> = {
    data: T[]
    meta: QueryListMeta
}

const EMPTY_META: QueryListMeta = {
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
}

/**
 * Fetches paginated list data whenever `params` changes.
 * Pass a memoized params object from the page (search, filters, page, limit).
 */
export function useQueryList<T, P>(
    fetcher: (params: P) => Promise<QueryListResponse<T>>,
    params: P,
    resourceLabel = 'records',
) {
    const [data, setData] = useState<T[]>([])
    const [meta, setMeta] = useState<QueryListMeta>(EMPTY_META)
    const [loading, setLoading] = useState(true)

    const refresh = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetcher(params)
            setData(res.data)
            setMeta(res.meta)
        } catch (err) {
            console.error(`Failed to fetch ${resourceLabel}`, err)
            setData([])
            setMeta(EMPTY_META)
        } finally {
            setLoading(false)
        }
    }, [fetcher, params, resourceLabel])

    useEffect(() => {
        refresh()
    }, [refresh])

    return { data, meta, loading, refresh }
}
