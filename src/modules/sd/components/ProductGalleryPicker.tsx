'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { HiOutlinePlus, HiX } from 'react-icons/hi'
import Upload from '@/components/ui/Upload'
import { isUnoptimizedImage } from '@/utils/productImage'
import { PRODUCT_GALLERY_MAX } from '../services/productCatalogService'
import {
    ACCEPTED_TYPES,
    validateProductImage,
    type PendingProductImage,
} from './ProductImagePicker'

type ProductGalleryPickerProps = {
    /** Saved gallery photos to keep, in order. */
    kept: string[]
    onKeptChange: (kept: string[]) => void
    /** Newly chosen photos, uploaded when the form is saved. */
    pending: PendingProductImage[]
    onPendingChange: (pending: PendingProductImage[]) => void
    disabled?: boolean
}

const Thumb = ({
    src,
    unoptimized,
    label,
    isNew,
    disabled,
    onRemove,
}: {
    src: string
    unoptimized: boolean
    label: string
    isNew?: boolean
    disabled?: boolean
    onRemove: () => void
}) => (
    <li className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <Image
            src={src}
            alt={label}
            fill
            sizes="120px"
            unoptimized={unoptimized}
            className="object-contain p-1"
        />
        {isNew ? (
            <span className="absolute bottom-1 left-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-white">
                New
            </span>
        ) : null}
        <button
            type="button"
            aria-label={`Remove ${label}`}
            disabled={disabled}
            className="absolute right-1 top-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-white/90 text-gray-600 shadow-sm hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed"
            onClick={onRemove}
        >
            <HiX />
        </button>
    </li>
)

/** Extra product photos shown in the storefront gallery after the main photo. */
const ProductGalleryPicker = ({
    kept,
    onKeptChange,
    pending,
    onPendingChange,
    disabled,
}: ProductGalleryPickerProps) => {
    const [error, setError] = useState<string | null>(null)
    const pendingRef = useRef(pending)
    pendingRef.current = pending

    useEffect(
        () => () =>
            pendingRef.current.forEach((p) =>
                URL.revokeObjectURL(p.previewUrl),
            ),
        [],
    )

    const total = kept.length + pending.length
    const full = total >= PRODUCT_GALLERY_MAX

    const add = (files: File[]) => {
        const room = PRODUCT_GALLERY_MAX - total
        const accepted: PendingProductImage[] = []
        let problem: string | null = null
        for (const file of files) {
            const invalid = validateProductImage(file)
            if (invalid) problem = invalid
            else if (accepted.length < room) {
                accepted.push({ file, previewUrl: URL.createObjectURL(file) })
            } else
                problem = `Up to ${PRODUCT_GALLERY_MAX} gallery photos per product.`
        }
        setError(problem)
        if (accepted.length) onPendingChange([...pending, ...accepted])
    }

    const removePending = (index: number) => {
        URL.revokeObjectURL(pending[index].previewUrl)
        onPendingChange(pending.filter((_, i) => i !== index))
        setError(null)
    }

    return (
        <div className="flex flex-col gap-2">
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {kept.map((src, index) => (
                    <Thumb
                        key={src}
                        src={src}
                        unoptimized={isUnoptimizedImage(src)}
                        label={`gallery photo ${index + 1}`}
                        disabled={disabled}
                        onRemove={() => {
                            onKeptChange(kept.filter((url) => url !== src))
                            setError(null)
                        }}
                    />
                ))}
                {pending.map((item, index) => (
                    <Thumb
                        key={item.previewUrl}
                        src={item.previewUrl}
                        unoptimized
                        isNew
                        label={item.file.name}
                        disabled={disabled}
                        onRemove={() => removePending(index)}
                    />
                ))}
                {!full ? (
                    <li className="aspect-square">
                        <Upload
                            draggable
                            multiple
                            showList={false}
                            accept={ACCEPTED_TYPES.join(',')}
                            disabled={disabled}
                            className="h-full min-h-0"
                            onChange={(all, previous) =>
                                add(all.slice(previous.length))
                            }
                        >
                            <span className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-gray-500">
                                <HiOutlinePlus className="text-xl" />
                                Add photos
                            </span>
                        </Upload>
                    </li>
                ) : null}
            </ul>
            <p className="text-xs text-gray-500">
                {total}/{PRODUCT_GALLERY_MAX} · shown after the main photo on
                the storefront. New photos upload when you click Save.
            </p>
            {error ? <p className="text-xs text-red-600">{error}</p> : null}
        </div>
    )
}

export default ProductGalleryPicker
