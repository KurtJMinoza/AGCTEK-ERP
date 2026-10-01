'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    apiGetDemandHorizonPresets,
    apiListDemandPlans,
} from '../services/scmApi'
import { getApiErrorMessage } from '../utils/apiError'
import type { DemandHorizonPreset, DemandPlanVersion } from '../types'

export function useDemandPlans() {
    const [plans, setPlans] = useState<DemandPlanVersion[]>([])
    const [presets, setPresets] = useState<DemandHorizonPreset[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const [list, presetList] = await Promise.all([
                apiListDemandPlans(),
                apiGetDemandHorizonPresets(),
            ])
            setPlans(list.data)
            setPresets(presetList)
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to load demand plans'))
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void reload()
    }, [reload])

    return { plans, presets, loading, error, reload }
}
