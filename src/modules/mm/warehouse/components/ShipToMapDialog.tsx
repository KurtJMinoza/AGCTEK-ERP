'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { HiOutlineMap } from 'react-icons/hi'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'

const ShipToPinMap = dynamic(
    () => import('./ShipToPinMap'),
    {
        ssr: false,
        loading: () => (
            <div className="h-72 animate-pulse rounded-xl bg-gray-100 sm:h-80 dark:bg-gray-800" />
        ),
    },
)

type ShipToMapDialogProps = {
    isOpen: boolean
    latitude: number | null
    longitude: number | null
    onClose: () => void
    onConfirm: (latitude: number, longitude: number) => void
}

/** Viewer/editor for the package delivery pin before SCM release. */
export default function ShipToMapDialog({
    isOpen,
    latitude,
    longitude,
    onClose,
    onConfirm,
}: ShipToMapDialogProps) {
    const initial = useMemo(
        () => ({
            lat: latitude ?? 0,
            lng: longitude ?? 0,
        }),
        [latitude, longitude],
    )
    const [pin, setPin] = useState(initial)

    useEffect(() => {
        if (isOpen) setPin(initial)
        // Re-seed the draft pin each time the dialog opens from its current value.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, latitude, longitude])

    const confirmed =
        Number.isFinite(pin.lat) && Number.isFinite(pin.lng) && pin.lat !== 0 && pin.lng !== 0

    return (
        <Dialog
            isOpen={isOpen}
            width={720}
            onClose={onClose}
            onRequestClose={onClose}
            contentClassName="!p-0 !overflow-hidden"
        >
            <div className="flex max-h-[calc(100dvh-1.5rem)] flex-col">
                <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                    <div className="bg-primary-subtle flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-primary-deep">
                        <HiOutlineMap size={22} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h4 className="text-base font-semibold text-gray-800 dark:text-gray-200">
                            Delivery pin
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Drag the pin or click the map to place the delivery location.
                        </p>
                    </div>
                    <button
                        type="button"
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    {isOpen && confirmed ? (
                        <ShipToPinMap
                            latitude={pin.lat}
                            longitude={pin.lng}
                            onPinChange={(lat, lng) => setPin({ lat, lng })}
                        />
                    ) : isOpen ? (
                        <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-gray-300 text-sm text-gray-500 dark:border-gray-700">
                            No delivery pin yet — confirm on the next step.
                        </div>
                    ) : null}
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3 dark:border-gray-700 dark:bg-gray-900/40">
                    <Button type="button" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        variant="solid"
                        disabled={!confirmed}
                        onClick={() => onConfirm(pin.lat, pin.lng)}
                    >
                        Use this pin
                    </Button>
                </div>
            </div>
        </Dialog>
    )
}