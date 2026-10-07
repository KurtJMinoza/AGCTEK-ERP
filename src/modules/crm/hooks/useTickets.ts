'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    apiAddTicketComment,
    apiCreateTicket,
    apiGetTicketComments,
    apiGetTickets,
    apiUpdateTicket,
} from '../services/crmApi'
import type {
    CreateTicketInput,
    TicketComment,
    TicketListParams,
    UpdateTicketInput,
} from '../types'
import { usePagedList } from './usePagedList'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'

export function useTickets(initial: TicketListParams = {}) {
    const list = usePagedList(apiGetTickets, initial, 'Failed to load tickets')

    const create = async (body: CreateTicketInput) => {
        const created = await apiCreateTicket(body)
        await list.reload()
        return created
    }

    const update = async (id: string, body: UpdateTicketInput) => {
        const updated = await apiUpdateTicket(id, body)
        await list.reload()
        return updated
    }

    return { ...list, create, update }
}

/** Comments for one ticket; `ticketId = null` keeps the hook idle. */
export function useTicketComments(ticketId: string | null) {
    const [comments, setComments] = useState<TicketComment[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        if (!ticketId) {
            setComments([])
            return
        }
        setLoading(true)
        setError(null)
        try {
            setComments(await apiGetTicketComments(ticketId))
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to load comments'))
        } finally {
            setLoading(false)
        }
    }, [ticketId])

    useEffect(() => {
        void reload()
    }, [reload])

    const add = async (body: string) => {
        if (!ticketId) return
        await apiAddTicketComment(ticketId, body)
        await reload()
    }

    return { comments, loading, error, reload, add }
}
