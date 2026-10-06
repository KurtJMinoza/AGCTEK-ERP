'use client'

import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import {
    apiGetOpportunity,
    apiGetOpportunitySalesOrder,
    apiUpdateOpportunity,
} from '../services/crmApi'
import type { LinkedSalesOrder, Opportunity, UpdateOpportunityInput } from '../types'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'

/** One opportunity for the workspace; no client cache, so callers reload after changes. */
export function useOpportunity(id: string) {
    const [opportunity, setOpportunity] = useState<Opportunity | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [notFound, setNotFound] = useState(false)

    const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setOpportunity(await apiGetOpportunity(id))
            setNotFound(false)
        } catch (err) {
            if (axios.isAxiosError(err) && err.response?.status === 404) setNotFound(true)
            else setError(getApiErrorMessage(err, 'Failed to load opportunity'))
        } finally {
            setLoading(false)
        }
    }, [id])

    useEffect(() => {
        void reload()
    }, [reload])

    /** PATCH returns the detail payload (owner + next activity), so no extra read is needed. */
    const update = async (body: UpdateOpportunityInput) => {
        const updated = await apiUpdateOpportunity(id, body)
        setOpportunity(updated)
        return updated
    }

    return { opportunity, loading, error, notFound, reload, update }
}

/** Read-only summary of the linked SD order (SD owns it); idle until `sdSalesOrderId` is set. */
export function useLinkedSalesOrder(opportunityId: string, sdSalesOrderId: string | null | undefined) {
    const [order, setOrder] = useState<LinkedSalesOrder | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        setOrder(null)
        setError(null)
        if (!sdSalesOrderId) return
        let active = true
        apiGetOpportunitySalesOrder(opportunityId)
            .then((row) => active && setOrder(row))
            .catch((err) => active && setError(getApiErrorMessage(err, 'Unable to load the SD order')))
        return () => {
            active = false
        }
    }, [opportunityId, sdSalesOrderId])

    return { order, error }
}
