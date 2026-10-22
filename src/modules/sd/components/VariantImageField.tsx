'use client'

import { useRef, useState } from 'react'
import Spinner from '@/components/ui/Spinner'
import { HiOutlinePhotograph, HiOutlineUpload, HiOutlineX } from 'react-icons/hi'
import { uploadProductImage } from '@/modules/sd/services/productCatalogService'

type Props = {
    /** Current image URL (empty = no image). */
    value?: string
    /** Receives the new URL, or '' when the image is removed. */
    onChange: (imageUrl: string) => void
    disabled?: boolean
    /** Thumbnail size class — the default fits the variant rows. */
    className?: string
    label?: string
    hint?: string
}

/**
 * Image picker for a product variant.
 *
 * ONE uploader for the whole Product Catalog: the Add Variant dialog and the
 * Options & Variants step share it, so the behaviour (preview, replace,
 * remove, upload error) is identical everywhere. The file is uploaded to the
 * catalog image endpoint; the returned URL is saved on the variant.
 */
const VariantImageField = ({
    value = '',
    onChange,
    disabled = false,
    className = 'h-12 w-12',
    label = 'Upload image',
    hint = 'PNG, JPG, WEBP — up to 5 MB',
}: Props) => {
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const inputRef = useRef<HTMLInputElement | null>(null)

    const handleFile = async (file: File | null | undefined) => {
        if (!file) return
        setUploading(true)
        setError(null)
        try {
            const url = await uploadProductImage(file)
            onChange(url)
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Unable to upload image',
            )
        } finally {
            setUploading(false)
        }
    }

    return (
        <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
                {value ? (
                    <span className="relative shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={value}
                            alt=""
                            className={`${className} rounded-lg border border-gray-200 object-cover dark:border-gray-700`}
                        />
                        <button
                            type="button"
                            aria-label="Remove image"
                            disabled={disabled || uploading}
                            className="absolute -right-1.5 -top-1.5 rounded-full border border-gray-200 bg-white p-0.5 text-gray-500 shadow hover:text-red-500 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800"
                            onClick={() => {
                                setError(null)
                                onChange('')
                            }}
                        >
                            <HiOutlineX className="h-3 w-3" />
                        </button>
                    </span>
                ) : (
                    <span
                        className={`flex ${className} shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-200 text-gray-300 dark:border-gray-700 dark:text-gray-600`}
                    >
                        <HiOutlinePhotograph className="h-5 w-5" />
                    </span>
                )}
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:border-primary hover:text-primary dark:border-gray-600 dark:text-gray-300">
                    {uploading ? (
                        <>
                            <Spinner size={14} /> Uploading…
                        </>
                    ) : (
                        <>
                            <HiOutlineUpload className="h-4 w-4" />{' '}
                            {value ? 'Replace image' : label}
                        </>
                    )}
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={disabled || uploading}
                        onChange={(event) => {
                            void handleFile(event.target.files?.[0])
                            event.target.value = ''
                        }}
                    />
                </label>
                <span className="text-[11px] text-gray-400">{hint}</span>
            </div>
            {error ? (
                <p className="text-[11px] font-medium text-red-600">{error}</p>
            ) : null}
        </div>
    )
}

export default VariantImageField
