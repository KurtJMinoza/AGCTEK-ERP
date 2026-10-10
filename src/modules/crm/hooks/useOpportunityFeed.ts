'use client'

import { useCallback, useState } from 'react'
import useSWR from 'swr'
import {
    apiCreateOpportunityNote,
    apiDeleteOpportunityNote,
    apiGetOpportunityFeed,
} from '../services/crmApi'
import type { CrmFeedItem, OpportunityFeedPage } from '../types'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'

const FEED_PAGE_SIZE = 30

/**
 * Odoo-style chatter for one opportunity. The feed revalidates on focus so background stage /
 * owner changes (which write SYSTEM rows server-side) surface without a manual refresh, and is
 * re-fetched after every note mutation. Older pages accumulate under the current page.
 */
export function useOpportunityFeed(opportunityId: string | null | undefined) {
    const key = opportunityId ? ['crm-opportunity-feed', opportunityId] : null
    const { data, error, isLoading, mutate } = useSWR<OpportunityFeedPage>(
        key,
        () =>
            apiGetOpportunityFeed(key![1] as string, { limit: FEED_PAGE_SIZE }),
        { revalidateOnFocus: true },
    )
    const [older, setOlder] = useState<CrmFeedItem[]>([])
    const [loadingMore, setLoadingMore] = useState(false)
    const [loadMoreError, setLoadMoreError] = useState<string | null>(null)

    const reset = useCallback(() => setOlder([]), [])

    const postNote = async (body: string) => {
        if (!opportunityId) return
        await apiCreateOpportunityNote(opportunityId, body.trim())
        reset()
        await mutate()
    }

    const deleteNote = async (noteId: string) => {
        if (!opportunityId) return
        await apiDeleteOpportunityNote(opportunityId, noteId)
        reset()
        await mutate()
    }

    const loadMore = useCallback(async () => {
        if (!opportunityId || !data?.nextCursor || loadingMore) return
        setLoadingMore(true)
        setLoadMoreError(null)
        try {
            const page = await apiGetOpportunityFeed(opportunityId, {
                cursor: data.nextCursor,
                limit: FEED_PAGE_SIZE,
            })
            setOlder((current) => [...current, ...page.data])
        } catch (err) {
            setLoadMoreError(
                getApiErrorMessage(err, 'Unable to load more entries'),
            )
        } finally {
            setLoadingMore(false)
        }
    }, [opportunityId, data?.nextCursor, loadingMore])

    return {
        items: data?.data ?? [],
        older,
        nextCursor: data?.nextCursor ?? null,
        loading: isLoading,
        error: error
            ? getApiErrorMessage(error, 'Unable to load the chatter feed')
            : null,
        loadMoreError,
        loadingMore,
        postNote,
        deleteNote,
        loadMore,
        refresh: () => void mutate(),
    }
}
