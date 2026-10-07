'use client'

import { useCallback, useEffect, useState } from 'react'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import { apiGetOpportunityQuotations } from '../services/crmApi'
import type { Quotation } from '../types'

const ACTIVE: ReadonlySet<string> = new Set(['DRAFT', 'SENT', 'ACCEPTED'])

/** The opportunity's DRAFT / SENT / ACCEPTED quotation (an overdue one shows `effectiveStatus` EXPIRED). */
export function activeQuotation(quotations: Quotation[]) {
    return quotations.find((q) => ACTIVE.has(q.status)) ?? null
}

/** SD quotations of one opportunity, newest first; no cache, callers reload after changes. */
export function useOpportunityQuotations(opportunityId: string | null | undefined) {
    const [quotations, setQuotations] = useState<Quotation[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    /** True once the first load for this opportunity finished (successfully or not). */
    const [loaded, setLoaded] = useState(false)

    const reload = useCallback(async () => {
        if (!opportunityId) return
        setLoading(true)
        setError(null)
        try {
            setQuotations(await apiGetOpportunityQuotations(opportunityId))
        } catch (err) {
            setError(getApiErrorMessage(err, 'Unable to load quotations'))
        } finally {
            setLoading(false)
            setLoaded(true)
        }
    }, [opportunityId])

    useEffect(() => {
        setQuotations([])
        setLoaded(false)
        void reload()
    }, [reload])

    return { quotations, active: activeQuotation(quotations), loading, loaded, error, reload }
}
