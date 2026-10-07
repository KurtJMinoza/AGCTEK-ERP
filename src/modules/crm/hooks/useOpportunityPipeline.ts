'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiGetOpportunityPipeline, apiGetOpportunityStages } from '../services/crmApi'
import type {
    OpportunityPipeline,
    OpportunityPipelineParams,
    OpportunityStageMeta,
    OpportunityStagesConfig,
} from '../types'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'

let stagesRequest: Promise<OpportunityStagesConfig> | null = null

/** Stage rules are static server config: fetched once per session, retried after a failure. */
export function useOpportunityStages() {
    const [config, setConfig] = useState<OpportunityStagesConfig | null>(null)

    useEffect(() => {
        let active = true
        stagesRequest ??= apiGetOpportunityStages().catch((err) => {
            stagesRequest = null
            throw err
        })
        stagesRequest.then(
            (value) => active && setConfig(value),
            () => undefined,
        )
        return () => {
            active = false
        }
    }, [])

    const meta = useCallback(
        (stage: string): OpportunityStageMeta | undefined =>
            config?.stages.find((m) => m.stage === stage),
        [config],
    )

    return { config, meta }
}

/** Server-computed open pipeline (amount and weighted amount per stage and currency). */
export function useOpportunityPipeline(params: OpportunityPipelineParams) {
    const [pipeline, setPipeline] = useState<OpportunityPipeline | null>(null)
    const [error, setError] = useState<string | null>(null)
    const { search, customerId, assignedTo } = params

    const reload = useCallback(async () => {
        setError(null)
        try {
            setPipeline(await apiGetOpportunityPipeline({ search, customerId, assignedTo }))
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to load pipeline summary'))
        }
    }, [search, customerId, assignedTo])

    useEffect(() => {
        void reload()
    }, [reload])

    return { pipeline, error, reload }
}
