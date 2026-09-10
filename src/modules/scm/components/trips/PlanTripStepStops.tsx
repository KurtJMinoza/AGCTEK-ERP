'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import { FormItem } from '@/components/ui/Form'
import Input from '@/components/ui/Input'
import type { WizardStopDraft } from '../../hooks/usePlanTripWizard'
import LocationSearchField from '../location/LocationSearchField'
import LocationPickerDialog from './LocationPickerDialog'

type PlanTripStepStopsProps = {
    stops: WizardStopDraft[]
    onUpdate: (key: string, patch: Partial<WizardStopDraft>) => void
    onAdd: () => void
    onRemove: (key: string) => void
    onMove: (key: string, direction: -1 | 1) => void
}

export default function PlanTripStepStops({
    stops,
    onUpdate,
    onAdd,
    onRemove,
    onMove,
}: PlanTripStepStopsProps) {
    const [pickerKey, setPickerKey] = useState<string | null>(null)
    const picking = stops.find((stop) => stop.key === pickerKey) ?? null

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Define stop sequence and delivery windows. Search an address
                    to fill coordinates (DRAFT may keep text-only; pins help
                    Tracking).
                </p>
                <Button type="button" size="sm" onClick={onAdd}>
                    Add stop
                </Button>
            </div>

            <div className="max-h-[50vh] space-y-3 overflow-y-auto pe-1">
                {stops.map((stop, index) => (
                    <div
                        key={stop.key}
                        className="rounded-xl border border-gray-200 p-3 dark:border-gray-700"
                    >
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                Stop {index + 1}
                            </p>
                            <div className="flex gap-1">
                                <Button
                                    type="button"
                                    size="xs"
                                    disabled={index === 0}
                                    onClick={() => onMove(stop.key, -1)}
                                >
                                    Up
                                </Button>
                                <Button
                                    type="button"
                                    size="xs"
                                    disabled={index === stops.length - 1}
                                    onClick={() => onMove(stop.key, 1)}
                                >
                                    Down
                                </Button>
                                <Button
                                    type="button"
                                    size="xs"
                                    variant="plain"
                                    className="text-red-600"
                                    disabled={stops.length <= 1}
                                    onClick={() => onRemove(stop.key)}
                                >
                                    Remove
                                </Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <FormItem label="Name">
                                <Input
                                    value={stop.name}
                                    placeholder="Pickup / Deliver…"
                                    onChange={(e) =>
                                        onUpdate(stop.key, {
                                            name: e.target.value,
                                        })
                                    }
                                />
                            </FormItem>
                            <FormItem label="Address" className="md:col-span-2">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                                    <LocationSearchField
                                        className="flex-1"
                                        value={stop.address}
                                        placeholder="Search address…"
                                        countryBias="Philippines"
                                        onChange={(location) =>
                                            onUpdate(stop.key, {
                                                address: location.address,
                                                lat: location.lat ?? null,
                                                lng: location.lng ?? null,
                                            })
                                        }
                                    />
                                    <Button
                                        type="button"
                                        size="sm"
                                        className="shrink-0"
                                        onClick={() => setPickerKey(stop.key)}
                                    >
                                        Pick on map
                                    </Button>
                                </div>
                                {stop.lat != null && stop.lng != null ? (
                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                            Pin {stop.lat.toFixed(5)},{' '}
                                            {stop.lng.toFixed(5)}
                                        </span>
                                        <button
                                            type="button"
                                            className="text-red-600 hover:underline"
                                            onClick={() =>
                                                onUpdate(stop.key, {
                                                    lat: null,
                                                    lng: null,
                                                })
                                            }
                                        >
                                            Clear pin
                                        </button>
                                    </div>
                                ) : (
                                    <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                                        No coordinates yet — you can continue;
                                        Tracking needs a pin for this stop.
                                    </p>
                                )}
                            </FormItem>
                            <FormItem label="Window start">
                                <Input
                                    type="datetime-local"
                                    value={stop.windowStart}
                                    onChange={(e) =>
                                        onUpdate(stop.key, {
                                            windowStart: e.target.value,
                                        })
                                    }
                                />
                            </FormItem>
                            <FormItem label="Window end">
                                <Input
                                    type="datetime-local"
                                    value={stop.windowEnd}
                                    onChange={(e) =>
                                        onUpdate(stop.key, {
                                            windowEnd: e.target.value,
                                        })
                                    }
                                />
                            </FormItem>
                        </div>
                    </div>
                ))}
            </div>

            <LocationPickerDialog
                isOpen={pickerKey != null}
                initialAddress={picking?.address}
                initialLat={picking?.lat}
                initialLng={picking?.lng}
                onClose={() => setPickerKey(null)}
                onConfirm={(location) => {
                    if (!pickerKey) return
                    onUpdate(pickerKey, {
                        address: location.address,
                        lat: location.lat,
                        lng: location.lng,
                    })
                }}
            />
        </div>
    )
}
