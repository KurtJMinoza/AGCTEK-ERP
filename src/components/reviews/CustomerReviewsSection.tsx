'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Image from 'next/image'
import {
    Star,
    Camera,
    Upload,
    X,
    CheckCircle2,
    MessageSquare,
    Loader2,
    Sparkles,
    ShieldCheck,
    ZoomIn,
} from 'lucide-react'

export interface ReviewItem {
    id: string
    productId: string
    userId: string
    rating: number
    comment: string
    imageUrls: string[]
    createdAt: string
    user?: {
        id: string
        firstName: string
        lastName: string
        userName: string
        avatar: string
    }
    /** Storefront shopper who reviewed from My Orders. */
    retailClient?: { id: string; fullName: string | null } | null
}

interface CustomerReviewsSectionProps {
    productId: string
    productName?: string
    className?: string
    canReview?: boolean
    initialReviews?: ReviewItem[]
    /** Shown instead of "Write a Review" when the viewer cannot review here. */
    reviewHint?: React.ReactNode
}

const RATING_LABELS: Record<number, string> = {
    1: 'Poor',
    2: 'Fair',
    3: 'Good',
    4: 'Very Good',
    5: 'Excellent',
}

export default function CustomerReviewsSection({
    productId,
    productName = 'Product',
    className = '',
    canReview,
    initialReviews,
    reviewHint,
}: CustomerReviewsSectionProps) {
    const [reviews, setReviews] = useState<ReviewItem[]>(initialReviews || [])
    const [loading, setLoading] = useState(!initialReviews)
    const [error, setError] = useState<string | null>(null)
    const [isEligible, setIsEligible] = useState<boolean>(canReview ?? false)
    const [selectedRating, setSelectedRating] = useState<number | null>(null)

    useEffect(() => {
        if (canReview !== undefined) {
            setIsEligible(canReview)
            return
        }
        let mounted = true
        fetch(`/api/reviews/eligibility?productId=${encodeURIComponent(productId)}`)
            .then((r) => (r.ok ? r.json() : { eligible: false }))
            .then((data) => {
                if (mounted) setIsEligible(data.eligible === true)
            })
            .catch(() => {
                if (mounted) setIsEligible(false)
            })
        return () => {
            mounted = false
        }
    }, [productId, canReview])

    // Review submission modal state
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [rating, setRating] = useState(5)
    const [hoverRating, setHoverRating] = useState<number | null>(null)
    const [comment, setComment] = useState('')
    const [selectedFiles, setSelectedFiles] = useState<File[]>([])
    const [previewUrls, setPreviewUrls] = useState<string[]>([])
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [submitSuccess, setSubmitSuccess] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)

    // Image lightbox modal
    const [activeLightboxImage, setActiveLightboxImage] = useState<string | null>(null)

    const fileInputRef = useRef<HTMLInputElement | null>(null)

    const fetchReviews = useCallback(async () => {
        try {
            setLoading(true)
            setError(null)
            const res = await fetch(`/api/reviews?productId=${encodeURIComponent(productId)}`)
            if (!res.ok) throw new Error('Failed to load reviews')
            const data = await res.json()
            setReviews(data.reviews || [])
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error fetching reviews')
        } finally {
            setLoading(false)
        }
    }, [productId])

    useEffect(() => {
        if (!initialReviews && productId) {
            fetchReviews()
        }
    }, [productId, fetchReviews, initialReviews])

    // Cleanup blob previews when files change or unmount
    useEffect(() => {
        return () => {
            previewUrls.forEach((url) => {
                if (url.startsWith('blob:')) {
                    URL.revokeObjectURL(url)
                }
            })
        }
    }, [previewUrls])

    // Average rating calculation
    const totalReviews = reviews.length
    const averageRating =
        totalReviews > 0
            ? Number((reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1))
            : 0

    // Rating breakdown calculation
    const ratingCounts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
    reviews.forEach((r) => {
        if (ratingCounts[r.rating] !== undefined) {
            ratingCounts[r.rating]++
        }
    })

    // Filtered reviews based on selected star rating filter
    const filteredReviews = useMemo(() => {
        if (selectedRating === null) return reviews
        return reviews.filter((r) => r.rating === selectedRating)
    }, [reviews, selectedRating])

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])
        if (!files.length) return

        const validFiles: File[] = []
        const newPreviews: string[] = []

        for (const file of files) {
            if (file.size > 5 * 1024 * 1024) {
                setFormError(`"${file.name}" exceeds the 5MB limit`)
                continue
            }
            validFiles.push(file)
            newPreviews.push(URL.createObjectURL(file))
        }

        setSelectedFiles((prev) => [...prev, ...validFiles])
        setPreviewUrls((prev) => [...prev, ...newPreviews])
        setFormError(null)

        // Reset input value so same file can be re-selected if deleted
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    const removeSelectedFile = (index: number) => {
        const urlToRevoke = previewUrls[index]
        if (urlToRevoke?.startsWith('blob:')) {
            URL.revokeObjectURL(urlToRevoke)
        }
        setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
        setPreviewUrls((prev) => prev.filter((_, i) => i !== index))
    }

    const handleSubmitReview = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!comment.trim()) {
            setFormError('Please enter your written review.')
            return
        }

        setIsSubmitting(true)
        setFormError(null)

        try {
            let uploadedUrls: string[] = []

            // Upload images first if files selected
            if (selectedFiles.length > 0) {
                const formData = new FormData()
                selectedFiles.forEach((file) => {
                    formData.append('images', file)
                })

                const uploadRes = await fetch('/api/reviews/upload', {
                    method: 'POST',
                    body: formData,
                })

                if (!uploadRes.ok) {
                    const uploadErr = await uploadRes.json()
                    throw new Error(uploadErr.error || 'Failed to upload review images')
                }

                const uploadData = await uploadRes.json()
                uploadedUrls = uploadData.urls || []
            }

            // Submit review payload
            const payload = {
                productId,
                rating,
                comment: comment.trim(),
                imageUrls: uploadedUrls,
            }

            const res = await fetch('/api/reviews', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })

            if (!res.ok) {
                const resData = await res.json()
                throw new Error(resData.error || 'Failed to save review')
            }

            // Successfully posted
            setSubmitSuccess(true)
            await fetchReviews()

            // Reset form
            setTimeout(() => {
                setComment('')
                setRating(5)
                setSelectedFiles([])
                setPreviewUrls([])
                setIsSubmitting(false)
                setSubmitSuccess(false)
                setIsModalOpen(false)
            }, 1200)
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'Error submitting review')
            setIsSubmitting(false)
        }
    }

    const formatReviewerName = (rev: ReviewItem) => {
        if (rev.user?.firstName || rev.user?.lastName) {
            return `${rev.user.firstName} ${rev.user.lastName}`.trim()
        }
        if (rev.user?.userName) return rev.user.userName
        if (rev.retailClient?.fullName?.trim()) return rev.retailClient.fullName.trim()
        return 'Verified Customer'
    }

    const formatDate = (dateStr: string) => {
        try {
            const date = new Date(dateStr)
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
            })
        } catch {
            return ''
        }
    }

    return (
        <section
            id="customer-reviews"
            aria-labelledby="reviews-heading"
            className={`w-full rounded-2xl bg-white p-6 sm:p-8 shadow-sm border border-gray-100 ${className}`}
        >
            {/* Header: Title, Summary, and Write Review Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-gray-100">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-shop-50 text-shop-600">
                            <MessageSquare className="h-4 w-4" />
                        </span>
                        <h2
                            id="reviews-heading"
                            className="text-xl font-bold tracking-tight text-gray-900"
                        >
                            Customer Reviews
                        </h2>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                        Real ratings and photo feedback from verified customers
                    </p>
                </div>

                {isEligible ? (
                    <button
                        type="button"
                        onClick={() => setIsModalOpen(true)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-shop-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-shop-700 active:scale-[0.98] transition-all cursor-pointer"
                    >
                        <MessageSquare className="h-4 w-4" />
                        Write a Review
                    </button>
                ) : (
                    reviewHint ?? null
                )}
            </div>

            {/* Overall Rating Breakdown Box */}
            <div className="my-8 rounded-xl bg-gray-50/80 p-6 sm:p-8 border border-gray-100">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                    {/* Big Score Block */}
                    <div className="md:col-span-4 flex flex-col items-center justify-center text-center md:border-r md:border-gray-200 md:pr-6">
                        <div className="text-5xl font-black text-gray-900 tracking-tight">
                            {totalReviews > 0 ? averageRating.toFixed(1) : '0.0'}
                        </div>
                        <div className="mt-2 flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                    key={star}
                                    className={`h-5 w-5 ${
                                        star <= Math.round(averageRating)
                                            ? 'fill-amber-400 text-amber-400'
                                            : 'fill-gray-200 text-gray-200'
                                    }`}
                                />
                            ))}
                        </div>
                        <span className="mt-2 text-xs font-medium text-gray-500">
                            Based on {totalReviews} {totalReviews === 1 ? 'review' : 'reviews'}
                        </span>
                    </div>

                    {/* Breakdown Distribution Bars with Clickable Filters */}
                    <div className="md:col-span-8 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between pb-1">
                            <span className="text-xs font-semibold text-gray-700">Filter by Rating:</span>
                            <button
                                type="button"
                                onClick={() => setSelectedRating(null)}
                                className={`text-xs font-semibold px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                                    selectedRating === null
                                        ? 'bg-shop-700 text-white shadow-xs ring-1 ring-shop-700'
                                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                                }`}
                            >
                                All Reviews ({totalReviews})
                            </button>
                        </div>
                        {[5, 4, 3, 2, 1].map((starNum) => {
                            const count = ratingCounts[starNum] || 0
                            const percentage = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0
                            const isSelected = selectedRating === starNum
                            return (
                                <button
                                    key={starNum}
                                    type="button"
                                    onClick={() => setSelectedRating(isSelected ? null : starNum)}
                                    className={`group w-full flex items-center gap-3 text-xs px-3 py-2 rounded-xl transition-colors cursor-pointer border text-left ${
                                        isSelected
                                            ? 'bg-shop-50 border-shop-300 ring-1 ring-shop-400/50 font-bold text-shop-900 shadow-xs'
                                            : 'bg-transparent border-transparent hover:bg-gray-100 text-gray-700 hover:text-gray-900'
                                    }`}
                                    aria-pressed={isSelected}
                                    aria-label={`Filter by ${starNum} stars (${count} reviews)`}
                                >
                                    <span className={`w-14 flex items-center gap-1 shrink-0 ${isSelected ? 'font-bold text-shop-900' : 'font-medium text-gray-700 group-hover:text-gray-900'}`}>
                                        <span>{starNum} star</span>
                                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                    </span>
                                    <div className="h-2.5 flex-1 rounded-full bg-gray-200 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ease-out ${
                                                isSelected ? 'bg-amber-500' : 'bg-amber-400 group-hover:bg-amber-500'
                                            }`}
                                            style={{ width: `${percentage}%` }}
                                        />
                                    </div>
                                    <span className={`w-16 text-right font-mono text-xs shrink-0 ${isSelected ? 'font-bold text-shop-900' : 'text-gray-500 group-hover:text-gray-700'}`}>
                                        {count} ({percentage}%)
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            </div>

            {/* Reviews List */}
            <div className="mt-8">
                {/* Horizontal Star Filter Buttons Row (Shopee style) */}
                <div className="flex flex-wrap items-center gap-2 mb-4">
                    <button
                        type="button"
                        onClick={() => setSelectedRating(null)}
                        className={`px-4 py-2 border rounded-md text-xs sm:text-sm font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                            selectedRating === null
                                ? 'bg-shop-600 text-white border-shop-600 shadow-xs'
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
                        }`}
                    >
                        <span>All</span>
                        <span className={`text-xs ${selectedRating === null ? 'text-shop-100' : 'text-gray-400'}`}>
                            ({totalReviews})
                        </span>
                    </button>
                    {[5, 4, 3, 2, 1].map((starNum) => {
                        const count = ratingCounts[starNum] || 0
                        const isSelected = selectedRating === starNum
                        return (
                            <button
                                key={starNum}
                                type="button"
                                onClick={() => setSelectedRating(isSelected ? null : starNum)}
                                className={`px-4 py-2 border rounded-md text-xs sm:text-sm font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                                    isSelected
                                        ? 'bg-shop-600 text-white border-shop-600 shadow-xs'
                                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
                                }`}
                            >
                                <span>{starNum}</span>
                                <Star
                                    className={`h-3.5 w-3.5 shrink-0 ${
                                        isSelected
                                            ? 'fill-amber-300 text-amber-300'
                                            : 'fill-amber-400 text-amber-400'
                                    }`}
                                />
                                <span>Star</span>
                                <span
                                    className={`text-xs ${
                                        isSelected ? 'text-shop-100' : 'text-gray-400'
                                    }`}
                                >
                                    ({count})
                                </span>
                            </button>
                        )
                    })}
                </div>

                {/* Active Filter Indicator */}
                {selectedRating !== null && (
                    <div className="mb-4 flex items-center justify-between rounded-xl bg-shop-50 px-4 py-2.5 text-xs border border-shop-200 text-shop-900">
                        <span className="flex items-center gap-2 font-medium">
                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                            <span>
                                Showing <strong>{selectedRating}-star</strong> reviews only ({filteredReviews.length} of {totalReviews})
                            </span>
                        </span>
                        <button
                            type="button"
                            onClick={() => setSelectedRating(null)}
                            className="inline-flex items-center gap-1 font-semibold text-shop-700 hover:text-shop-800 hover:underline cursor-pointer"
                        >
                            <X className="h-3.5 w-3.5" />
                            All Reviews
                        </button>
                    </div>
                )}

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                        <Loader2 className="h-8 w-8 animate-spin text-shop-600" />
                        <span className="mt-2 text-sm font-medium">Loading reviews...</span>
                    </div>
                ) : error ? (
                    <div className="rounded-xl bg-red-50 p-4 text-center text-sm text-red-600 border border-red-100">
                        {error}
                    </div>
                ) : filteredReviews.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 py-12 px-4 text-center">
                        <MessageSquare className="h-10 w-10 text-gray-300 mb-3" />
                        <h3 className="text-base font-semibold text-gray-900">
                            {selectedRating !== null
                                ? `No ${selectedRating}-star reviews`
                                : 'No reviews yet'}
                        </h3>
                        <p className="mt-1 text-sm text-gray-500 max-w-sm">
                            {selectedRating !== null
                                ? `There are currently no reviews matching the ${selectedRating}-star filter.`
                                : isEligible
                                ? `Be the first to review ${productName} and share your thoughts with other shoppers!`
                                : `No reviews yet for ${productName}.`}
                        </p>
                        {selectedRating !== null ? (
                            <button
                                type="button"
                                onClick={() => setSelectedRating(null)}
                                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-shop-50 px-4 py-2 text-xs font-semibold text-shop-700 hover:bg-shop-100 transition-colors cursor-pointer"
                            >
                                View all reviews ({totalReviews})
                            </button>
                        ) : isEligible ? (
                            <button
                                type="button"
                                onClick={() => setIsModalOpen(true)}
                                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-shop-50 px-4 py-2 text-xs font-semibold text-shop-700 hover:bg-shop-100 transition-colors cursor-pointer"
                            >
                                <Sparkles className="h-3.5 w-3.5" />
                                Leave First Review
                            </button>
                        ) : null}
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {filteredReviews.map((rev) => (
                            <article key={rev.id} className="py-6 first:pt-0 last:pb-0">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        {rev.user?.avatar ? (
                                            <div className="relative h-10 w-10 overflow-hidden rounded-full border border-gray-200">
                                                <Image
                                                    src={rev.user.avatar}
                                                    alt={formatReviewerName(rev)}
                                                    fill
                                                    className="object-cover"
                                                    sizes="40px"
                                                />
                                            </div>
                                        ) : (
                                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-shop-500 to-shop-800 text-sm font-bold text-white shadow-sm">
                                                {formatReviewerName(rev).charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-sm font-semibold text-gray-900">
                                                    {formatReviewerName(rev)}
                                                </h4>
                                                <span className="inline-flex items-center gap-1 rounded-full bg-shop-50 px-2 py-0.5 text-[10px] font-medium text-shop-700 border border-shop-100">
                                                    <ShieldCheck className="h-3 w-3" />
                                                    Verified Purchase
                                                </span>
                                            </div>
                                            <span className="text-xs text-gray-400">
                                                {formatDate(rev.createdAt)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Star Rating Icons */}
                                    <div className="flex items-center gap-1">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <Star
                                                key={star}
                                                className={`h-4 w-4 ${
                                                    star <= rev.rating
                                                        ? 'fill-amber-400 text-amber-400'
                                                        : 'fill-gray-200 text-gray-200'
                                                }`}
                                            />
                                        ))}
                                    </div>
                                </div>

                                {/* Review written comment */}
                                <p className="mt-3 text-sm leading-relaxed text-gray-700 whitespace-pre-line">
                                    {rev.comment}
                                </p>

                                {/* Attached Images Grid (standard Next.js <Image>) */}
                                {rev.imageUrls && rev.imageUrls.length > 0 && (
                                    <div className="mt-4 flex flex-wrap gap-3">
                                        {rev.imageUrls.map((imgUrl, idx) => (
                                            <div
                                                key={idx}
                                                onClick={() => setActiveLightboxImage(imgUrl)}
                                                className="group relative h-20 w-20 sm:h-24 sm:w-24 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 shadow-xs cursor-pointer"
                                            >
                                                <Image
                                                    src={imgUrl}
                                                    alt={`Review attachment ${idx + 1}`}
                                                    fill
                                                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                                                    sizes="(max-width: 640px) 80px, 96px"
                                                />
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                                    <ZoomIn className="h-5 w-5 text-white drop-shadow" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </article>
                        ))}
                    </div>
                )}
            </div>

            {/* Write a Review Modal Form */}
            {isModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="write-review-title"
                >
                    <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 sm:p-8 shadow-2xl border border-gray-100">
                        {/* Close button */}
                        <button
                            type="button"
                            onClick={() => !isSubmitting && setIsModalOpen(false)}
                            disabled={isSubmitting}
                            className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                            aria-label="Close review dialog"
                        >
                            <X className="h-5 w-5" />
                        </button>

                        <div className="flex items-center gap-2 mb-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-shop-50 text-shop-600">
                                <Sparkles className="h-4 w-4" />
                            </span>
                            <h3 id="write-review-title" className="text-lg font-bold text-gray-900">
                                Write a Customer Review
                            </h3>
                        </div>
                        <p className="text-xs text-gray-500 mb-6">
                            Share your honest experience with {productName}
                        </p>

                        {submitSuccess ? (
                            <div className="flex flex-col items-center justify-center py-10 text-center">
                                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-shop-50 text-shop-600 mb-3 animate-bounce">
                                    <CheckCircle2 className="h-8 w-8" />
                                </div>
                                <h4 className="text-base font-semibold text-gray-900">
                                    Review Submitted!
                                </h4>
                                <p className="mt-1 text-xs text-gray-500">
                                    Thank you! Your feedback has been published.
                                </p>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmitReview} className="space-y-5">
                                {/* Clickable 5-Star Rating Selector */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                                        Your Rating <span className="text-red-500">*</span>
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-1">
                                            {[1, 2, 3, 4, 5].map((star) => {
                                                const active = hoverRating !== null ? star <= hoverRating : star <= rating
                                                return (
                                                    <button
                                                        key={star}
                                                        type="button"
                                                        onClick={() => setRating(star)}
                                                        onMouseEnter={() => setHoverRating(star)}
                                                        onMouseLeave={() => setHoverRating(null)}
                                                        className="p-1 rounded-md hover:bg-amber-50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-shop-500"
                                                        aria-label={`${star} star${star > 1 ? 's' : ''}`}
                                                    >
                                                        <Star
                                                            className={`h-7 w-7 transition-colors ${
                                                                active
                                                                    ? 'fill-amber-400 text-amber-400'
                                                                    : 'fill-gray-200 text-gray-200'
                                                            }`}
                                                        />
                                                    </button>
                                                )
                                            })}
                                        </div>
                                        <span className="ml-2 text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                                            {RATING_LABELS[hoverRating ?? rating]}
                                        </span>
                                    </div>
                                </div>

                                {/* Review Textarea */}
                                <div>
                                    <label
                                        htmlFor="review-comment"
                                        className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2"
                                    >
                                        Written Review <span className="text-red-500">*</span>
                                    </label>
                                    <textarea
                                        id="review-comment"
                                        rows={4}
                                        value={comment}
                                        onChange={(e) => setComment(e.target.value)}
                                        placeholder="What did you like or dislike? How was the build quality, performance, or packaging?"
                                        required
                                        className="w-full rounded-xl border border-gray-200 p-3.5 text-sm text-gray-900 placeholder-gray-400 focus:border-shop-500 focus:ring-2 focus:ring-shop-500/20 focus:outline-none transition-colors"
                                    />
                                </div>

                                {/* Image Attachments Upload Input */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                            Attach Photos <span className="text-gray-400 font-normal">(Optional)</span>
                                        </label>
                                        <span className="text-[11px] text-gray-400">
                                            Max 5MB each (JPG, PNG, WEBP)
                                        </span>
                                    </div>

                                    {/* Upload Drop/Button Area */}
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50/60 p-4 text-center hover:bg-gray-50 hover:border-shop-400 transition-colors cursor-pointer"
                                    >
                                        <Camera className="h-6 w-6 text-gray-400 mb-1" />
                                        <p className="text-xs font-medium text-gray-700">
                                            Click to add photo attachments
                                        </p>
                                        <p className="text-[11px] text-gray-400 mt-0.5">
                                            Upload actual photos of your item
                                        </p>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            multiple
                                            accept="image/png,image/jpeg,image/webp,image/gif"
                                            onChange={handleFileSelect}
                                            className="hidden"
                                        />
                                    </div>

                                    {/* Thumbnail previews */}
                                    {previewUrls.length > 0 && (
                                        <div className="mt-3 flex flex-wrap gap-2.5">
                                            {previewUrls.map((url, idx) => (
                                                <div
                                                    key={idx}
                                                    className="relative h-16 w-16 overflow-hidden rounded-lg border border-gray-200 bg-gray-100 group"
                                                >
                                                    <Image
                                                        src={url}
                                                        alt="Selected thumbnail"
                                                        fill
                                                        className="object-cover"
                                                        sizes="64px"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => removeSelectedFile(idx)}
                                                        className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-red-600 transition-colors cursor-pointer"
                                                        aria-label="Remove photo"
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {formError && (
                                    <div className="rounded-lg bg-red-50 p-3 text-xs text-red-600 border border-red-100">
                                        {formError}
                                    </div>
                                )}

                                {/* Buttons */}
                                <div className="flex items-center justify-end gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setIsModalOpen(false)}
                                        disabled={isSubmitting}
                                        className="rounded-xl border border-gray-200 px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="inline-flex items-center gap-2 rounded-xl bg-shop-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-shop-700 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                Publishing...
                                            </>
                                        ) : (
                                            <>
                                                <Upload className="h-3.5 w-3.5" />
                                                Submit Review
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* Image Lightbox Modal */}
            {activeLightboxImage && (
                <div
                    onClick={() => setActiveLightboxImage(null)}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm cursor-zoom-out animate-in fade-in duration-150"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl bg-black border border-white/10 shadow-2xl"
                    >
                        <button
                            type="button"
                            onClick={() => setActiveLightboxImage(null)}
                            className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-white/20 transition-colors cursor-pointer"
                        >
                            <X className="h-5 w-5" />
                        </button>
                        <div className="relative h-[70vh] w-[80vw] max-w-4xl">
                            <Image
                                src={activeLightboxImage}
                                alt="Review image preview"
                                fill
                                className="object-contain"
                                sizes="90vw"
                                priority
                            />
                        </div>
                    </div>
                </div>
            )}
        </section>
    )
}
