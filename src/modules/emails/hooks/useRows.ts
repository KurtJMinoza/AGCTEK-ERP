'use client'

import { useEffect, useState } from 'react'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
type Loaded<T> = { key: number; rows: T[]; error: string | null }

/** Loads `load()` whenever `refresh` changes; state is only set from the promise. */
export function useRows<T>(
    load: () => Promise<T[]>,
    refresh: number,
    fallback: string,
) {
    const [result, setResult] = useState<Loaded<T> | null>(null)
    useEffect(() => {
        let active = true
        load()
            .then(
                (rows) =>
                    active && setResult({ key: refresh, rows, error: null }),
            )
            .catch(
                (err) =>
                    active &&
                    setResult({
                        key: refresh,
                        rows: [],
                        error: getApiErrorMessage(err, fallback),
                    }),
            )
        return () => {
            active = false
        }
        // `load` is a stable module function.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refresh])
    return result?.key === refresh ? result : null
}
