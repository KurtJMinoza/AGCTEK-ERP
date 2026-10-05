'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGetDemandPastSales } from '../services/scmApi'
import { getApiErrorMessage } from '../utils/apiError'
import type { DemandPastSales, DemandPastSalesQuery } from '../types'

/** Past sales for the plan's products, already bucketed server-side. */
export function useDemandPastSales(
    query: DemandPastSalesQuery | null,
) {
    const [data, setData] = useState<DemandPastSales | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const requestSeq = useRef(0)

    const versionId = query?.versionId
    const locationCode = query?.locationCode
    const bucket = query?.bucket
    const historyLength = query?.historyLength

    const reload = useCallback(async () => {
        if (!bucket || !historyLength) {
            setData(null)
            return
        }
        const seq = ++requestSeq.current
        setLoading(true)
        setError(null)
        try {
            const res = await apiGetDemandPastSales({
                versionId,
                locationCode,
                bucket,
                historyLength,
            })
            if (seq === requestSeq.current) setData(res)
        } catch (err) {
            if (seq !== requestSeq.current) return
            setError(getApiErrorMessage(err, 'Failed to load past sales'))
            setData(null)
        } finally {
            if (seq === requestSeq.current) setLoading(false)
        }
    }, [versionId, locationCode, bucket, historyLength])

    useEffect(() => {
        void reload()
    }, [reload])

    return { data, loading, error, reload }
}
