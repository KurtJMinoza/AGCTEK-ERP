'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Alert from '@/components/ui/Alert'
import Spinner from '@/components/ui/Spinner'
import {
    DEFAULT_MAP_CENTER,
    reverseGeocode,
    searchAddress,
    type GeocodeResult,
} from '../../utils/geocode'

const LocationPickerMap = dynamic(() => import('./LocationPickerMap'), {
    ssr: false,
    loading: () => (
        <div className="flex h-[280px] items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700">
            <Spinner size={28} />
        </div>
    ),
})

export type PickedLocation = {
    address: string
    lat: number
    lng: number
}

type LocationPickerDialogProps = {
    isOpen: boolean
    initialAddress?: string
    initialLat?: number | null
    initialLng?: number | null
    onClose: () => void
    onConfirm: (location: PickedLocation) => void
}

export default function LocationPickerDialog({
    isOpen,
    initialAddress = '',
    initialLat,
    initialLng,
    onClose,
    onConfirm,
}: LocationPickerDialogProps) {
    const hasInitial =
        initialLat != null &&
        initialLng != null &&
        Number.isFinite(initialLat) &&
        Number.isFinite(initialLng)

    const [query, setQuery] = useState(initialAddress)
    const [lat, setLat] = useState(
        hasInitial ? initialLat! : DEFAULT_MAP_CENTER.lat,
    )
    const [lng, setLng] = useState(
        hasInitial ? initialLng! : DEFAULT_MAP_CENTER.lng,
    )
    const [address, setAddress] = useState(initialAddress)
    const [results, setResults] = useState<GeocodeResult[]>([])
    const [searching, setSearching] = useState(false)
    const [resolving, setResolving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!isOpen) return
        const nextHas =
            initialLat != null &&
            initialLng != null &&
            Number.isFinite(initialLat) &&
            Number.isFinite(initialLng)
        setQuery(initialAddress)
        setAddress(initialAddress)
        setLat(nextHas ? initialLat! : DEFAULT_MAP_CENTER.lat)
        setLng(nextHas ? initialLng! : DEFAULT_MAP_CENTER.lng)
        setResults([])
        setError(null)
        setSearching(false)
        setResolving(false)
    }, [isOpen, initialAddress, initialLat, initialLng])

    const runSearch = async () => {
        setSearching(true)
        setError(null)
        try {
            const found = await searchAddress(query)
            setResults(found)
            if (found.length === 0) {
                setError('No places found for that search.')
            }
        } catch {
            setError('Address search failed. You can still click the map.')
        } finally {
            setSearching(false)
        }
    }

    const applyResult = (result: GeocodeResult) => {
        setLat(result.lat)
        setLng(result.lng)
        setAddress(result.displayName)
        setQuery(result.displayName)
        setResults([])
    }

    const onMapPick = async (nextLat: number, nextLng: number) => {
        setLat(nextLat)
        setLng(nextLng)
        setResolving(true)
        setError(null)
        try {
            const label = await reverseGeocode(nextLat, nextLng)
            if (label) {
                setAddress(label)
                setQuery(label)
            } else if (!address.trim()) {
                setAddress(`${nextLat.toFixed(5)}, ${nextLng.toFixed(5)}`)
            }
        } catch {
            // Keep pin; address may stay as typed text
        } finally {
            setResolving(false)
        }
    }

    const confirm = () => {
        const label =
            address.trim() ||
            query.trim() ||
            `${lat.toFixed(5)}, ${lng.toFixed(5)}`
        onConfirm({ address: label, lat, lng })
        onClose()
    }

    return (
        <Dialog
            isOpen={isOpen}
            width={640}
            // Stack above Plan trip wizard (overlay z-40)
            overlayClassName="!z-[60]"
            className="!z-[61]"
            onClose={onClose}
            onRequestClose={onClose}
            shouldCloseOnOverlayClick={false}
        >
            <div className="mb-4 pe-8">
                <h5 className="mb-1">Pick location</h5>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Search or click/drag the pin. Coordinates are saved on the
                    stop for Tracking map pins.
                </p>
            </div>

            {error ? (
                <Alert showIcon type="danger" className="mb-3">
                    {error}
                </Alert>
            ) : null}

            <div className="mb-3 flex gap-2">
                <Input
                    className="flex-1"
                    value={query}
                    placeholder="Search address…"
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault()
                            void runSearch()
                        }
                    }}
                />
                <Button
                    type="button"
                    loading={searching}
                    onClick={() => void runSearch()}
                >
                    Search
                </Button>
            </div>

            {results.length > 0 ? (
                <ul className="mb-3 max-h-28 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                    {results.map((result) => (
                        <li key={`${result.lat}:${result.lng}:${result.displayName}`}>
                            <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50"
                                onClick={() => applyResult(result)}
                            >
                                {result.displayName}
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}

            <LocationPickerMap lat={lat} lng={lng} onPick={onMapPick} />

            <p className="mt-2 text-xs text-gray-500">
                {resolving
                    ? 'Resolving address…'
                    : `${lat.toFixed(5)}, ${lng.toFixed(5)}`}
            </p>

            <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="plain" onClick={onClose}>
                    Cancel
                </Button>
                <Button type="button" variant="solid" onClick={confirm}>
                    Use location
                </Button>
            </div>
        </Dialog>
    )
}
