'use client'

import { useCallback, useEffect, useState } from 'react'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import { apiGetCrmLeadSources } from '../services/crmApi'
import type { CrmLeadSources, DashboardPeriod } from '../types'

/** Lead source mix (`GET /crm/dashboard/lead-sources`). */
export function useCrmLeadSources(days: DashboardPeriod, scope: 'mine' | 'all' = 'all') {
    const [data, setData] = useState<CrmLeadSources | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setData(await apiGetCrmLeadSources({ days, scope }))
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to load lead sources'))
        } finally {
            setLoading(false)
        }
    }, [days, scope])

    useEffect(() => {
        void reload()
    }, [reload])

    return { data, loading, error, reload }
}
