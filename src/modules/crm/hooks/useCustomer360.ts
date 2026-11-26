'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    apiCreateOpportunity,
    apiCreateTicket,
    apiGetCustomer360,
    apiRateCustomer,
    apiUpdateOpportunity,
    apiUpdateTicket,
} from '../services/crmApi'
import type {
    CreateOpportunityInput,
    CreateTicketInput,
    Customer360,
    RateCustomerInput,
    UpdateOpportunityInput,
    UpdateTicketInput,
} from '../types'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'

/** Customer 360 read model; every mutation reloads it so summary counts stay server-derived. */
export function useCustomer360(customerId: string) {
    const [data, setData] = useState<Customer360 | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        if (!customerId) return
        setLoading(true)
        setError(null)
        try {
            setData(await apiGetCustomer360(customerId))
        } catch (err) {
            setData(null)
            setError(getApiErrorMessage(err, 'Failed to load customer'))
        } finally {
            setLoading(false)
        }
    }, [customerId])

    useEffect(() => {
        void reload()
    }, [reload])

    const createOpportunity = async (body: CreateOpportunityInput) => {
        const created = await apiCreateOpportunity(body)
        await reload()
        return created
    }

    const updateOpportunity = async (id: string, body: UpdateOpportunityInput) => {
        const updated = await apiUpdateOpportunity(id, body)
        await reload()
        return updated
    }

    const createTicket = async (body: CreateTicketInput) => {
        const created = await apiCreateTicket(body)
        await reload()
        return created
    }

    const updateTicket = async (id: string, body: UpdateTicketInput) => {
        const updated = await apiUpdateTicket(id, body)
        await reload()
        return updated
    }

    const rateCustomer = async (body: RateCustomerInput) => {
        const created = await apiRateCustomer(customerId, body)
        await reload()
        return created
    }

    return {
        data,
        loading,
        error,
        reload,
        createOpportunity,
        updateOpportunity,
        createTicket,
        updateTicket,
        rateCustomer,
    }
}