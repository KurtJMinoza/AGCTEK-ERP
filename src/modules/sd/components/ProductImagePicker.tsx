'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import {
    HiOutlineClipboard,
    HiOutlineCloudUpload,
    HiOutlineTrash,
} from 'react-icons/hi'
import Button from '@/components/ui/Button'
import Upload from '@/components/ui/Upload'
import { isRenderableImageSrc, isUnoptimizedImage } from '@/utils/productImage'

export const ACCEPTED_TYPES = [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
]
const MAX_BYTES = 5 * 1024 * 1024

/** A photo chosen in the browser but not yet saved; `previewUrl` is an object URL. */
export type PendingProductImage = { file: File; previewUrl: string }

type ProductImagePickerProps = {
    /** Currently saved image URL ('' when none). */
    value: string
    onChange: (imageUrl: string) => void
    pending: PendingProductImage | null
    onPendingChange: (pending: PendingProductImage | null) => void
    disabled?: boolean
}

export const validateProductImage = (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type))
        return 'Use a PNG, JPG, WEBP or GIF image.'
    if (file.size > MAX_BYTES) return 'Image must be 5 MB or smaller.'
    return null
}

const formatSize = (bytes: number) =>
    bytes >= 1024 * 1024
        ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.max(1, Math.round(bytes / 1024))} KB`

/**
 * Drag-and-drop / click-to-browse product photo with an in-zone preview. Also
 * accepts Ctrl+V or the clipboard button. The file is sent when the form is saved.
 */
const ProductImagePicker = ({
    value,
    onChange,
    pending,
    onPendingChange,
    disabled,
}: ProductImagePickerProps) => {
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!pending) return
        return () => URL.revokeObjectURL(pending.previewUrl)
    }, [pending])

    const select = useCallback(
        (file: File) => {
            const problem = validateProductImage(file)
            if (problem) {
                setError(problem)
                return
            }
            setError(null)
            onPendingChange({ file, previewUrl: URL.createObjectURL(file) })
        },
        [onPendingChange],
    )

    useEffect(() => {
        if (disabled) return
        const onPaste = (event: ClipboardEvent) => {
            const file = Array.from(event.clipboardData?.files ?? []).find(
                (f) => f.type.startsWith('image/'),
            )
            if (!file) return
            event.preventDefault()
            select(file)
        }
        document.addEventListener('paste', onPaste)
        return () => document.removeEventListener('paste', onPaste)
    }, [disabled, select])

    const pasteFromClipboard = async () => {
        if (!navigator.clipboard?.read) {
            setError(
                'Your browser blocks clipboard access here. Press Ctrl+V instead.',
            )
            return
        }
        try {
            for (const item of await navigator.clipboard.read()) {
                const type = item.types.find((t) => ACCEPTED_TYPES.includes(t))
                if (type) {
                    const blob = await item.getType(type)
                    select(
                        new File([blob], `clipboard.${type.split('/')[1]}`, {
                            type,
                        }),
                    )
                    return
                }
            }
            setError('No image found on the clipboard. Copy an image first.')
        } catch {
            setError('Clipboard access was denied. Press Ctrl+V instead.')
        }
    }

    const savedSrc = isRenderableImageSrc(value) ? value : null
    const previewSrc = pending?.previewUrl ?? savedSrc
    const hasImage = Boolean(previewSrc)

    const remove = () => {
        setError(null)
        onPendingChange(null)
        onChange('')
    }

    return (
        <div className="flex flex-col gap-2">
            <Upload
                draggable
                showList={false}
                uploadLimit={1}
                accept={ACCEPTED_TYPES.join(',')}
                disabled={disabled}
                className="min-h-56 overflow-hidden"
                onChange={(files) => {
                    const file = files[files.length - 1]
                    if (file) select(file)
                }}
            >
                {previewSrc ? (
                    <div className="flex w-full flex-col items-center gap-3 p-4">
                        <div className="relative h-40 w-full max-w-xs overflow-hidden rounded-lg bg-white dark:bg-gray-900">
                            <Image
                                src={previewSrc}
                                alt="Product photo preview"
                                fill
                                sizes="320px"
                                unoptimized={
                                    Boolean(pending) ||
                                    isUnoptimizedImage(previewSrc)
                                }
                                className="object-contain"
                            />
                        </div>
                        <div className="text-center text-xs text-gray-500">
                            {pending ? (
                                <>
                                    <span className="font-semibold text-primary">
                                        New photo
                                    </span>{' '}
                                    · {pending.file.name} ·{' '}
                                    {formatSize(pending.file.size)} · saved when
                                    you click Save
                                </>
                            ) : (
                                'Current photo'
                            )}
                            <div className="mt-0.5">
                                Drop or click to replace
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm">
                        <HiOutlineCloudUpload className="text-4xl text-gray-400" />
                        <div>
                            <span className="font-semibold text-primary">
                                Click to choose
                            </span>{' '}
                            or drag a photo here
                        </div>
                        <div className="text-xs text-gray-500">
                            PNG, JPG, WEBP or GIF up to 5 MB · or press Ctrl+V
                            to paste
                        </div>
                    </div>
                )}
            </Upload>
            <div className="flex flex-wrap gap-2">
                <Button
                    type="button"
                    size="xs"
                    icon={<HiOutlineClipboard />}
                    disabled={disabled}
                    onClick={() => void pasteFromClipboard()}
                >
                    Paste from clipboard
                </Button>
                {hasImage ? (
                    <Button
                        type="button"
                        size="xs"
                        variant="plain"
                        icon={<HiOutlineTrash />}
                        disabled={disabled}
                        onClick={remove}
                    >
                        Remove photo
                    </Button>
                ) : null}
            </div>
            {error ? <p className="text-xs text-red-600">{error}</p> : null}
        </div>
    )
}

export default ProductImagePicker
