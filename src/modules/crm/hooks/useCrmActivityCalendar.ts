'use client'

import { useCallback, useEffect, useState } from 'react'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import { apiGetCrmActivityCalendar } from '../services/crmApi'
import type { CrmActivityCalendar } from '../types'

/** Activity calendar feed (`GET /crm/activities`). */
export function useCrmActivityCalendar(
    from: string,
    to: string,
    scope: 'mine' | 'all' = 'mine',
    includeDone = false,
) {
    const [data, setData] = useState<CrmActivityCalendar | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setData(
                await apiGetCrmActivityCalendar({
                    from,
                    to,
                    scope,
                    includeDone: includeDone || undefined,
                }),
            )
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to load activity calendar'))
        } finally {
            setLoading(false)
        }
    }, [from, to, scope, includeDone])

    useEffect(() => {
        void reload()
    }, [reload])

    return { data, loading, error, reload }
}
