'use client'

import { useEffect, useState } from 'react'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import { FormItem } from '@/components/ui/Form'
import Input from '@/components/ui/Input'
import type { RateCustomerInput } from '../../types'

type Props = {
    isOpen: boolean
    saving?: boolean
    initialStars?: number | null
    onClose: () => void
    onSubmit: (input: RateCustomerInput) => void | Promise<void>
}

const STARS = [1, 2, 3, 4, 5] as const

/** Set/change the CRM relationship rating (1–5 whole stars + optional comment). */
export default function CustomerRatingDialog({
    isOpen,
    saving,
    initialStars,
    onClose,
    onSubmit,
}: Props) {
    const [stars, setStars] = useState(initialStars && initialStars >= 1 ? initialStars : 5)
    const [comment, setComment] = useState('')
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!isOpen) return
        setStars(initialStars && initialStars >= 1 ? initialStars : 5)
        setComment('')
        setError(null)
    }, [isOpen, initialStars])

    const submit = async () => {
        if (stars < 1 || stars > 5) {
            setError('Choose a rating from 1 to 5 stars')
            return
        }
        setError(null)
        await onSubmit({ stars, comment: comment.trim() || undefined })
    }

    return (
        <Dialog isOpen={isOpen} width={420} onClose={onClose} onRequestClose={onClose}>
            <h5>Rate customer</h5>
            <p className="mt-1 text-sm text-gray-500">
                Internal relationship rating only — separate from loyalty points.
            </p>
            <FormItem className="mt-4" label="Stars" asterisk>
                <div className="flex gap-1">
                    {STARS.map((value) => (
                        <button
                            key={value}
                            type="button"
                            className={`text-2xl leading-none ${
                                value <= stars ? 'text-amber-400' : 'text-gray-300'
                            }`}
                            aria-label={`${value} star${value === 1 ? '' : 's'}`}
                            onClick={() => setStars(value)}
                        >
                            ★
                        </button>
                    ))}
                    <span className="ml-2 self-center text-sm tabular-nums text-gray-600">
                        {stars}/5
                    </span>
                </div>
            </FormItem>
            <FormItem label="Comment (optional)">
                <Input
                    textArea
                    rows={3}
                    value={comment}
                    placeholder="Why this rating?"
                    onChange={(e) => setComment(e.target.value)}
                />
            </FormItem>
            {error ? <p className="mb-2 text-sm text-red-500">{error}</p> : null}
            <div className="mt-2 flex justify-end gap-2">
                <Button size="sm" disabled={saving} onClick={onClose}>
                    Cancel
                </Button>
                <Button size="sm" variant="solid" loading={saving} onClick={() => void submit()}>
                    Save rating
                </Button>
            </div>
        </Dialog>
    )
}
