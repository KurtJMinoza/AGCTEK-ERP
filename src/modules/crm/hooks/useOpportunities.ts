'use client'

import {
    apiCreateOpportunity,
    apiGetOpportunities,
    apiUpdateOpportunity,
} from '../services/crmApi'
import type {
    CreateOpportunityInput,
    OpportunityListParams,
    UpdateOpportunityInput,
} from '../types'
import { usePagedList } from './usePagedList'

export function useOpportunities(initial: OpportunityListParams = {}) {
    const list = usePagedList(apiGetOpportunities, initial, 'Failed to load opportunities')

    const create = async (body: CreateOpportunityInput) => {
        const created = await apiCreateOpportunity(body)
        await list.reload()
        return created
    }

    const update = async (id: string, body: UpdateOpportunityInput) => {
        const updated = await apiUpdateOpportunity(id, body)
        await list.reload()
        return updated
    }

    return { ...list, create, update }
}
