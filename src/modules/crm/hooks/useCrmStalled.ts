'use client'

import { useCallback, useEffect, useState } from 'react'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import { apiGetCrmStalled } from '../services/crmApi'
import {
    STALL_DEFAULT_THRESHOLD_DAYS,
    type CrmStalled,
} from '../types'

/** Stalled open opportunities (`GET /crm/dashboard/stalled`). */
export function useCrmStalled(
    scope: 'mine' | 'all' = 'all',
    thresholdDays = STALL_DEFAULT_THRESHOLD_DAYS,
) {
    const [data, setData] = useState<CrmStalled | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setData(await apiGetCrmStalled({ scope, thresholdDays }))
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to load stalled opportunities'))
        } finally {
            setLoading(false)
        }
    }, [scope, thresholdDays])

    useEffect(() => {
        void reload()
    }, [reload])

    return { data, loading, error, reload }
}
