'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiGetCrmDashboard } from '../services/crmApi'
import type { CrmDashboard, DashboardPeriod } from '../types'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'

/** One server summary (`GET /crm/dashboard`); `days` only affects win/loss and lead conversion. */
export function useCrmDashboard(days: DashboardPeriod) {
    const [data, setData] = useState<CrmDashboard | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setData(await apiGetCrmDashboard(days))
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to load CRM dashboard'))
        } finally {
            setLoading(false)
        }
    }, [days])

    useEffect(() => {
        void reload()
    }, [reload])

    return { data, loading, error, reload }
}
