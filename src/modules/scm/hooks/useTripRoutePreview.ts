'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiPreviewTripRoute } from '../services/scmApi'
import { getApiErrorMessage } from '../utils/apiError'
import type { RoutePreview, RoutePreviewRequest } from '../types'

const DEBOUNCE_MS = 400

/**
 * Route preview for one READY load plan. No request without a load plan;
 * reorder / departure changes are debounced and stale responses ignored.
 */
export function useTripRoutePreview(
    loadPlanId: string | null | undefined,
    request: RoutePreviewRequest,
) {
    const [preview, setPreview] = useState<RoutePreview | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const requestSeq = useRef(0)
    const requestKey = JSON.stringify(request)

    const load = useCallback(async () => {
        if (!loadPlanId) return
        const seq = ++requestSeq.current
        setLoading(true)
        setError(null)
        try {
            const data = await apiPreviewTripRoute(loadPlanId, JSON.parse(requestKey))
            if (seq === requestSeq.current) setPreview(data)
        } catch (err) {
            if (seq === requestSeq.current) {
                setError(getApiErrorMessage(err, 'Failed to preview route'))
                setPreview(null)
            }
        } finally {
            if (seq === requestSeq.current) setLoading(false)
        }
    }, [loadPlanId, requestKey])

    useEffect(() => {
        if (!loadPlanId) {
            requestSeq.current++
            setPreview(null)
            setError(null)
            setLoading(false)
            return
        }
        const id = window.setTimeout(() => void load(), DEBOUNCE_MS)
        return () => window.clearTimeout(id)
    }, [loadPlanId, load])

    return { preview, loading, error, reload: load }
}
