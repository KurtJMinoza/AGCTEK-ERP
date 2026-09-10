'use client'

import AdaptiveCard from '@/components/shared/AdaptiveCard'
import {
    formatFixQuality,
    type TrackingMetrics,
} from '../../utils/trackingMetrics'

type TrackingStatsBarProps = {
    metrics: TrackingMetrics
    emptyHint?: string
}

export default function TrackingStatsBar({
    metrics,
    emptyHint = 'Select a unit to see trip metrics',
}: TrackingStatsBarProps) {
    const hasUnit = metrics.odometerKm != null || metrics.gpsFixQuality !== 'none'

    return (
        <AdaptiveCard bodyClass="py-3">
            {!hasUnit ? (
                <p className="text-center text-sm text-gray-500">{emptyHint}</p>
            ) : (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <Stat
                        label="Total trip distance"
                        value={
                            metrics.totalTripDistanceKm != null
                                ? `${metrics.totalTripDistanceKm.toFixed(1)} km`
                                : '—'
                        }
                    />
                    <Stat
                        label="Average journey speed"
                        value={
                            metrics.averageJourneySpeedKmh != null
                                ? `${metrics.averageJourneySpeedKmh.toFixed(0)} km/h`
                                : '—'
                        }
                    />
                    <Stat
                        label="GPS fix quality"
                        value={formatFixQuality(metrics.gpsFixQuality)}
                    />
                    <Stat
                        label="Odometer reading"
                        value={
                            metrics.odometerKm != null
                                ? `${metrics.odometerKm.toLocaleString()} km`
                                : '—'
                        }
                    />
                </div>
            )}
        </AdaptiveCard>
    )
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-700">
            <p className="text-[11px] uppercase tracking-wide text-gray-400">
                {label}
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                {value}
            </p>
        </div>
    )
}
