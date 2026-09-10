'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    apiGetPlanningSettings,
    apiUpdatePlanningSettings,
} from '../services/scmApi'
import type { PlanningBucketSize, ScmPlanningSettings } from '../types'

export function usePlanningSettings() {
    const [settings, setSettings] = useState<ScmPlanningSettings | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await apiGetPlanningSettings()
            setSettings(data)
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Failed to load planning settings',
            )
            setSettings(null)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void reload()
    }, [reload])

    const save = useCallback(
        async (body: {
            horizonWeeks: number
            bucketSize: PlanningBucketSize
            frozenZoneDays: number
        }) => {
            setSaving(true)
            setError(null)
            try {
                const data = await apiUpdatePlanningSettings(body)
                setSettings(data)
                return data
            } catch (err) {
                const message =
                    err instanceof Error
                        ? err.message
                        : 'Failed to save planning settings'
                setError(message)
                throw err
            } finally {
                setSaving(false)
            }
        },
        [],
    )

    return { settings, loading, saving, error, reload, save }
}
