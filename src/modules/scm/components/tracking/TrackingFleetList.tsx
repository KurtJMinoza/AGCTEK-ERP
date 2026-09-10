'use client'

import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import ScrollBar from '@/components/ui/ScrollBar'
import Spinner from '@/components/ui/Spinner'
import StatusBadge from '@/components/shared/StatusBadge'
import classNames from '@/utils/classNames'
import type { FleetTrackingItem } from '../../types'
import { formatStatusLabel, statusTone } from '../../utils/status'
import { fleetMarkerKind } from '../../utils/trackingMetrics'

dayjs.extend(relativeTime)

type TrackingFleetListProps = {
    items: FleetTrackingItem[]
    selectedVehicleId: string | null
    loading?: boolean
    onSelect: (vehicleId: string) => void
    /** Prefer In Transit first for last-mile visibility */
    prioritizeInTransit?: boolean
}

export default function TrackingFleetList({
    items,
    selectedVehicleId,
    loading,
    onSelect,
    prioritizeInTransit = true,
}: TrackingFleetListProps) {
    const sorted = [...items].sort((a, b) => {
        if (prioritizeInTransit) {
            const aIn = a.vehicle.status === 'IN_TRANSIT' ? 0 : 1
            const bIn = b.vehicle.status === 'IN_TRANSIT' ? 0 : 1
            if (aIn !== bIn) return aIn - bIn
        }
        const aGps = a.latest ? 0 : 1
        const bGps = b.latest ? 0 : 1
        if (aGps !== bGps) return aGps - bGps
        return a.vehicle.plateNumber.localeCompare(b.vehicle.plateNumber)
    })

    return (
        <div className="flex h-full flex-col">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                <h5 className="text-sm font-semibold">Fleet units</h5>
                <p className="text-xs text-gray-500">
                    Focus one unit — nearby fleet stays on the map
                </p>
            </div>

            {loading && items.length === 0 ? (
                <div className="flex flex-1 items-center justify-center py-16">
                    <Spinner size={32} />
                </div>
            ) : sorted.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-gray-500">
                    No vehicles match the current filters.
                </div>
            ) : (
                <ScrollBar className="max-h-[min(520px,55vh)] flex-1">
                    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                        {sorted.map((item) => {
                            const kind = fleetMarkerKind(item)
                            const selected =
                                item.vehicle.id === selectedVehicleId
                            return (
                                <li key={item.vehicle.id}>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            onSelect(item.vehicle.id)
                                        }
                                        className={classNames(
                                            'flex w-full flex-col gap-1 px-4 py-3 text-left transition',
                                            selected
                                                ? 'bg-primary-subtle'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-800/60',
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                                                {item.vehicle.plateNumber}
                                            </span>
                                            <StatusBadge
                                                tone={statusTone(
                                                    item.vehicle.status,
                                                )}
                                            >
                                                {formatStatusLabel(
                                                    item.vehicle.status,
                                                )}
                                            </StatusBadge>
                                        </div>
                                        <p className="truncate text-xs text-gray-500">
                                            {item.vehicle.code} ·{' '}
                                            {kind.replace('_', ' ')}
                                            {item.latest
                                                ? ` · ${item.latest.speedKmh.toFixed(0)} km/h`
                                                : ''}
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            {item.latest
                                                ? `Updated ${dayjs(item.latest.recordedAt).fromNow()}`
                                                : 'No GPS yet'}
                                        </p>
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                </ScrollBar>
            )}
        </div>
    )
}
