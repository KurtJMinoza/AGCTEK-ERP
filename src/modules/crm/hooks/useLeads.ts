'use client'

import { apiConvertLead, apiCreateLead, apiGetLeads, apiUpdateLead } from '../services/crmApi'
import type { ConvertLeadInput, CreateLeadInput, LeadListParams, UpdateLeadInput } from '../types'
import { usePagedList } from './usePagedList'

export function useLeads(initial: LeadListParams = {}) {
    const list = usePagedList(apiGetLeads, initial, 'Failed to load leads')

    const create = async (body: CreateLeadInput) => {
        const created = await apiCreateLead(body)
        await list.reload()
        return created
    }

    const update = async (id: string, body: UpdateLeadInput) => {
        const updated = await apiUpdateLead(id, body)
        await list.reload()
        return updated
    }

    const convert = async (id: string, body: ConvertLeadInput) => {
        const result = await apiConvertLead(id, body)
        await list.reload()
        return result
    }

    return { ...list, create, update, convert }
}
