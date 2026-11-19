'use client'

import { useCallback, useEffect, useState } from 'react'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import { apiGetCrmPipelineMetrics } from '../services/crmApi'
import type { CrmPipelineMetrics, DashboardPeriod } from '../types'

/** Open funnel + win rate (`GET /crm/dashboard/pipeline`). */
export function useCrmPipelineMetrics(days: DashboardPeriod, scope: 'mine' | 'all' = 'all') {
    const [data, setData] = useState<CrmPipelineMetrics | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setData(await apiGetCrmPipelineMetrics({ days, scope }))
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to load pipeline metrics'))
        } finally {
            setLoading(false)
        }
    }, [days, scope])

    useEffect(() => {
        void reload()
    }, [reload])

    return { data, loading, error, reload }
}
