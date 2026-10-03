'use client'

import { useCallback, useState } from 'react'
import Image from 'next/image'
import { HiOutlinePhotograph, HiOutlineStar, HiOutlineTrash } from 'react-icons/hi'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import Upload from '@/components/ui/Upload'
import { isRenderableImageSrc, isUnoptimizedImage } from '@/utils/productImage'
import { uploadProductImage } from '../services/productCatalogService'

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const MAX_BYTES = 5 * 1024 * 1024
const MAX_IMAGES = 8

type ProductGalleryPickerProps = {
    /** Cover photo (first in storefront). */
    coverUrl: string
    /** Additional photos (stored in attributes.gallery). */
    galleryUrls: string[]
    onCoverChange: (url: string) => void
    onGalleryChange: (urls: string[]) => void
    onUploadingChange?: (uploading: boolean) => void
    disabled?: boolean
}

const validate = (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) return 'Use a PNG, JPG, WEBP or GIF image.'
    if (file.size > MAX_BYTES) return 'Image must be 5 MB or smaller.'
    return null
}

const ProductGalleryPicker = ({
    coverUrl,
    galleryUrls,
    onCoverChange,
    onGalleryChange,
    onUploadingChange,
    disabled,
}: ProductGalleryPickerProps) => {
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const allUrls = [
        ...(isRenderableImageSrc(coverUrl) ? [coverUrl] : []),
        ...galleryUrls.filter((u) => u && u !== coverUrl),
    ]

    const upload = useCallback(
        async (file: File, asCover: boolean) => {
            const problem = validate(file)
            if (problem) {
                setError(problem)
                return
            }
            if (allUrls.length >= MAX_IMAGES) {
                setError(`Maximum ${MAX_IMAGES} photos per product.`)
                return
            }
            setError(null)
            setUploading(true)
            onUploadingChange?.(true)
            try {
                const url = await uploadProductImage(file)
                if (asCover || !isRenderableImageSrc(coverUrl)) {
                    if (isRenderableImageSrc(coverUrl) && coverUrl !== url) {
                        onGalleryChange([coverUrl, ...galleryUrls.filter((g) => g !== url)])
                    }
                    onCoverChange(url)
                } else {
                    onGalleryChange([...galleryUrls.filter((g) => g !== url), url])
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Upload failed.')
            } finally {
                setUploading(false)
                onUploadingChange?.(false)
            }
        },
        [
            allUrls.length,
            coverUrl,
            galleryUrls,
            onCoverChange,
            onGalleryChange,
            onUploadingChange,
        ],
    )

    const removeAt = (url: string) => {
        if (url === coverUrl) {
            const [next, ...rest] = galleryUrls
            onCoverChange(next ?? '')
            onGalleryChange(rest)
            return
        }
        onGalleryChange(galleryUrls.filter((g) => g !== url))
    }

    const setAsCover = (url: string) => {
        if (url === coverUrl) return
        const rest = [
            ...(isRenderableImageSrc(coverUrl) ? [coverUrl] : []),
            ...galleryUrls.filter((g) => g !== url),
        ]
        onCoverChange(url)
        onGalleryChange(rest.filter((g) => g !== url))
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-3">
                {allUrls.map((url) => (
                    <div
                        key={url}
                        className="relative h-24 w-24 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700"
                    >
                        <Image
                            src={url}
                            alt=""
                            fill
                            sizes="96px"
                            unoptimized={isUnoptimizedImage(url)}
                            className="object-cover"
                        />
                        {url === coverUrl ? (
                            <span className="absolute left-1 top-1 rounded bg-primary px-1 text-[10px] font-semibold text-white">
                                Cover
                            </span>
                        ) : null}
                        <div className="absolute inset-x-0 bottom-0 flex gap-0.5 bg-black/50 p-0.5">
                            {url !== coverUrl ? (
                                <button
                                    type="button"
                                    title="Set as cover"
                                    className="flex flex-1 items-center justify-center p-1 text-white"
                                    disabled={disabled}
                                    onClick={() => setAsCover(url)}
                                >
                                    <HiOutlineStar className="text-sm" />
                                </button>
                            ) : null}
                            <button
                                type="button"
                                title="Remove"
                                className="flex flex-1 items-center justify-center p-1 text-white"
                                disabled={disabled}
                                onClick={() => removeAt(url)}
                            >
                                <HiOutlineTrash className="text-sm" />
                            </button>
                        </div>
                    </div>
                ))}
                {!allUrls.length ? (
                    <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-800">
                        <HiOutlinePhotograph className="text-2xl text-gray-400" />
                    </div>
                ) : null}
            </div>
            <Upload
                draggable
                showList={false}
                accept={ACCEPTED_TYPES.join(',')}
                disabled={disabled || uploading}
                onChange={(files) => {
                    const file = files[files.length - 1]
                    if (file) void upload(file, !isRenderableImageSrc(coverUrl))
                }}
            >
                <div className="rounded-lg border border-dashed border-gray-300 px-3 py-3 text-center text-sm dark:border-gray-600">
                    {uploading ? (
                        <span className="inline-flex items-center gap-2 text-gray-500">
                            <Spinner size={20} /> UploadingΓÇª
                        </span>
                    ) : (
                        <>
                            <span className="font-semibold text-primary">Add photos</span>
                            <span className="text-gray-500">
                                {' '}
                                ΓÇö first image is the cover ┬╖ up to {MAX_IMAGES}
                            </span>
                        </>
                    )}
                </div>
            </Upload>
            {error ? <p className="text-xs text-red-600">{error}</p> : null}
        </div>
    )
}

export default ProductGalleryPicker
