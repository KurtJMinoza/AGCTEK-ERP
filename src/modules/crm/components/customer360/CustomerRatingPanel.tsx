'use client'

import { useState } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import { formatDate } from '../../utils/format'
import type { CustomerRating, CustomerRatingEvent, Customer360SectionState } from '../../types'

function Stars({ stars, size = 'md' }: { stars: number; size?: 'sm' | 'md' }) {
    const cls = size === 'sm' ? 'text-sm' : 'text-lg'
    return (
        <span className={`inline-flex tracking-tight text-amber-500 ${cls}`} aria-label={`${stars} of 5 stars`}>
            {'★★★★★'.slice(0, stars)}
            <span className="text-gray-300 dark:text-gray-600">{'★★★★★'.slice(stars)}</span>
        </span>
    )
}

function SectionNotice({ state }: { state: Exclude<Customer360SectionState, { status: 'ok' }> }) {
    return (
        <Alert showIcon type={state.status === 'unavailable' ? 'warning' : 'info'}>
            {state.message}
        </Alert>
    )
}

export default function CustomerRatingPanel({
    rating,
    history,
    historyState,
    canRate,
    onRate,
}: {
    rating: CustomerRating | null
    history: CustomerRatingEvent[]
    historyState?: Customer360SectionState
    canRate: boolean
    onRate: (input: { stars: number; comment?: string }) => Promise<void>
}) {
    const [open, setOpen] = useState(false)
    const [stars, setStars] = useState(rating?.stars ?? 5)
    const [comment, setComment] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const openDialog = () => {
        setStars(rating?.stars ?? 5)
        setComment('')
        setError(null)
        setOpen(true)
    }

    const submit = async () => {
        setSaving(true)
        setError(null)
        try {
            await onRate({ stars, comment: comment.trim() || undefined })
            setOpen(false)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unable to save rating')
        } finally {
            setSaving(false)
        }
    }

    return (
        <>
            <AdaptiveCard className="mb-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h5 className="mb-1">Relationship rating</h5>
                        {rating ? (
                            <div className="flex flex-wrap items-center gap-2">
                                <Stars stars={rating.stars} />
                                <span className="text-sm tabular-nums text-gray-600 dark:text-gray-300">
                                    {rating.stars}/5
                                </span>
                                {rating.ratedAt ? (
                                    <span className="text-xs text-gray-500">
                                        Updated {formatDate(rating.ratedAt)}
                                    </span>
                                ) : null}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500">No rating yet</p>
                        )}
                    </div>
                    {canRate ? (
                        <Button size="sm" variant="solid" onClick={openDialog}>
                            {rating ? 'Update rating' : 'Rate customer'}
                        </Button>
                    ) : null}
                </div>

                {historyState && historyState.status !== 'ok' ? (
                    <div className="mt-3">
                        <SectionNotice state={historyState} />
                    </div>
                ) : history.length > 0 ? (
                    <ul className="mt-4 space-y-2 border-t border-gray-100 pt-3 text-sm dark:border-gray-700">
                        {history.slice(0, 10).map((row) => (
                            <li key={row.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <Stars stars={row.stars} size="sm" />
                                <span className="tabular-nums text-gray-700 dark:text-gray-200">
                                    Rating set to {row.stars}/5
                                </span>
                                {row.comment ? (
                                    <span className="text-gray-500">— {row.comment}</span>
                                ) : null}
                                <span className="text-xs text-gray-400">{formatDate(row.ratedAt)}</span>
                            </li>
                        ))}
                    </ul>
                ) : null}
            </AdaptiveCard>

            <Dialog
                isOpen={open}
                onClose={() => setOpen(false)}
                onRequestClose={() => setOpen(false)}
                width={420}
            >
                <h5 className="mb-3">{rating ? 'Update rating' : 'Rate customer'}</h5>
                <p className="mb-3 text-sm text-gray-500">Internal relationship rating (1–5). Does not affect loyalty.</p>
                <div className="mb-4 flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                        <button
                            key={n}
                            type="button"
                            className={`h-9 w-9 rounded text-lg ${
                                n <= stars
                                    ? 'bg-amber-50 text-amber-500 dark:bg-amber-500/10'
                                    : 'bg-gray-50 text-gray-300 dark:bg-gray-800 dark:text-gray-600'
                            }`}
                            aria-label={`${n} stars`}
                            onClick={() => setStars(n)}
                        >
                            ★
                        </button>
                    ))}
                </div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Comment (optional)</label>
                <Input
                    textArea
                    rows={3}
                    value={comment}
                    placeholder="Why this rating?"
                    onChange={(e) => setComment(e.target.value)}
                />
                {error ? (
                    <Alert showIcon type="danger" className="mt-3">
                        {error}
                    </Alert>
                ) : null}
                <div className="mt-4 flex justify-end gap-2">
                    <Button onClick={() => setOpen(false)}>Cancel</Button>
                    <Button variant="solid" loading={saving} onClick={() => void submit()}>
                        Save
                    </Button>
                </div>
            </Dialog>
        </>
    )
}
