'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiCompleteActivity, apiCreateActivity, apiGetActivities } from '../services/crmApi'
import type { Activity, ActivityParent, CreateActivityInput } from '../types'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'

/** Activities for one opportunity or ticket; `parent = null` keeps the hook idle. */
export function useActivities(parent: ActivityParent | null) {
    const kind = parent?.kind ?? null
    const id = parent?.id ?? null
    const [activities, setActivities] = useState<Activity[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        if (!kind || !id) {
            setActivities([])
            return
        }
        setLoading(true)
        setError(null)
        try {
            setActivities(await apiGetActivities({ kind, id }))
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to load activities'))
        } finally {
            setLoading(false)
        }
    }, [kind, id])

    useEffect(() => {
        void reload()
    }, [reload])

    const create = async (body: CreateActivityInput) => {
        if (!kind || !id) return
        await apiCreateActivity({ kind, id }, body)
        await reload()
    }

    const complete = async (activityId: string, next?: CreateActivityInput) => {
        if (!kind || !id) return
        await apiCompleteActivity({ kind, id }, activityId, next)
        await reload()
    }

    return { activities, loading, error, reload, create, complete }
}
