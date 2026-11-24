'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Segment from '@/components/ui/Segment'
import Spinner from '@/components/ui/Spinner'
import Switcher from '@/components/ui/Switcher'
import StatusBadge from '@/components/shared/StatusBadge'
import type { StatusTone } from '@/components/shared/StatusBadge'
import { useOcularRoutePreview } from '../../hooks/useOcularRoutePreview'
import { formatStatusLabel, statusTone } from '../../utils/status'
import type { DepartureMode, RouteMapPreview, RouteWindowStatus } from '../../types'

const TripRoutePreviewLeaflet = dynamic(() => import('./TripRoutePreviewLeaflet'), {
    ssr: false,
    loading: () => (
        <div className="flex h-[420px] items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700">
            <Spinner size={32} />
        </div>
    ),
})

const STATUS_TONE: Record<RouteWindowStatus, StatusTone> = {
    NO_WINDOW: 'default',
    EARLY: 'warning',
    OK: 'success',
    LATE: 'danger',
}

const STATUS_LABEL: Record<RouteWindowStatus, string> = {
    NO_WINDOW: 'No window',
    EARLY: 'Early',
    OK: 'On time',
    LATE: 'Late',
}

const fmtDateTime = (iso: string | null) =>
    iso
        ? new Date(iso).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
          })
        : '—'

const fmtTime = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '…'

function fmtDuration(sec: number | null) {
    if (sec == null) return '—'
    const totalMin = Math.round(sec / 60)
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`
}

const fmtKm = (m: number | null) => (m == null ? '—' : `${(m / 1000).toFixed(1)} km`)

type OcularRoutePreviewProps = {
    tripId: string | null
    /** Bump after the plan changes (stops added / reordered / removed) to refetch. */
    version?: number
}

/**
 * Planning-only route for one ocular trip: stops in the dispatcher's manual order (pickups
 * first). The backend runs the same schedule algorithm as the delivery preview (ETAs,
 * waiting, window status, recommended start, violations); this component only displays it
 * and reuses the delivery route map. Mount with `key={tripId}` so the controls reset per trip.
 */
export default function OcularRoutePreview({ tripId, version = 0 }: OcularRoutePreviewProps) {
    const [departureMode, setDepartureMode] = useState<DepartureMode>('ON_TIME')
    const [departInput, setDepartInput] = useState('')
    const [returnToOrigin, setReturnToOrigin] = useState(true)

    const request = useMemo(
        () => ({
            departureMode,
            returnToOrigin,
            ...(departInput ? { departAt: new Date(departInput).toISOString() } : {}),
        }),
        [departureMode, departInput, returnToOrigin],
    )
    const { preview, loading, error } = useOcularRoutePreview(tripId, version, request)

    // Dropoffs are numbered visits ("ship to" pin style); pickups use the P pin; the return
    // leg (when on) is the R pin back at the first pickup.
    const mapPreview = useMemo<RouteMapPreview | null>(
        () =>
            preview
                ? {
                      router: preview.router,
                      polyline: preview.polyline,
                      stops: [
                          ...preview.stops.map((stop) => ({
                          key: stop.id,
                          sequence: stop.sequence,
                          type: stop.kind === 'PICKUP' ? ('PICKUP' as const) : ('SHIP_TO' as const),
                          label: stop.label,
                          address: stop.address,
                          lat: stop.lat,
                          lng: stop.lng,
                          etaAt: stop.etaAt,
                          windowStatus: stop.windowStatus,
                          })),
                          ...(preview.returnStop
                              ? [
                                    {
                                        key: 'return',
                                        sequence: preview.stops.length + 1,
                                        type: 'RETURN_TO' as const,
                                        label: preview.returnStop.label,
                                        address: preview.returnStop.address,
                                        lat: preview.returnStop.lat,
                                        lng: preview.returnStop.lng,
                                        etaAt: preview.returnStop.etaAt,
                                        windowStatus: null,
                                    },
                                ]
                              : []),
                      ],
                  }
                : null,
        [preview],
    )

    if (!tripId) {
        return (
            <p className="py-10 text-center text-gray-500">
                Select an ocular trip to preview its route
            </p>
        )
    }
    if (!preview) {
        return error ? (
            <Alert showIcon type="danger" title="Route preview failed">
                {error}
            </Alert>
        ) : (
            <div className="flex justify-center py-16">
                <Spinner size={36} />
            </div>
        )
    }

    const rec = preview.recommendedDeparture
    const hasPins = preview.stops.some((stop) => !stop.missingCoords)
    const scheduled = preview.departAt != null

    return (
        <div className="space-y-4">
            {error ? (
                <Alert showIcon type="danger" title="Route preview failed">
                    {error}
                </Alert>
            ) : null}

            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold heading-text">
                        {preview.tripCode}
                        {preview.vehicle
                            ? ` · ${preview.vehicle.code} (${preview.vehicle.plateNumber})`
                            : ''}
                    </span>
                    {preview.router === 'osrm' ? (
                        <StatusBadge tone="info">Router: OSRM</StatusBadge>
                    ) : preview.router === 'haversine' ? (
                        <StatusBadge tone="warning">
                            <span title={preview.routerFallbackReason ?? undefined}>
                                Router: haversine · Estimated (no router)
                            </span>
                        </StatusBadge>
                    ) : null}
                    <span className="text-xs text-gray-500">
                        Visit time {preview.serviceTimeMin} min per stop
                    </span>
                    {loading ? <Spinner size={16} /> : null}
                </div>

                <div className="flex flex-wrap items-end gap-3">
                    <label className="flex items-center gap-2 text-xs text-gray-500">
                        <Switcher checked={returnToOrigin} onChange={setReturnToOrigin} />
                        Return to first pickup
                    </label>
                    {rec ? (
                    <div className="flex flex-wrap items-end gap-2">
                        <div className="text-xs text-gray-500">
                            Recommended start
                            <Segment
                                size="sm"
                                className="mt-1"
                                value={departureMode}
                                onChange={(v) => v && setDepartureMode(v as DepartureMode)}
                            >
                                <Segment.Item value="EARLY">Early</Segment.Item>
                                <Segment.Item value="ON_TIME">On-Time</Segment.Item>
                            </Segment>
                        </div>
                        <label className="text-xs text-gray-500">
                            Start from (optional)
                            <Input
                                type="datetime-local"
                                size="sm"
                                className="mt-1"
                                value={departInput}
                                onChange={(e) => setDepartInput(e.target.value)}
                            />
                        </label>
                        {departInput ? (
                            <Button size="sm" onClick={() => setDepartInput('')}>
                                Use planned start
                            </Button>
                        ) : null}
                    </div>
                    ) : null}
                </div>
            </div>

            {scheduled ? (
                <div className={`grid grid-cols-1 gap-3 ${rec ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
                    {rec ? (
                        <div className="rounded-xl border border-gray-200 p-3 md:col-span-2 dark:border-gray-700">
                            <p className="text-xs text-gray-500">Recommended start at the first stop</p>
                            <p className="mt-1 text-xl font-bold heading-text">{fmtDateTime(rec.at)}</p>
                            <p className="mt-1 text-xs">
                                {rec.basis === 'LATEST_MEETING_WINDOWS' ? (
                                    <span className="text-emerald-600">
                                        Latest start that still finishes inside the trip window
                                    </span>
                                ) : rec.basis === 'EARLIEST_MEETING_WINDOWS' ? (
                                    <span className="text-emerald-600">
                                        Early — earliest practical start that meets every window
                                    </span>
                                ) : rec.basis === 'NO_DEADLINES' ? (
                                    <span className="text-gray-500">
                                        No deadlines — earliest practical start
                                    </span>
                                ) : (
                                    <span className="text-red-600">
                                        {rec.reason ?? 'Not feasible'} — showing earliest practical start
                                    </span>
                                )}
                            </p>
                        </div>
                    ) : null}
                    <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                        <p className="text-xs text-gray-500">Distance · drive time</p>
                        <p className="mt-1 font-semibold">
                            {preview.routable
                                ? `${fmtKm(preview.totalDistanceM)} · ${fmtDuration(preview.totalDurationSec)}`
                                : '—'}
                        </p>
                    </div>
                    <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                        <p className="text-xs text-gray-500">
                            {preview.returnToOrigin
                                ? 'Starts → back at first pickup'
                                : 'Starts → last visit done'}
                        </p>
                        <p className="mt-1 font-semibold">
                            {fmtTime(preview.departAt)} → {fmtTime(preview.arrivalAt)}
                        </p>
                        <p className="text-xs text-gray-500">
                            {fmtDuration(preview.tripDurationSec)} incl. visits / waiting{preview.returnToOrigin ? ' / return' : ''}
                        </p>
                    </div>
                </div>
            ) : null}

            {preview.stops.length === 0 ? (
                <Alert showIcon type="info">
                    This trip has no stops yet. Use Plan stops to add the places to visit.
                </Alert>
            ) : !preview.routable ? (
                <Alert showIcon type="warning">
                    At least two stops with a map position are needed to draw a route.
                </Alert>
            ) : null}

            {preview.missingCoordsCount > 0 ? (
                <Alert showIcon type="warning" title="Some stops have no map position">
                    {preview.missingCoordsCount} stop(s) are left out of the route, the map and the
                    schedule. Pick the address from the search suggestions to set its position.
                </Alert>
            ) : null}

            {preview.violations.length > 0 ? (
                <Alert showIcon type="warning" title="Schedule issues for this start">
                    <ul className="list-disc pl-4">
                        {preview.violations.map((v, i) => (
                            <li key={`${v.code}-${v.stopId ?? i}`}>{v.message}</li>
                        ))}
                    </ul>
                </Alert>
            ) : preview.feasible ? (
                <Alert showIcon type="success">
                    Every visit finishes inside the trip window for this start.
                </Alert>
            ) : null}

            {hasPins && mapPreview ? <TripRoutePreviewLeaflet preview={mapPreview} /> : null}

            <ol className="space-y-2">
                {preview.stops.map((stop) => (
                    <li
                        key={stop.id}
                        className="flex flex-col gap-2 rounded-lg border border-gray-200 p-3 md:flex-row md:items-center dark:border-gray-700"
                    >
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold dark:bg-gray-700">
                                {stop.sequence}
                            </span>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <StatusBadge tone={stop.kind === 'PICKUP' ? 'warning' : 'info'}>
                                        {stop.kind === 'PICKUP' ? 'Pickup' : 'Dropoff'}
                                    </StatusBadge>
                                    <span className="font-semibold">{stop.label}</span>
                                    <StatusBadge tone={statusTone(stop.status)}>
                                        {formatStatusLabel(stop.status)}
                                    </StatusBadge>
                                    {stop.missingCoords ? (
                                        <StatusBadge tone="danger">No map position</StatusBadge>
                                    ) : null}
                                </div>
                                <p className="truncate text-xs text-gray-500">{stop.address}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-xs md:w-[380px]">
                            <div>
                                <p className="text-gray-500">ETA</p>
                                <p className="font-medium">{fmtDateTime(stop.etaAt)}</p>
                                {stop.legDurationSec != null ? (
                                    <p className="text-gray-400">
                                        +{fmtDuration(stop.legDurationSec)} · {fmtKm(stop.legDistanceM)}
                                    </p>
                                ) : null}
                            </div>
                            <div>
                                <p className="text-gray-500">Must finish by</p>
                                <p className="font-medium">
                                    {stop.windowEnd ? fmtDateTime(stop.windowEnd) : '—'}
                                </p>
                            </div>
                            <div>
                                {stop.windowStatus ? (
                                    <StatusBadge tone={STATUS_TONE[stop.windowStatus]}>
                                        {STATUS_LABEL[stop.windowStatus]}
                                        {stop.windowStatus === 'LATE'
                                            ? ` +${Math.ceil(stop.lateBySec / 60)} min`
                                            : ''}
                                    </StatusBadge>
                                ) : null}
                                {stop.waitingTimeSec > 0 ? (
                                    <p className="mt-1 text-gray-500">
                                        Wait {fmtDuration(stop.waitingTimeSec)}
                                    </p>
                                ) : null}
                                {stop.departureAt ? (
                                    <p className="mt-1 text-gray-500">Done {fmtTime(stop.departureAt)}</p>
                                ) : null}
                            </div>
                        </div>
                    </li>
                ))}
                {preview.returnStop ? (
                    <li className="flex flex-col gap-2 rounded-lg border border-gray-200 p-3 md:flex-row md:items-center dark:border-gray-700">
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold dark:bg-gray-700">
                                {preview.stops.length + 1}
                            </span>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <StatusBadge tone="default">Return to</StatusBadge>
                                    <span className="font-semibold">{preview.returnStop.label}</span>
                                </div>
                                <p className="truncate text-xs text-gray-500">{preview.returnStop.address}</p>
                            </div>
                        </div>
                        <div className="text-xs md:w-[380px]">
                            <p className="text-gray-500">ETA</p>
                            <p className="font-medium">{fmtDateTime(preview.returnStop.etaAt)}</p>
                            {preview.returnStop.legDurationSec != null ? (
                                <p className="text-gray-400">
                                    +{fmtDuration(preview.returnStop.legDurationSec)} ·{' '}
                                    {fmtKm(preview.returnStop.legDistanceM)}
                                </p>
                            ) : null}
                        </div>
                    </li>
                ) : null}
            </ol>
        </div>
    )
}
