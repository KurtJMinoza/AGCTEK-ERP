'use client'

import { useCallback, useEffect, useState } from 'react'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import { apiGetCrmCadence } from '../services/crmApi'
import type { CrmCadence } from '../types'

/** Personal work queue (`GET /crm/dashboard/cadence`). */
export function useCrmCadence() {
    const [data, setData] = useState<CrmCadence | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setData(await apiGetCrmCadence())
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to load my cadence'))
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void reload()
    }, [reload])

    return { data, loading, error, reload }
}
