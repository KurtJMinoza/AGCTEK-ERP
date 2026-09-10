'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import dayjs from 'dayjs'
import Button from '@/components/ui/Button'
import StatusBadge from '@/components/shared/StatusBadge'
import type { FleetTrackingItem } from '../../types'
import { formatStatusLabel, statusTone } from '../../utils/status'

type TrackingUnitCalloutProps = {
    item: FleetTrackingItem | null
    onCenter: () => void
    onClear: () => void
}

/**
 * Selected-unit callout (fleet map focus). Links to vehicle detail /
 * future Live Telematics — does not embed OBD analytics here.
 */
export default function TrackingUnitCallout({
    item,
    onCenter,
    onClear,
}: TrackingUnitCalloutProps) {
    if (!item) {
        return (
            <div className="flex h-full min-h-[160px] flex-1 items-center justify-center px-4 py-8 text-center text-sm text-gray-500">
                Select a vehicle on the map or list to focus the unit.
            </div>
        )
    }

    const { vehicle, latest, activeTrip } = item

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-900 dark:text-gray-100">
                            {vehicle.plateNumber}
                        </span>
                        <StatusBadge tone={statusTone(vehicle.status)}>
                            {formatStatusLabel(vehicle.status)}
                        </StatusBadge>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                        {vehicle.code} · {vehicle.make} {vehicle.model}
                    </p>
                </div>
                <Button size="xs" onClick={onClear}>
                    Clear
                </Button>
            </div>

            <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="solid" onClick={onCenter}>
                    Center unit
                </Button>
                <Link href={`/scm/vehicles/${vehicle.id}`}>
                    <Button size="sm">Open Live Telematics</Button>
                </Link>
            </div>

            <dl className="space-y-3 text-sm">
                <DetailRow
                    label="Telematics ident"
                    value={vehicle.telematicsDeviceId || '—'}
                />
                <DetailRow
                    label="Odometer"
                    value={`${vehicle.odometerKm.toLocaleString()} km`}
                />
                {latest ? (
                    <>
                        <DetailRow
                            label="Coordinates"
                            value={`${latest.latitude.toFixed(5)}, ${latest.longitude.toFixed(5)}`}
                        />
                        <DetailRow
                            label="Speed"
                            value={`${latest.speedKmh.toFixed(0)} km/h`}
                        />
                        <DetailRow
                            label="Heading"
                            value={
                                latest.heading != null
                                    ? `${latest.heading.toFixed(0)}°`
                                    : '—'
                            }
                        />
                        <DetailRow
                            label="Last ping"
                            value={dayjs(latest.recordedAt).format(
                                'YYYY-MM-DD HH:mm:ss',
                            )}
                        />
                    </>
                ) : (
                    <DetailRow label="GPS" value="No position reported" />
                )}
                <DetailRow
                    label="Active trip"
                    value={
                        activeTrip ? (
                            <span className="inline-flex flex-col gap-0.5">
                                <Link
                                    href="/scm/trips"
                                    className="font-medium text-primary hover:underline"
                                >
                                    {activeTrip.code}
                                </Link>
                                <span className="text-xs text-gray-500">
                                    {formatStatusLabel(activeTrip.status)}
                                    {activeTrip.status === 'IN_TRANSIT'
                                        ? ' · live'
                                        : ''}
                                </span>
                            </span>
                        ) : (
                            'None'
                        )
                    }
                />
            </dl>
        </div>
    )
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div>
            <dt className="text-xs uppercase tracking-wide text-gray-400">
                {label}
            </dt>
            <dd className="mt-0.5 text-gray-800 dark:text-gray-200">{value}</dd>
        </div>
    )
}
