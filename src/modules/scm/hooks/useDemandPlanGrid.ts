'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGetDemandPlan, apiGetDemandPlanGrid } from '../services/scmApi'
import { getApiErrorMessage } from '../utils/apiError'
import type {
    DemandPlanDetail,
    DemandPlanGrid,
    DemandPlanGridQuery,
} from '../types'

/**
 * Loads plan header + the server-aggregated grid for the selected horizon scope.
 * Every horizon/location/compare change is a new server request — no client pivot.
 */
export function useDemandPlanGrid(
    versionId: string | null,
    query: DemandPlanGridQuery,
) {
    const [detail, setDetail] = useState<DemandPlanDetail | null>(null)
    const [grid, setGrid] = useState<DemandPlanGrid | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const requestSeq = useRef(0)

    const { horizonKind, locationCode, compareVersionId, chartDensity } = query

    const reload = useCallback(async () => {
        if (!versionId) {
            setDetail(null)
            setGrid(null)
            return
        }
        const seq = ++requestSeq.current
        setLoading(true)
        setError(null)
        try {
            const [d, g] = await Promise.all([
                apiGetDemandPlan(versionId),
                apiGetDemandPlanGrid(versionId, {
                    horizonKind,
                    locationCode,
                    compareVersionId,
                    chartDensity,
                }),
            ])
            if (seq !== requestSeq.current) return
            setDetail(d)
            setGrid(g)
        } catch (err) {
            if (seq !== requestSeq.current) return
            setError(getApiErrorMessage(err, 'Failed to load demand plan'))
            setGrid(null)
        } finally {
            if (seq === requestSeq.current) setLoading(false)
        }
    }, [versionId, horizonKind, locationCode, compareVersionId, chartDensity])

    useEffect(() => {
        void reload()
    }, [reload])

    /** Apply a payload returned by a mutation (e.g. generate-forecast) without a second GET. */
    const applyPayload = useCallback(
        (d: DemandPlanDetail, g: DemandPlanGrid) => {
            requestSeq.current += 1
            setDetail(d)
            setGrid(g)
            setError(null)
            setLoading(false)
        },
        [],
    )

    return { detail, grid, loading, error, reload, applyPayload }
}
