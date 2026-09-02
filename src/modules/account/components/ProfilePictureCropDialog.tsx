'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Slider from '@/components/ui/Slider'
import {
    CROP_VIEWPORT_SIZE,
    clampCropTransform,
    cropImageToDataUrl,
    getBaseScale,
    type CropTransform,
} from '@/modules/account/utils/cropImage'

type ProfilePictureCropDialogProps = {
    image: HTMLImageElement | null
    isOpen: boolean
    applying?: boolean
    onClose: () => void
    onApply: (avatar: string) => Promise<void>
}

const DEFAULT_TRANSFORM: CropTransform = {
    x: 0,
    y: 0,
    zoom: 1,
}

const ProfilePictureCropDialog = ({
    image,
    isOpen,
    applying = false,
    onClose,
    onApply,
}: ProfilePictureCropDialogProps) => {
    const dragStateRef = useRef<{
        pointerId: number
        startX: number
        startY: number
        originX: number
        originY: number
    } | null>(null)

    const [transform, setTransform] = useState<CropTransform>(DEFAULT_TRANSFORM)

    useEffect(() => {
        if (isOpen) {
            setTransform(DEFAULT_TRANSFORM)
        }
    }, [image, isOpen])

    const updateTransform = useCallback(
        (next: CropTransform) => {
            if (!image) {
                return
            }

            setTransform(clampCropTransform(image, next))
        },
        [image],
    )

    const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
        if (!image) {
            return
        }

        dragStateRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            originX: transform.x,
            originY: transform.y,
        }

        event.currentTarget.setPointerCapture(event.pointerId)
    }

    const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
        const dragState = dragStateRef.current

        if (!dragState || dragState.pointerId !== event.pointerId || !image) {
            return
        }

        updateTransform({
            ...transform,
            x: dragState.originX + (event.clientX - dragState.startX),
            y: dragState.originY + (event.clientY - dragState.startY),
        })
    }

    const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
        if (dragStateRef.current?.pointerId === event.pointerId) {
            dragStateRef.current = null
            event.currentTarget.releasePointerCapture(event.pointerId)
        }
    }

    const handleApply = async () => {
        if (!image) {
            return
        }

        const avatar = cropImageToDataUrl(image, transform)
        await onApply(avatar)
    }

    const baseScale = image ? getBaseScale(image) : 1
    const scale = baseScale * transform.zoom
    const imageWidth = image?.naturalWidth || image?.width || 0
    const imageHeight = image?.naturalHeight || image?.height || 0
    const imageStyle = image
        ? {
              width: imageWidth * scale,
              height: imageHeight * scale,
              transform: `translate(calc(-50% + ${transform.x}px), calc(-50% + ${transform.y}px))`,
          }
        : undefined

    return (
        <Dialog
            isOpen={isOpen}
            width={480}
            onClose={onClose}
            onRequestClose={onClose}
        >
            <h5 className="mb-1 text-lg font-semibold heading-text">
                Crop profile picture
            </h5>
            <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
                Drag to reposition and use the slider to zoom in or out.
            </p>

            <div
                className="relative mx-auto overflow-hidden rounded-full border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
                style={{
                    width: CROP_VIEWPORT_SIZE,
                    height: CROP_VIEWPORT_SIZE,
                    touchAction: 'none',
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            >
                {image ? (
                    <img
                        alt="Crop preview"
                        src={image.src}
                        draggable={false}
                        className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                        style={imageStyle}
                    />
                ) : null}
                <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/20" />
            </div>

            <div className="mt-6">
                <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium heading-text">Zoom</span>
                    <span className="text-gray-500 dark:text-gray-400">
                        {Math.round(transform.zoom * 100)}%
                    </span>
                </div>
                <Slider
                    min={1}
                    max={3}
                    step={0.01}
                    value={transform.zoom}
                    onChange={(zoom) => updateTransform({ ...transform, zoom })}
                />
            </div>

            <div className="mt-6 flex justify-end gap-2">
                <Button variant="plain" disabled={applying} onClick={onClose}>
                    Cancel
                </Button>
                <Button
                    variant="solid"
                    loading={applying}
                    onClick={handleApply}
                >
                    Apply
                </Button>
            </div>
        </Dialog>
    )
}

export default ProfilePictureCropDialog
