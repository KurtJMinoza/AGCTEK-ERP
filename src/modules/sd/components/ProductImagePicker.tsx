'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { HiOutlineClipboard, HiOutlinePhotograph, HiOutlineTrash } from 'react-icons/hi'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import Upload from '@/components/ui/Upload'
import { isRenderableImageSrc, isUnoptimizedImage } from '@/utils/productImage'
import { uploadProductImage } from '../services/productCatalogService'

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const MAX_BYTES = 5 * 1024 * 1024

type ProductImagePickerProps = {
    value: string
    onChange: (imageUrl: string) => void
    onUploadingChange?: (uploading: boolean) => void
    disabled?: boolean
}

const validate = (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) return 'Use a PNG, JPG, WEBP or GIF image.'
    if (file.size > MAX_BYTES) return 'Image must be 5 MB or smaller.'
    return null
}

/** Product photo from the computer (browse / drag & drop) or the clipboard (Ctrl+V or button). */
const ProductImagePicker = ({
    value,
    onChange,
    onUploadingChange,
    disabled,
}: ProductImagePickerProps) => {
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const upload = useCallback(
        async (file: File) => {
            const problem = validate(file)
            if (problem) {
                setError(problem)
                return
            }
            setError(null)
            setUploading(true)
            onUploadingChange?.(true)
            try {
                onChange(await uploadProductImage(file))
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Upload failed.')
            } finally {
                setUploading(false)
                onUploadingChange?.(false)
            }
        },
        [onChange, onUploadingChange],
    )

    useEffect(() => {
        if (disabled) return
        const onPaste = (event: ClipboardEvent) => {
            const file = Array.from(event.clipboardData?.files ?? []).find((f) =>
                f.type.startsWith('image/'),
            )
            if (!file) return
            event.preventDefault()
            void upload(file)
        }
        document.addEventListener('paste', onPaste)
        return () => document.removeEventListener('paste', onPaste)
    }, [disabled, upload])

    const pasteFromClipboard = async () => {
        if (!navigator.clipboard?.read) {
            setError('Your browser blocks clipboard access here. Press Ctrl+V instead.')
            return
        }
        try {
            for (const item of await navigator.clipboard.read()) {
                const type = item.types.find((t) => ACCEPTED_TYPES.includes(t))
                if (type) {
                    const blob = await item.getType(type)
                    await upload(new File([blob], `clipboard.${type.split('/')[1]}`, { type }))
                    return
                }
            }
            setError('No image found on the clipboard. Copy an image first.')
        } catch {
            setError('Clipboard access was denied. Press Ctrl+V instead.')
        }
    }

    const hasImage = isRenderableImageSrc(value)

    return (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="relative flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                {hasImage ? (
                    <Image
                        src={value}
                        alt="Product photo"
                        fill
                        sizes="128px"
                        unoptimized={isUnoptimizedImage(value)}
                        className="object-cover"
                    />
                ) : (
                    <HiOutlinePhotograph className="text-3xl text-gray-400" />
                )}
                {uploading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-gray-900/70">
                        <Spinner size={28} />
                    </div>
                ) : null}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Upload
                    draggable
                    showList={false}
                    accept={ACCEPTED_TYPES.join(',')}
                    disabled={disabled || uploading}
                    className="min-h-[5.5rem]"
                    onChange={(files) => {
                        const file = files[files.length - 1]
                        if (file) void upload(file)
                    }}
                >
                    <div className="px-3 py-4 text-center text-sm">
                        <span className="font-semibold text-primary">Choose a photo</span>{' '}
                        or drag it here
                        <div className="mt-1 text-xs text-gray-500">
                            PNG, JPG, WEBP or GIF up to 5 MB · or press Ctrl+V to paste
                        </div>
                    </div>
                </Upload>
                <div className="flex flex-wrap gap-2">
                    <Button
                        type="button"
                        size="xs"
                        icon={<HiOutlineClipboard />}
                        disabled={disabled || uploading}
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
                            disabled={disabled || uploading}
                            onClick={() => onChange('')}
                        >
                            Remove photo
                        </Button>
                    ) : null}
                </div>
                {error ? <p className="text-xs text-red-600">{error}</p> : null}
            </div>
        </div>
    )
}

export default ProductImagePicker
