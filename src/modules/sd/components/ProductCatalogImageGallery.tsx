'use client'

import { useState, type DragEvent } from 'react'
import Image from 'next/image'
import {
    HiChevronLeft,
    HiChevronRight,
    HiOutlineFilm,
    HiOutlinePhotograph,
    HiOutlineStar,
    HiOutlineTrash,
    HiPlay,
} from 'react-icons/hi'
import Spinner from '@/components/ui/Spinner'
import Upload from '@/components/ui/Upload'
import classNames from '@/utils/classNames'
import { isRenderableImageSrc, isUnoptimizedImage } from '@/utils/productImage'
import {
    PRODUCT_VIDEO_MAX,
    uploadProductImage,
    uploadProductVideo,
} from '../services/productCatalogService'

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_VIDEO_BYTES = 50 * 1024 * 1024
const MAX_IMAGES = 8

type ProductGalleryPickerProps = {
    /** Cover photo (first in storefront). */
    coverUrl: string
    /** Additional photos, in display order. */
    galleryUrls: string[]
    /** Product videos (stored in attributes.videos). */
    videoUrls: string[]
    onCoverChange: (url: string) => void
    onGalleryChange: (urls: string[]) => void
    onVideosChange: (urls: string[]) => void
    onUploadingChange?: (uploading: boolean) => void
    disabled?: boolean
}

const validateImage = (file: File) => {
    if (!IMAGE_TYPES.includes(file.type))
        return 'Use a PNG, JPG, WEBP or GIF image.'
    if (file.size > MAX_IMAGE_BYTES) return 'Image must be 5 MB or smaller.'
    return null
}

const validateVideo = (file: File) => {
    if (!VIDEO_TYPES.includes(file.type))
        return 'Use an MP4, WEBM or MOV video.'
    if (file.size > MAX_VIDEO_BYTES) return 'Video must be 50 MB or smaller.'
    return null
}

const errorText = (file: File, err: unknown) =>
    `${file.name}: ${err instanceof Error ? err.message : 'Upload failed.'}`

const TILE_BUTTON =
    'flex flex-1 items-center justify-center p-1 text-white hover:bg-white/20 disabled:opacity-30'

const ProductGalleryPicker = ({
    coverUrl,
    galleryUrls,
    videoUrls,
    onCoverChange,
    onGalleryChange,
    onVideosChange,
    onUploadingChange,
    disabled,
}: ProductGalleryPickerProps) => {
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [drag, setDrag] = useState<{
        kind: 'photo' | 'video'
        from: number
        over: number | null
    } | null>(null)

    const photos = [
        ...new Set([
            ...(isRenderableImageSrc(coverUrl) ? [coverUrl] : []),
            ...galleryUrls.filter(Boolean),
        ]),
    ]

    /** The first photo is the cover (front picture); the rest keep their order. */
    const applyOrder = (urls: string[]) => {
        onCoverChange(urls[0] ?? '')
        onGalleryChange(urls.slice(1))
    }

    const move = (from: number, to: number) => {
        if (to < 0 || to >= photos.length || from === to) return
        const next = [...photos]
        const [url] = next.splice(from, 1)
        next.splice(to, 0, url)
        applyOrder(next)
    }

    const moveVideo = (from: number, to: number) => {
        if (to < 0 || to >= videoUrls.length || from === to) return
        const next = [...videoUrls]
        const [url] = next.splice(from, 1)
        next.splice(to, 0, url)
        onVideosChange(next)
    }

    /** HTML5 drag-to-reorder for photo or video tiles (each within its own list). */
    const dragProps = (kind: 'photo' | 'video', index: number) => ({
        draggable: !busy,
        onDragStart: (e: DragEvent<HTMLDivElement>) => {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', `${kind}:${index}`)
            setDrag({ kind, from: index, over: null })
        },
        onDragEnter: (e: DragEvent<HTMLDivElement>) => {
            if (drag?.kind !== kind) return
            e.preventDefault()
            if (drag.over !== index) setDrag({ ...drag, over: index })
        },
        onDragOver: (e: DragEvent<HTMLDivElement>) => {
            if (drag?.kind !== kind) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
        },
        onDrop: (e: DragEvent<HTMLDivElement>) => {
            e.preventDefault()
            e.stopPropagation()
            if (drag?.kind === kind) {
                if (kind === 'photo') move(drag.from, index)
                else moveVideo(drag.from, index)
            }
            setDrag(null)
        },
        onDragEnd: () => setDrag(null),
    })

    const dragState = (kind: 'photo' | 'video', index: number) =>
        drag?.kind !== kind
            ? null
            : drag.from === index
              ? 'opacity-40'
              : drag.over === index
                ? 'ring-4 ring-primary/40 scale-105'
                : null

    /** Validates and uploads one kind of file, capped at the free slots. */
    const uploadKind = async (
        kind: 'photos' | 'videos',
        files: File[],
        check: (file: File) => string | null,
        slots: number,
        max: number,
        upload: (file: File) => Promise<string>,
        problems: string[],
    ) => {
        const valid = files.filter((file) => {
            const problem = check(file)
            if (problem) problems.push(`${file.name}: ${problem}`)
            return !problem
        })
        if (valid.length > slots) {
            problems.push(
                `Maximum ${max} ${kind} per product — ${valid.length - Math.max(slots, 0)} skipped.`,
            )
        }
        const uploaded: string[] = []
        for (const file of valid.slice(0, Math.max(slots, 0))) {
            try {
                uploaded.push(await upload(file))
            } catch (err) {
                problems.push(errorText(file, err))
            }
        }
        return uploaded
    }

    /** One drop zone for both: images go to photos, videos to videos. */
    const uploadFiles = async (files: File[]) => {
        const images = files.filter((f) => f.type.startsWith('image/'))
        const videos = files.filter((f) => f.type.startsWith('video/'))
        const problems = files
            .filter((f) => !images.includes(f) && !videos.includes(f))
            .map(
                (f) =>
                    `${f.name}: Use a photo (PNG, JPG, WEBP, GIF) or video (MP4, WEBM, MOV).`,
            )
        setUploading(true)
        onUploadingChange?.(true)
        try {
            const addedPhotos = await uploadKind(
                'photos',
                images,
                validateImage,
                MAX_IMAGES - photos.length,
                MAX_IMAGES,
                uploadProductImage,
                problems,
            )
            const addedVideos = await uploadKind(
                'videos',
                videos,
                validateVideo,
                PRODUCT_VIDEO_MAX - videoUrls.length,
                PRODUCT_VIDEO_MAX,
                uploadProductVideo,
                problems,
            )
            if (addedPhotos.length)
                applyOrder([...new Set([...photos, ...addedPhotos])])
            if (addedVideos.length)
                onVideosChange([...videoUrls, ...addedVideos])
        } finally {
            setUploading(false)
            onUploadingChange?.(false)
            setError(problems.length ? problems.join(' ') : null)
        }
    }

    const busy = disabled || uploading
    const full =
        photos.length >= MAX_IMAGES && videoUrls.length >= PRODUCT_VIDEO_MAX

    return (
        <div className="space-y-2">
            {photos.length || videoUrls.length ? (
                <div className="flex flex-wrap gap-3">
                    {photos.map((url, index) => {
                        const isCover = index === 0
                        return (
                            <div
                                key={url}
                                {...dragProps('photo', index)}
                                className={classNames(
                                    'relative h-28 w-28 cursor-grab select-none overflow-hidden rounded-lg border-2 bg-gray-50 transition active:cursor-grabbing dark:bg-gray-800',
                                    isCover
                                        ? 'border-primary'
                                        : 'border-gray-200 dark:border-gray-700',
                                    dragState('photo', index),
                                )}
                            >
                                {isCover &&
                                drag?.kind === 'photo' &&
                                drag.from !== 0 ? (
                                    <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-primary/70 px-2 text-center text-xs font-semibold text-white">
                                        Drop here to set front
                                    </span>
                                ) : null}
                                <Image
                                    src={url}
                                    alt=""
                                    fill
                                    sizes="112px"
                                    unoptimized={isUnoptimizedImage(url)}
                                    draggable={false}
                                    className="pointer-events-none object-cover"
                                />
                                <span
                                    className={classNames(
                                        'absolute left-1 top-1 rounded px-1 text-[10px] font-semibold',
                                        isCover
                                            ? 'bg-primary text-white'
                                            : 'bg-white/90 text-gray-700',
                                    )}
                                >
                                    {isCover ? 'Front' : index + 1}
                                </span>
                                {!isCover ? (
                                    <button
                                        type="button"
                                        className="absolute right-1 top-1 inline-flex items-center gap-0.5 rounded bg-white/90 px-1 text-[10px] font-semibold text-gray-700 hover:bg-primary hover:text-white"
                                        disabled={busy}
                                        onClick={() => move(index, 0)}
                                    >
                                        <HiOutlineStar /> Set front
                                    </button>
                                ) : null}
                                <div className="absolute inset-x-0 bottom-0 flex bg-black/55">
                                    <button
                                        type="button"
                                        title="Move left"
                                        className={TILE_BUTTON}
                                        disabled={busy || index === 0}
                                        onClick={() => move(index, index - 1)}
                                    >
                                        <HiChevronLeft className="text-sm" />
                                    </button>
                                    <button
                                        type="button"
                                        title="Remove photo"
                                        className={TILE_BUTTON}
                                        disabled={busy}
                                        onClick={() =>
                                            applyOrder(
                                                photos.filter((u) => u !== url),
                                            )
                                        }
                                    >
                                        <HiOutlineTrash className="text-sm" />
                                    </button>
                                    <button
                                        type="button"
                                        title="Move right"
                                        className={TILE_BUTTON}
                                        disabled={
                                            busy || index === photos.length - 1
                                        }
                                        onClick={() => move(index, index + 1)}
                                    >
                                        <HiChevronRight className="text-sm" />
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                    {videoUrls.map((url, index) => (
                        <div
                            key={url}
                            {...dragProps('video', index)}
                            className={classNames(
                                'relative h-28 w-40 cursor-grab select-none overflow-hidden rounded-lg border-2 border-gray-200 bg-black transition active:cursor-grabbing dark:border-gray-700',
                                dragState('video', index),
                            )}
                        >
                            <video
                                src={url}
                                preload="metadata"
                                muted
                                playsInline
                                draggable={false}
                                className="pointer-events-none h-full w-full object-cover"
                            />
                            <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-white/90 px-1 text-[10px] font-semibold text-gray-700">
                                <HiOutlineFilm /> Video
                            </span>
                            <HiPlay className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-3xl text-white/90" />
                            <button
                                type="button"
                                title="Remove video"
                                className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-black/55 p-1 text-white hover:bg-black/70"
                                disabled={busy}
                                onClick={() =>
                                    onVideosChange(
                                        videoUrls.filter((u) => u !== url),
                                    )
                                }
                            >
                                <HiOutlineTrash className="text-sm" />
                            </button>
                        </div>
                    ))}
                </div>
            ) : null}
            {photos.length > 1 || videoUrls.length > 1 ? (
                <p className="text-xs text-gray-500">
                    Drag a photo or video to reorder it. The{' '}
                    <span className="font-semibold">Front</span> photo is shown
                    first in the shop — drag a photo onto it or click{' '}
                    <span className="font-semibold">Set front</span>.
                </p>
            ) : null}
            <Upload
                draggable
                multiple
                showList={false}
                accept={[...IMAGE_TYPES, ...VIDEO_TYPES].join(',')}
                disabled={busy || full}
                className="!min-h-0 px-4 py-5"
                onChange={(files, previous) => {
                    const picked = files.slice(previous.length)
                    if (picked.length) void uploadFiles(picked)
                }}
            >
                {uploading ? (
                    <span className="inline-flex items-center gap-2 text-sm text-gray-500">
                        <Spinner size={20} /> Uploading…
                    </span>
                ) : (
                    <div className="flex flex-col items-center gap-1 text-center">
                        <span className="inline-flex items-center gap-2 text-2xl text-gray-400">
                            <HiOutlinePhotograph />
                            <HiOutlineFilm />
                        </span>
                        <span className="text-sm">
                            <span className="font-semibold text-primary">
                                Add photos or videos
                            </span>
                            <span className="text-gray-500">
                                {' '}
                                — click or drag files here
                            </span>
                        </span>
                        <span className="text-xs text-gray-400">
                            Photos: PNG, JPG, WEBP, GIF · 5 MB · up to{' '}
                            {MAX_IMAGES} ({photos.length}/{MAX_IMAGES}) ·
                            Videos: MP4, WEBM, MOV · 50 MB · up to{' '}
                            {PRODUCT_VIDEO_MAX} ({videoUrls.length}/
                            {PRODUCT_VIDEO_MAX})
                        </span>
                    </div>
                )}
            </Upload>
            {error ? <p className="text-xs text-red-600">{error}</p> : null}
        </div>
    )
}

export default ProductGalleryPicker
