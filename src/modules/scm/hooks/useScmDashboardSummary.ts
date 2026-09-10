'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiGetScmDashboardSummary } from '../services/scmApi'
import type { ScmDashboardSummary } from '../types'

export function useScmDashboardSummary() {
    const [summary, setSummary] = useState<ScmDashboardSummary | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await apiGetScmDashboardSummary()
            setSummary(data)
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Failed to load dashboard summary',
            )
            setSummary(null)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void reload()
    }, [reload])

    return { summary, loading, error, reload }
}
