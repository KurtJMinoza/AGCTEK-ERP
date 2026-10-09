'use client'

import { useEffect, useRef, useState } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import StatusBadge from '@/components/shared/StatusBadge'
import useCurrentSession from '@/utils/hooks/useCurrentSession'
import { useOpportunityFeed } from '../../hooks/useOpportunityFeed'
import { formatUserName } from '../../utils/format'
import type { CrmFeedItem, FeedItemType, Opportunity } from '../../types'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'

const ENTRY_LABELS: Record<FeedItemType, string> = {
    NOTE: 'Note',
    SYSTEM: 'System',
    ACTIVITY: 'Activity',
    QUOTATION: 'Quotation',
    SALES_ORDER: 'SD order',
}

export const CHATTER_ANCHOR = 'opportunity-chatter'

type OpportunityChatterProps = {
    opportunity: Opportunity
    canCreate: boolean
    canDelete: boolean
}

/**
 * Odoo-style chatter panel: a note composer on top, then the merged feed
 * (notes, SYSTEM audit, scheduled/completed activities, SD quotations and the
 * sales order link). The activities panel stays separate for scheduled tasks.
 */
export default function OpportunityChatter({
    opportunity,
    canCreate,
    canDelete,
}: OpportunityChatterProps) {
    const { session } = useCurrentSession()
    const currentUserId = session?.user?.id
    const feed = useOpportunityFeed(opportunity.id)
    const [body, setBody] = useState('')
    const [saving, setSaving] = useState(false)
    const [actionError, setActionError] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    const items = [...feed.items, ...feed.older]

    /** Stage / owner / amount edits write SYSTEM rows server-side; surface them on this page. */
    const lastRefreshed = useRef<string | null>(null)
    useEffect(() => {
        if (lastRefreshed.current === null) {
            lastRefreshed.current = opportunity.updatedAt
            return
        }
        if (opportunity.updatedAt !== lastRefreshed.current) {
            lastRefreshed.current = opportunity.updatedAt
            void feed.refresh()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opportunity.updatedAt])

    const submit = async () => {
        if (!body.trim() || !canCreate) return
        setSaving(true)
        setActionError(null)
        try {
            await feed.postNote(body)
            setBody('')
        } catch (err) {
            setActionError(getApiErrorMessage(err, 'Failed to log note'))
        } finally {
            setSaving(false)
        }
    }

    const submitOnEnter = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault()
            void submit()
        }
    }

    const remove = async (note: CrmFeedItem) => {
        setDeletingId(note.id)
        setActionError(null)
        try {
            const noteId = note.id.startsWith('message:')
                ? note.id.slice('message:'.length)
                : note.id
            await feed.deleteNote(noteId)
        } catch (err) {
            setActionError(getApiErrorMessage(err, 'Failed to delete note'))
        } finally {
            setDeletingId(null)
        }
    }

    const ownNote = (item: CrmFeedItem) =>
        item.type === 'NOTE' &&
        Boolean(item.actor?.id) &&
        item.actor?.id === currentUserId

    return (
        <AdaptiveCard className="scroll-mt-24" id={CHATTER_ANCHOR}>
            <h5 className="mb-3">Notes &amp; activity</h5>

            {actionError ? (
                <Alert showIcon type="danger" className="mb-3">
                    {actionError}
                </Alert>
            ) : null}

            {canCreate ? (
                <div className="mb-4">
                    <Input
                        textArea
                        rows={3}
                        maxLength={5000}
                        placeholder="Log note (Ctrl/Cmd + Enter posts)"
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        onKeyDown={submitOnEnter}
                    />
                    <div className="mt-2 flex justify-end">
                        <Button
                            variant="solid"
                            size="sm"
                            loading={saving}
                            disabled={!body.trim()}
                            onClick={() => void submit()}
                        >
                            Log note
                        </Button>
                    </div>
                </div>
            ) : null}

            {feed.loading && items.length === 0 ? (
                <div className="h-24 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700" />
            ) : items.length === 0 ? (
                <p className="text-sm text-gray-500">
                    No notes or activity yet. Log a note to start the record.
                </p>
            ) : (
                <ul className="flex flex-col gap-3">
                    {items.map((item) => (
                        <li
                            key={item.id}
                            className={`rounded-lg border p-3 ${
                                item.type === 'SYSTEM'
                                    ? 'border-transparent bg-gray-50 dark:bg-gray-800/50'
                                    : 'border-gray-200 dark:border-gray-700'
                            }`}
                        >
                            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                                <StatusBadge tone={entryTone(item.type)}>
                                    {ENTRY_LABELS[item.type]}
                                </StatusBadge>
                                <span className="font-medium text-gray-700 dark:text-gray-300">
                                    {formatUserName(item.actor)}
                                </span>
                                <span className="text-gray-500">
                                    {new Date(item.at).toLocaleString()}
                                </span>
                                {ownNote(item) && canDelete ? (
                                    <button
                                        type="button"
                                        className="ml-auto text-gray-400 underline-offset-2 hover:text-red-500 hover:underline"
                                        disabled={deletingId === item.id}
                                        onClick={() => void remove(item)}
                                    >
                                        {deletingId === item.id
                                            ? 'Deleting…'
                                            : 'Delete'}
                                    </button>
                                ) : null}
                            </div>
                            <p
                                className={`whitespace-pre-wrap text-sm ${
                                    item.type === 'SYSTEM'
                                        ? 'italic text-gray-500'
                                        : 'text-gray-800 dark:text-gray-200'
                                }`}
                            >
                                {item.summary}
                            </p>
                        </li>
                    ))}
                </ul>
            )}

            {feed.nextCursor ? (
                <div className="mt-4 flex justify-center">
                    <Button
                        size="sm"
                        loading={feed.loadingMore}
                        disabled={feed.loadingMore}
                        onClick={() => void feed.loadMore()}
                    >
                        Load more
                    </Button>
                </div>
            ) : null}
            {feed.loadMoreError ? (
                <Alert showIcon type="danger" className="mt-3">
                    {feed.loadMoreError}
                </Alert>
            ) : null}
        </AdaptiveCard>
    )
}

function entryTone(type: FeedItemType) {
    switch (type) {
        case 'ACTIVITY':
            return 'info'
        case 'QUOTATION':
            return 'warning'
        case 'SALES_ORDER':
            return 'success'
        case 'SYSTEM':
            return 'default'
        default:
            return 'default'
    }
}
