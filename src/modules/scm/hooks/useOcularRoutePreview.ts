'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGetOcularRoutePreview } from '../services/scmApi'
import { getApiErrorMessage } from '../utils/apiError'
import type { DepartureMode, OcularRoutePreview } from '../types'

const DEBOUNCE_MS = 400

export type OcularRoutePreviewRequest = {
    departureMode?: DepartureMode
    /** ISO instant overriding the start used for the schedule */
    departAt?: string
    /** Add the drive back to the first pickup (default on in the API) */
    returnToOrigin?: boolean
}

/**
 * Route preview for one ocular trip (stops in manual order). No request without a trip;
 * request changes are debounced, bump `version` after the plan changes to refetch, and
 * stale responses are ignored.
 */
export function useOcularRoutePreview(
    tripId: string | null | undefined,
    version = 0,
    request: OcularRoutePreviewRequest = {},
) {
    const [preview, setPreview] = useState<OcularRoutePreview | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const requestSeq = useRef(0)
    const requestKey = JSON.stringify(request)

    const load = useCallback(async () => {
        if (!tripId) return
        const seq = ++requestSeq.current
        setLoading(true)
        setError(null)
        try {
            const data = await apiGetOcularRoutePreview(tripId, JSON.parse(requestKey))
            if (seq === requestSeq.current) setPreview(data)
        } catch (err) {
            if (seq === requestSeq.current) {
                setError(getApiErrorMessage(err, 'Failed to preview route'))
                setPreview(null)
            }
        } finally {
            if (seq === requestSeq.current) setLoading(false)
        }
    }, [tripId, requestKey])

    useEffect(() => {
        if (!tripId) {
            requestSeq.current++
            setPreview(null)
            setError(null)
            setLoading(false)
            return
        }
        const id = window.setTimeout(() => void load(), DEBOUNCE_MS)
        return () => window.clearTimeout(id)
    }, [tripId, version, load])

    return { preview, loading, error, reload: load }
}
