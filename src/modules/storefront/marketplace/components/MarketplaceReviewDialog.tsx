'use client'

import { useRef, useState } from 'react'
import { Camera, Star, X } from 'lucide-react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Alert from '@/components/ui/Alert'
import Spinner from '@/components/ui/Spinner'
import { Form, FormItem } from '@/components/ui/Form'
import classNames from '@/utils/classNames'
import {
    SHOPPER_REVIEW_MAX_PHOTOS,
    createShopperReview,
    uploadShopperReviewPhoto,
} from '@/services/storefront/retailClientService'

const RATING_LABELS: Record<number, string> = {
    1: 'Poor',
    2: 'Fair',
    3: 'Good',
    4: 'Very good',
    5: 'Excellent',
}

const COMMENT_MAX = 2000

export type ReviewTarget = {
    salesOrderId: string
    orderNumber: string
    salesOrderLineId: string
    productName: string
    variantName?: string
    image: string | null
}

type MarketplaceReviewDialogProps = {
    target: ReviewTarget | null
    token: string
    onClose: () => void
    onSubmitted: (target: ReviewTarget) => void
}

const MarketplaceReviewDialog = ({
    target,
    token,
    onClose,
    onSubmitted,
}: MarketplaceReviewDialogProps) => {
    const [rating, setRating] = useState(0)
    const [hoverRating, setHoverRating] = useState(0)
    const [comment, setComment] = useState('')
    const [photos, setPhotos] = useState<string[]>([])
    const [uploading, setUploading] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const reset = () => {
        setRating(0)
        setHoverRating(0)
        setComment('')
        setPhotos([])
        setFormError(null)
    }

    const close = () => {
        if (submitting) return
        reset()
        onClose()
    }

    const handlePhotos = async (files: FileList | null) => {
        if (!files?.length) return
        const room = SHOPPER_REVIEW_MAX_PHOTOS - photos.length
        const picked = Array.from(files).slice(0, room)
        setUploading(true)
        setFormError(null)
        try {
            for (const file of picked) {
                const url = await uploadShopperReviewPhoto(token, file)
                setPhotos((prev) => [...prev, url])
            }
            if (files.length > room) {
                setFormError(
                    `You can attach up to ${SHOPPER_REVIEW_MAX_PHOTOS} photos.`,
                )
            }
        } catch (err) {
            setFormError(
                err instanceof Error ? err.message : 'Unable to upload photo',
            )
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const submit = async () => {
        if (!target) return
        if (rating < 1) {
            setFormError('Choose a star rating.')
            return
        }
        if (!comment.trim()) {
            setFormError('Tell other shoppers what you think of this product.')
            return
        }
        setSubmitting(true)
        setFormError(null)
        try {
            await createShopperReview(token, {
                salesOrderId: target.salesOrderId,
                salesOrderLineId: target.salesOrderLineId,
                rating,
                comment: comment.trim(),
                imageUrls: photos.length ? photos : undefined,
            })
            reset()
            onSubmitted(target)
        } catch (err) {
            setFormError(
                err instanceof Error ? err.message : 'Unable to submit your review',
            )
        } finally {
            setSubmitting(false)
        }
    }

    const shownRating = hoverRating || rating

    return (
        <Dialog
            isOpen={target !== null}
            width={560}
            onClose={close}
            onRequestClose={close}
        >
            {target ? (
                <div className="p-6">
                    <h2 className="mb-1 text-lg font-semibold heading-text">
                        Rate &amp; review
                    </h2>
                    <p className="mb-4 text-sm text-gray-500">
                        Order {target.orderNumber} · only items you received can
                        be reviewed.
                    </p>

                    <div className="mb-5 flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3">
                        {target.image ? (
                            <img
                                src={target.image}
                                alt=""
                                className="h-14 w-14 shrink-0 rounded-lg border border-gray-100 object-cover"
                            />
                        ) : null}
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900">
                                {target.productName}
                            </p>
                            {target.variantName ? (
                                <p className="truncate text-xs text-gray-500">
                                    {target.variantName}
                                </p>
                            ) : null}
                        </div>
                    </div>

                    {formError ? (
                        <Alert showIcon type="danger" className="mb-4">
                            {formError}
                        </Alert>
                    ) : null}

                    <Form
                        onSubmit={(e) => {
                            e.preventDefault()
                            void submit()
                        }}
                    >
                        <FormItem label="Your rating">
                            <div
                                className="flex items-center gap-3"
                                onMouseLeave={() => setHoverRating(0)}
                            >
                                <div
                                    className="flex items-center gap-1"
                                    role="radiogroup"
                                    aria-label="Star rating"
                                >
                                    {[1, 2, 3, 4, 5].map((star) => (
                                        <button
                                            key={star}
                                            type="button"
                                            role="radio"
                                            aria-checked={rating === star}
                                            aria-label={`${star} star${star === 1 ? '' : 's'}`}
                                            className="rounded p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-shop-500"
                                            onMouseEnter={() => setHoverRating(star)}
                                            onClick={() => setRating(star)}
                                        >
                                            <Star
                                                aria-hidden
                                                className={classNames(
                                                    'h-8 w-8 transition-colors',
                                                    star <= shownRating
                                                        ? 'fill-amber-400 text-amber-400'
                                                        : 'text-gray-300',
                                                )}
                                            />
                                        </button>
                                    ))}
                                </div>
                                <span className="text-sm font-medium text-gray-600">
                                    {shownRating ? RATING_LABELS[shownRating] : ''}
                                </span>
                            </div>
                        </FormItem>

                        <FormItem label="Your review">
                            <textarea
                                value={comment}
                                maxLength={COMMENT_MAX}
                                onChange={(e) => setComment(e.target.value)}
                                rows={4}
                                placeholder="How was the quality, packaging and delivery?"
                                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-shop-500 focus:outline-none focus:ring-1 focus:ring-shop-500"
                            />
                            <p className="mt-1 text-right text-xs text-gray-400">
                                {comment.length}/{COMMENT_MAX}
                            </p>
                        </FormItem>

                        <FormItem
                            label={`Photos (optional, up to ${SHOPPER_REVIEW_MAX_PHOTOS})`}
                        >
                            <div className="flex flex-wrap gap-2">
                                {photos.map((url) => (
                                    <div key={url} className="relative">
                                        <img
                                            src={url}
                                            alt="Review photo"
                                            className="h-20 w-20 rounded-lg border border-gray-100 object-cover"
                                        />
                                        <button
                                            type="button"
                                            aria-label="Remove photo"
                                            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900/80 text-white"
                                            onClick={() =>
                                                setPhotos((prev) =>
                                                    prev.filter((p) => p !== url),
                                                )
                                            }
                                        >
                                            <X aria-hidden className="h-3 w-3" />
                                        </button>
                                    </div>
                                ))}
                                {photos.length < SHOPPER_REVIEW_MAX_PHOTOS ? (
                                    <button
                                        type="button"
                                        disabled={uploading}
                                        onClick={() => fileInputRef.current?.click()}
                                        className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 transition-colors hover:border-shop-500 hover:text-shop-600 disabled:opacity-60"
                                    >
                                        {uploading ? (
                                            <Spinner size={18} />
                                        ) : (
                                            <Camera aria-hidden className="h-5 w-5" />
                                        )}
                                        {uploading ? 'Uploading' : 'Add photo'}
                                    </button>
                                ) : null}
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                accept="image/png,image/jpeg,image/webp,image/gif"
                                className="hidden"
                                onChange={(e) => void handlePhotos(e.target.files)}
                            />
                        </FormItem>

                        <div className="mt-5 flex justify-end gap-2">
                            <Button type="button" variant="plain" onClick={close}>
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                variant="solid"
                                disabled={submitting || uploading}
                            >
                                {submitting ? (
                                    <Spinner size={16} className="mr-2" />
                                ) : null}
                                Submit review
                            </Button>
                        </div>
                    </Form>
                </div>
            ) : null}
        </Dialog>
    )
}

export default MarketplaceReviewDialog
