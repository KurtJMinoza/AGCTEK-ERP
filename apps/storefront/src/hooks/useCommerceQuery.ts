import { useCallback, useEffect, useRef, useState } from 'react'
import { commerceApi } from '../api/client'
import type { CommerceApi } from '../api/commerceApi'

export type QueryState<T> = {
    data: T | null
    loading: boolean
    refreshing: boolean
    error: string | null
    refresh: () => Promise<void>
}

/**
 * Runs a read against `commerceApi` and re-runs when `deps` change.
 * Stale responses from earlier deps are discarded.
 */
export function useCommerceQuery<T>(
    fetcher: (api: CommerceApi) => Promise<T>,
    deps: readonly unknown[],
): QueryState<T> {
    const [data, setData] = useState<T | null>(null)
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const requestId = useRef(0)

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const run = useCallback(() => fetcher(commerceApi), deps)

    const load = useCallback(
        async (mode: 'initial' | 'refresh') => {
            const id = ++requestId.current
            if (mode === 'initial') setLoading(true)
            else setRefreshing(true)
            setError(null)
            try {
                const result = await run()
                if (id === requestId.current) setData(result)
            } catch (e) {
                if (id === requestId.current) {
                    setError(e instanceof Error ? e.message : 'Something went wrong')
                }
            } finally {
                if (id === requestId.current) {
                    setLoading(false)
                    setRefreshing(false)
                }
            }
        },
        [run],
    )

    useEffect(() => {
        void load('initial')
    }, [load])

    const refresh = useCallback(() => load('refresh'), [load])

    return { data, loading, refreshing, error, refresh }
}
