'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

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
 * Debounce a value — cuts keystroke-driven list refetches across MM pages.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
    const [debounced, setDebounced] = useState(value)
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delayMs)
        return () => clearTimeout(t)
    }, [value, delayMs])
    return debounced
}

/**
 * Fetches paginated list data whenever `params` changes.
 * Pass a memoized params object from the page (search, filters, page, limit).
 * Optional `debounceMs` delays refetch when params change (default 300ms after first load).
 */
export function useQueryList<T, P>(
    fetcher: (params: P) => Promise<QueryListResponse<T>>,
    params: P,
    resourceLabel = 'records',
    debounceMs = 300,
) {
    const [data, setData] = useState<T[]>([])
    const [meta, setMeta] = useState<QueryListMeta>(EMPTY_META)
    const [loading, setLoading] = useState(true)
    const firstLoad = useRef(true)
    const requestId = useRef(0)

    const refresh = useCallback(async () => {
        const id = ++requestId.current
        setLoading(true)
        try {
            const res = await fetcher(params)
            if (id !== requestId.current) return
            setData(res.data)
            setMeta(res.meta)
        } catch (err) {
            if (id !== requestId.current) return
            console.error(`Failed to fetch ${resourceLabel}`, err)
            setData([])
            setMeta(EMPTY_META)
        } finally {
            if (id === requestId.current) setLoading(false)
        }
    }, [fetcher, params, resourceLabel])

    useEffect(() => {
        if (firstLoad.current || debounceMs <= 0) {
            firstLoad.current = false
            void refresh()
            return
        }
        const t = setTimeout(() => {
            void refresh()
        }, debounceMs)
        return () => clearTimeout(t)
    }, [refresh, debounceMs])

    return { data, meta, loading, refresh }
}
