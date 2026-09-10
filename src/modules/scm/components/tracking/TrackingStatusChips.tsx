'use client'

import StatusBadge from '@/components/shared/StatusBadge'
import {
    formatFixQuality,
    type GpsFixQuality,
} from '../../utils/trackingMetrics'
import type { ScmTrackingLiveStatus } from '../../services/scmTrackingSocket'

type TrackingStatusChipsProps = {
    fixQuality: GpsFixQuality
    speedKmh: number | null
    plateNumber?: string | null
    liveStatus?: ScmTrackingLiveStatus
    liveTransport?: string | null
}

export default function TrackingStatusChips({
    fixQuality,
    speedKmh,
    plateNumber,
    liveStatus,
    liveTransport,
}: TrackingStatusChipsProps) {
    const fixTone =
        fixQuality === 'excellent' || fixQuality === 'good'
            ? 'success'
            : fixQuality === 'fair'
              ? 'warning'
              : fixQuality === 'stale'
                ? 'danger'
                : 'default'

    const liveTone =
        liveStatus === 'live'
            ? 'success'
            : liveStatus === 'connecting' || liveStatus === 'reconnecting'
              ? 'warning'
              : 'danger'

    const liveLabel =
        liveStatus === 'live'
            ? `Live · ${liveTransport ?? 'socket'}`
            : liveStatus === 'connecting'
              ? 'Connecting…'
              : liveStatus === 'reconnecting'
                ? 'Reconnecting…'
                : 'Offline (HTTP poll)'

    return (
        <div className="flex flex-wrap items-center gap-2">
            {liveStatus ? (
                <StatusBadge tone={liveTone}>{liveLabel}</StatusBadge>
            ) : null}
            {plateNumber ? (
                <StatusBadge tone="info">{plateNumber}</StatusBadge>
            ) : (
                <StatusBadge tone="default">Fleet view</StatusBadge>
            )}
            <StatusBadge tone={fixTone}>
                GPS Fix · {formatFixQuality(fixQuality)}
            </StatusBadge>
            <StatusBadge tone="info">
                Speed ·{' '}
                {speedKmh != null ? `${speedKmh.toFixed(0)} km/h` : '—'}
            </StatusBadge>
        </div>
    )
}
