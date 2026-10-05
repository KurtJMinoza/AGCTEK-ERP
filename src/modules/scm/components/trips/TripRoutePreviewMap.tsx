'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { HiOutlineArrowDown, HiOutlineArrowUp } from 'react-icons/hi'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import StatusBadge from '@/components/shared/StatusBadge'
import type { StatusTone } from '@/components/shared/StatusBadge'
import type {
    RoutePreview,
    RoutePreviewStop,
    RouteWindowStatus,
    StopLocationIssueCode,
} from '../../types'

const WAREHOUSES_ROUTE = '/modules/mm/warehouse-management/warehouses'

/** Issues the planner fixes on the MM warehouse master (not on the shipment). */
const WAREHOUSE_FIX_CODES = new Set<StopLocationIssueCode>([
    'WAREHOUSE_UNCONFIRMED',
    'WAREHOUSE_INACTIVE',
    'INVALID_COORDS',
])

const ISSUE_LABEL: Record<StopLocationIssueCode, string> = {
    WAREHOUSE_REQUIRED: 'No warehouse',
    WAREHOUSE_MISSING: 'Warehouse missing',
    WAREHOUSE_DELETED: 'Warehouse deleted',
    WAREHOUSE_INACTIVE: 'Warehouse inactive',
    WAREHOUSE_UNCONFIRMED: 'Location unconfirmed',
    INVALID_COORDS: 'Invalid coordinates',
    MISSING_COORDS: 'No coordinates',
}

const TripRoutePreviewLeaflet = dynamic(() => import('./TripRoutePreviewLeaflet'), {
    ssr: false,
    loading: () => (
        <div className="flex h-[420px] items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700">
            <Spinner size={32} />
        </div>
    ),
})

const TYPE_LABEL: Record<RoutePreviewStop['type'], string> = {
    PICKUP: 'Pickup',
    SHIP_TO: 'Ship to',
    RETURN_TO: 'Return to',
}

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

type Props = {
    /** False → empty state, no API call is made by the parent hook */
    hasLoad: boolean
    preview: RoutePreview | null
    loading: boolean
    error: string | null
    /** Move a delivery (SHIP TO) stop; omitted → reorder controls hidden */
    onMoveStop?: (key: string, direction: -1 | 1) => void
}

/**
 * Trip Planning route preview (planning only — no live GPS / WebSocket layer).
 * Displays what the backend computed; no routing or window math here.
 */
export default function TripRoutePreviewMap({ hasLoad, preview, loading, error, onMoveStop }: Props) {
    if (!hasLoad) {
        return (
            <p className="py-10 text-center text-gray-500">
                Select a READY load to preview its route
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
    const deliveries = preview.stops.filter((s) => s.type === 'SHIP_TO')

    return (
        <div className="space-y-4">
            {error ? (
                <Alert showIcon type="danger" title="Route preview failed">
                    {error}
                </Alert>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
                {preview.router === 'osrm' ? (
                    <StatusBadge tone="info">Router: OSRM</StatusBadge>
                ) : preview.router === 'haversine' ? (
                    <StatusBadge tone="warning">
                        <span title={preview.routerFallbackReason ?? undefined}>
                            Router: haversine · Estimated (no router)
                        </span>
                    </StatusBadge>
                ) : null}
                {preview.pickupCount > 1 ? (
                    <StatusBadge tone="warning">
                        {preview.pickupCount} pickups — visited in order before deliveries
                    </StatusBadge>
                ) : null}
                <span className="text-xs text-gray-500">
                    Service time {preview.serviceTimeMin} min per stop
                </span>
                {loading ? <Spinner size={16} /> : null}
            </div>

            {rec ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <div className="rounded-xl border border-gray-200 p-3 md:col-span-2 dark:border-gray-700">
                        <p className="text-xs text-gray-500">Recommended departure from pickup</p>
                        <p className="mt-1 text-xl font-bold heading-text">{fmtDateTime(rec.at)}</p>
                        <p className="mt-1 text-xs">
                            {rec.basis === 'LATEST_MEETING_WINDOWS' ? (
                                <span className="text-emerald-600">Latest departure that meets every delivery window</span>
                            ) : rec.basis === 'EARLIEST_MEETING_WINDOWS' ? (
                                <span className="text-emerald-600">Early — arrives as the first delivery window opens</span>
                            ) : rec.basis === 'NO_DEADLINES' ? (
                                <span className="text-gray-500">No delivery deadlines — earliest practical departure</span>
                            ) : (
                                <span className="text-red-600">{rec.reason ?? 'Not feasible'} — showing earliest practical departure</span>
                            )}
                        </p>
                    </div>
                    <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                        <p className="text-xs text-gray-500">Distance · drive time</p>
                        <p className="mt-1 font-semibold">
                            {fmtKm(preview.totalDistanceM)} · {fmtDuration(preview.totalDurationSec)}
                        </p>
                    </div>
                    <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                        <p className="text-xs text-gray-500">Departs → back at warehouse</p>
                        <p className="mt-1 font-semibold">
                            {fmtTime(preview.departAt)} → {fmtTime(preview.arrivalAt)}
                        </p>
                        <p className="text-xs text-gray-500">{fmtDuration(preview.tripDurationSec)} incl. service / waiting</p>
                    </div>
                </div>
            ) : null}

            {preview.violations.length > 0 ? (
                <Alert
                    showIcon
                    type={preview.routable ? 'warning' : 'danger'}
                    title={preview.routable ? 'Schedule issues for this departure' : 'Route blocked — fix stop locations before confirming'}
                >
                    <ul className="list-disc pl-4">
                        {preview.violations.map((v, i) => (
                            <li key={`${v.code}-${v.stopKey ?? i}`}>
                                {v.message}
                                {v.issueCode && WAREHOUSE_FIX_CODES.has(v.issueCode) ? (
                                    <>
                                        {' '}
                                        <Link href={WAREHOUSES_ROUTE} className="font-semibold underline">
                                            Open MM › Warehouses
                                        </Link>
                                    </>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </Alert>
            ) : preview.routable ? (
                <Alert showIcon type="success">
                    All delivery windows are met for this departure.
                </Alert>
            ) : null}

            {preview.routable ? <TripRoutePreviewLeaflet preview={preview} /> : null}

            <ol className="space-y-2">
                {preview.stops.map((stop) => {
                    const deliveryIndex = deliveries.findIndex((d) => d.key === stop.key)
                    return (
                        <li
                            key={stop.key}
                            className="flex flex-col gap-2 rounded-lg border border-gray-200 p-3 md:flex-row md:items-center dark:border-gray-700"
                        >
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold dark:bg-gray-700">
                                    {stop.sequence}
                                </span>
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <StatusBadge tone={stop.type === 'SHIP_TO' ? 'info' : 'default'}>
                                            {TYPE_LABEL[stop.type]}
                                        </StatusBadge>
                                        <span className="font-semibold">{stop.label}</span>
                                        {stop.locationIssue ? (
                                            <StatusBadge tone="danger">
                                                {ISSUE_LABEL[stop.locationIssue.code] ?? 'Location invalid'}
                                            </StatusBadge>
                                        ) : (
                                            <StatusBadge tone="success">
                                                {stop.coordSource === 'warehouse' ? 'Warehouse pin' : 'Address pin'}
                                            </StatusBadge>
                                        )}
                                    </div>
                                    <p className="truncate text-xs text-gray-500">
                                        {stop.address} · {stop.lineCount} line(s)
                                    </p>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-3 text-xs md:w-[380px]">
                                <div>
                                    <p className="text-gray-500">{stop.type === 'PICKUP' ? 'Departs' : 'ETA'}</p>
                                    <p className="font-medium">
                                        {fmtDateTime(stop.type === 'PICKUP' && stop.sequence === 1 ? stop.departureAt : stop.etaAt)}
                                    </p>
                                    {stop.legDurationSec != null ? (
                                        <p className="text-gray-400">
                                            +{fmtDuration(stop.legDurationSec)} · {fmtKm(stop.legDistanceM)}
                                        </p>
                                    ) : null}
                                </div>
                                <div>
                                    <p className="text-gray-500">Window</p>
                                    <p className="font-medium">
                                        {stop.windowStart || stop.windowEnd
                                            ? `${fmtTime(stop.windowStart)} – ${fmtTime(stop.windowEnd)}`
                                            : '—'}
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
                                        <p className="mt-1 text-gray-500">Wait {fmtDuration(stop.waitingTimeSec)}</p>
                                    ) : null}
                                    {stop.type === 'SHIP_TO' && stop.departureAt ? (
                                        <p className="mt-1 text-gray-500">Done {fmtTime(stop.departureAt)}</p>
                                    ) : null}
                                </div>
                            </div>
                            {onMoveStop && stop.type === 'SHIP_TO' ? (
                                <div className="flex gap-1">
                                    <Button
                                        size="xs"
                                        icon={<HiOutlineArrowUp />}
                                        aria-label="Move delivery earlier"
                                        disabled={deliveryIndex <= 0}
                                        onClick={() => onMoveStop(stop.key, -1)}
                                    />
                                    <Button
                                        size="xs"
                                        icon={<HiOutlineArrowDown />}
                                        aria-label="Move delivery later"
                                        disabled={deliveryIndex === deliveries.length - 1}
                                        onClick={() => onMoveStop(stop.key, 1)}
                                    />
                                </div>
                            ) : null}
                        </li>
                    )
                })}
            </ol>
        </div>
    )
}
