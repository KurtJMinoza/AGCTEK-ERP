'use client'

import { useMemo, type ReactNode } from 'react'
import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import Button from '@/components/ui/Button'
import Alert from '@/components/ui/Alert'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import classNames from '@/utils/classNames'
import { formatStatusLabel, statusTone } from '../utils/status'
import {
    collectTelematicsEvents,
    telematicsEventTone,
} from '../utils/telematicsEvents'
import type {
    GpsLog,
    MaintenanceRecord,
    Trip,
    Vehicle,
} from '../types'

dayjs.extend(relativeTime)

/** Keys we may surface from GpsLog.rawPayload (OBD / flespi / Traccar). */
const DIAGNOSTIC_ALIASES = {
    rpm: [
        'rpm',
        'engineRpm',
        'io239',
        'can.engine.rpm',
        'engine.rpm',
    ],
    engineTempC: [
        'engineTempC',
        'coolantTempC',
        'engineTemp',
        'coolant',
        'io66',
        'can.engine.coolant.temperature',
        'can.engine.temperature',
        'engine.coolant.temperature',
    ],
    fuelPct: [
        'fuelPct',
        'fuelPercent',
        'fuelLevel',
        'fuel',
        'io89',
        'can.fuel.level',
        'fuel.level',
    ],
} as const

/** Tracker backup battery — Telematics tab (not vehicle/CAN 12V). */
const DEVICE_BATTERY_ALIASES = {
    levelPct: ['battery.level', 'batteryLevel', 'batteryPct'],
    voltageV: ['battery.voltage', 'batteryV', 'battery.volts'],
} as const

const SAFE_METRIC_KEYS = [
    'fuelPct',
    'fuelPercent',
    'rpm',
    'engineTempC',
    'coolantTempC',
    'can.engine.rpm',
    'can.fuel.level',
    'can.engine.coolant.temperature',
] as const

export function VehicleOverviewPanel({
    vehicle,
    latest,
}: {
    vehicle: Vehicle
    latest: GpsLog | null
    trips: Trip[]
}) {
    return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AdaptiveCard>
                <h6 className="mb-4">Asset details</h6>
                <dl className="space-y-3 text-sm">
                    <DetailRow label="Code" value={vehicle.code} />
                    <DetailRow
                        label="Status"
                        value={
                            <StatusBadge tone={statusTone(vehicle.status)}>
                                {formatStatusLabel(vehicle.status)}
                            </StatusBadge>
                        }
                    />
                    <DetailRow
                        label="Type"
                        value={formatStatusLabel(vehicle.type)}
                    />
                    <DetailRow
                        label="Capacity (items)"
                        value={(vehicle.capacityQty ?? 0).toLocaleString()}
                    />
                    <DetailRow
                        label="Last odometer"
                        value={`${vehicle.odometerKm.toLocaleString()} km${
                            vehicle.maintenanceThresholdKm != null
                                ? ` (service at ${vehicle.maintenanceThresholdKm.toLocaleString()} km)`
                                : ''
                        }`}
                    />
                    <DetailRow
                        label="Telematics ident"
                        value={vehicle.telematicsDeviceId || '—'}
                    />
                    <DetailRow
                        label="Routing"
                        value={
                            vehicle.routingBlocked
                                ? 'Blocked from routing pool'
                                : 'Eligible for routing'
                        }
                    />
                    <DetailRow label="Notes" value={vehicle.notes || '—'} />
                </dl>
            </AdaptiveCard>

            <AdaptiveCard>
                <div className="mb-4 flex items-center justify-between gap-2">
                    <h6>Last known position</h6>
                    <Link href="/scm/tracking">
                        <Button size="xs">View on map</Button>
                    </Link>
                </div>
                {latest ? (
                    <dl className="space-y-3 text-sm">
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
                            label="Recorded"
                            value={`${dayjs(latest.recordedAt).format(
                                'YYYY-MM-DD HH:mm:ss',
                            )} (${dayjs(latest.recordedAt).fromNow()})`}
                        />
                    </dl>
                ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        No GpsLog yet for this vehicle. Positions appear after
                        telematics pings.
                    </p>
                )}
            </AdaptiveCard>
        </div>
    )
}

export function VehicleTelematicsPanel({
    latest,
    history,
}: {
    latest: GpsLog | null
    history: GpsLog[]
}) {
    const { events, status } = useMemo(
        () =>
            collectTelematicsEvents(
                [
                    ...(latest ? [latest] : []),
                    ...history.filter((h) => h.id !== latest?.id),
                ].map((log) => ({
                    id: log.id,
                    recordedAt: log.recordedAt,
                    rawPayload: (log.rawPayload ?? null) as
                        | Record<string, unknown>
                        | null,
                })),
            ),
        [latest, history],
    )

    if (!latest && history.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-gray-300 px-6 py-12 text-center dark:border-gray-600">
                <p className="font-semibold text-gray-800 dark:text-gray-100">
                    No telematics yet
                </p>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    Live metrics, device status, events, and trail appear here
                    once GpsLog records arrive from the tracker.
                </p>
            </div>
        )
    }

    const battery = extractDeviceBattery(latest?.rawPayload)
    const diagnostics = extractDiagnostics(latest?.rawPayload)
    const otherMetrics = extractSafeMetrics(latest?.rawPayload).filter(
        (metric) =>
            ![
                'rpm',
                'engineTempC',
                'coolantTempC',
                'fuelPct',
                'fuelPercent',
                'can.engine.rpm',
                'can.fuel.level',
                'can.engine.coolant.temperature',
            ].includes(metric.key),
    )

    return (
        <div className="space-y-4">
            <div>
                <h6 className="mb-3">Live metrics</h6>
                {latest ? (
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <MetricCard
                                label="Speed"
                                value={`${latest.speedKmh.toFixed(0)} km/h`}
                                hint={`Last fix ${dayjs(latest.recordedAt).format('HH:mm:ss')}`}
                            />
                            <MetricCard
                                label="RPM"
                                value={
                                    diagnostics.rpm != null
                                        ? diagnostics.rpm.toLocaleString()
                                        : '—'
                                }
                                hint={
                                    diagnostics.rpm == null
                                        ? 'Needs OBD / device payload'
                                        : undefined
                                }
                            />
                            <MetricCard
                                label="Engine temperature"
                                value={
                                    diagnostics.engineTempC != null
                                        ? `${diagnostics.engineTempC.toFixed(0)} °C`
                                        : '—'
                                }
                                hint={
                                    diagnostics.engineTempC == null
                                        ? 'Needs OBD / device payload'
                                        : undefined
                                }
                            />
                            <MetricCard
                                label="Fuel"
                                value={
                                    diagnostics.fuelPct != null
                                        ? `${diagnostics.fuelPct.toFixed(0)}%`
                                        : '—'
                                }
                                hint={
                                    diagnostics.fuelPct == null
                                        ? 'Needs OBD / device payload'
                                        : undefined
                                }
                            />
                        </div>
                        {otherMetrics.length > 0 ? (
                            <div>
                                <p className="mb-2 text-xs uppercase tracking-wide text-gray-400">
                                    Other device metrics
                                </p>
                                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                    {otherMetrics.map((metric) => (
                                        <MetricCard
                                            key={metric.key}
                                            label={metric.label}
                                            value={metric.value}
                                        />
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <p className="text-sm text-gray-500">
                        Speed and OBD metrics appear after the next GPS fix.
                    </p>
                )}
            </div>

            <div>
                <h6 className="mb-3">Status</h6>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <AdaptiveCard>
                        <p className="text-xs uppercase tracking-wide text-gray-400">
                            Engine
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                            <StatusBadge
                                tone={
                                    status.engine === 'on'
                                        ? 'success'
                                        : status.engine === 'off'
                                          ? 'warning'
                                          : 'default'
                                }
                            >
                                {status.engine === 'on'
                                    ? 'On'
                                    : status.engine === 'off'
                                      ? 'Off'
                                      : 'Unknown'}
                            </StatusBadge>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                            Ignition / ACC from device
                        </p>
                    </AdaptiveCard>
                    <AdaptiveCard>
                        <p className="text-xs uppercase tracking-wide text-gray-400">
                            Device power
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                            <StatusBadge
                                tone={
                                    status.power === 'unplugged'
                                        ? 'danger'
                                        : status.power === 'ok'
                                          ? 'success'
                                          : 'default'
                                }
                            >
                                {status.power === 'unplugged'
                                    ? 'Unplugged'
                                    : status.power === 'ok'
                                      ? 'Connected'
                                      : 'Unknown'}
                            </StatusBadge>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                            OBD power-cut alarm
                        </p>
                    </AdaptiveCard>
                    <AdaptiveCard>
                        <p className="text-xs uppercase tracking-wide text-gray-400">
                            Battery
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                            <StatusBadge tone={batteryTone(battery)}>
                                {formatDeviceBattery(battery)}
                            </StatusBadge>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                            {battery.levelPct != null &&
                            battery.voltageV != null
                                ? `${battery.voltageV.toFixed(1)} V · tracker backup`
                                : battery.levelPct != null
                                  ? 'Tracker backup battery'
                                  : battery.voltageV != null
                                    ? 'Tracker backup voltage'
                                    : 'Needs battery.level in device payload'}
                        </p>
                    </AdaptiveCard>
                    <AdaptiveCard>
                        <p className="text-xs uppercase tracking-wide text-gray-400">
                            Sudden braking
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                            <StatusBadge
                                tone={
                                    status.lastHarshBrakeAt
                                        ? 'danger'
                                        : 'default'
                                }
                            >
                                {status.lastHarshBrakeAt
                                    ? dayjs(status.lastHarshBrakeAt).fromNow()
                                    : 'None in trail'}
                            </StatusBadge>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                            Harsh brake events in recent history
                        </p>
                    </AdaptiveCard>
                </div>
            </div>

            <AdaptiveCard>
                <h6 className="mb-3">Event timeline</h6>
                {events.length === 0 ? (
                    <p className="text-sm text-gray-500">
                        No braking, engine, unplug, or alarm.code events in the
                        loaded trail yet.
                    </p>
                ) : (
                    <ul className="max-h-[220px] space-y-2 overflow-y-auto text-sm">
                        {events.slice(0, 40).map((event) => (
                            <li
                                key={event.id}
                                className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-700"
                            >
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <StatusBadge
                                            tone={telematicsEventTone(
                                                event.kind,
                                            )}
                                        >
                                            {event.label}
                                        </StatusBadge>
                                        {event.detail ? (
                                            <span className="text-xs text-gray-500">
                                                {event.detail}
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
                                <span className="shrink-0 text-xs text-gray-400">
                                    {dayjs(event.recordedAt).format(
                                        'MMM D HH:mm:ss',
                                    )}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </AdaptiveCard>

            <div>
                <h6 className="mb-3">Path / recent trail</h6>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <AdaptiveCard bodyClass="min-h-[200px] p-3">
                        <VehicleTrailMap history={history} />
                    </AdaptiveCard>
                    <AdaptiveCard>
                        <h6 className="mb-3">Recent fixes</h6>
                        {history.length === 0 ? (
                            <p className="text-sm text-gray-500">
                                No history yet.
                            </p>
                        ) : (
                            <ul className="max-h-[240px] space-y-2 overflow-y-auto text-sm">
                                {history.map((log) => (
                                    <li
                                        key={log.id}
                                        className="rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-700"
                                    >
                                        <div className="flex justify-between gap-2">
                                            <span className="font-medium">
                                                {log.latitude.toFixed(4)},{' '}
                                                {log.longitude.toFixed(4)}
                                            </span>
                                            <span className="text-xs text-gray-400">
                                                {dayjs(
                                                    log.recordedAt,
                                                ).fromNow()}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-xs text-gray-500">
                                            {log.speedKmh.toFixed(0)} km/h
                                            {log.heading != null
                                                ? ` · ${log.heading.toFixed(0)}°`
                                                : ''}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </AdaptiveCard>
                </div>
                {latest ? (
                    <p className="mt-3 text-xs text-gray-500">
                        Last fix{' '}
                        {dayjs(latest.recordedAt).format(
                            'YYYY-MM-DD HH:mm:ss',
                        )}{' '}
                        · {latest.speedKmh.toFixed(0)} km/h
                        {latest.heading != null
                            ? ` · ${latest.heading.toFixed(0)}°`
                            : ''}
                    </p>
                ) : null}
            </div>
        </div>
    )
}

export function VehicleMaintenancePanel({
    records,
}: {
    records: MaintenanceRecord[]
}) {
    const columns = useMemo<ColumnDef<MaintenanceRecord>[]>(
        () => [
            { header: 'Title', accessorKey: 'title' },
            {
                header: 'Type',
                cell: ({ row }) => formatStatusLabel(row.original.type),
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <StatusBadge tone={statusTone(row.original.status)}>
                        {formatStatusLabel(row.original.status)}
                    </StatusBadge>
                ),
            },
            {
                header: 'Odometer',
                cell: ({ row }) =>
                    row.original.odometerKm != null
                        ? `${row.original.odometerKm.toLocaleString()} km`
                        : '—',
            },
            {
                header: 'Scheduled',
                cell: ({ row }) =>
                    dayjs(row.original.scheduledAt).format('YYYY-MM-DD'),
            },
            {
                header: 'Completed',
                cell: ({ row }) =>
                    row.original.completedAt
                        ? dayjs(row.original.completedAt).format('YYYY-MM-DD')
                        : '—',
            },
            {
                header: 'Blocks routing',
                cell: ({ row }) =>
                    row.original.blocksRouting ? (
                        <StatusBadge tone="warning">Yes</StatusBadge>
                    ) : (
                        'No'
                    ),
            },
        ],
        [],
    )

    if (records.length === 0) {
        return (
            <Alert showIcon type="info" title="No maintenance records">
                Open <strong>SCM → Maintenance</strong> to schedule work.
                Odometer thresholds can also open blocking preventative jobs
                automatically.
            </Alert>
        )
    }

    return (
        <DataTable
            columns={columns}
            data={records}
            pagingData={{
                total: records.length,
                pageIndex: 1,
                pageSize: records.length,
            }}
        />
    )
}

export function VehicleTripsPanel({ trips }: { trips: Trip[] }) {
    const columns = useMemo<ColumnDef<Trip>[]>(
        () => [
            { header: 'Code', accessorKey: 'code' },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <StatusBadge tone={statusTone(row.original.status)}>
                        {formatStatusLabel(row.original.status)}
                    </StatusBadge>
                ),
            },
            {
                header: 'Driver',
                cell: ({ row }) =>
                    row.original.driver
                        ? `${row.original.driver.firstName} ${row.original.driver.lastName}`
                        : '—',
            },
            {
                header: 'Planned start',
                cell: ({ row }) =>
                    row.original.plannedStartAt
                        ? dayjs(row.original.plannedStartAt).format(
                              'YYYY-MM-DD HH:mm',
                          )
                        : '—',
            },
            {
                header: 'Stops',
                cell: ({ row }) => row.original.stops?.length ?? '—',
            },
        ],
        [],
    )

    if (trips.length === 0) {
        return (
            <Alert showIcon type="info" title="No trips for this vehicle">
                Assigned trips will appear here. Plan trips from the Trips
                page.
            </Alert>
        )
    }

    return (
        <DataTable
            columns={columns}
            data={trips}
            pagingData={{
                total: trips.length,
                pageIndex: 1,
                pageSize: trips.length,
            }}
        />
    )
}

function VehicleTrailMap({ history }: { history: GpsLog[] }) {
    const points = useMemo(() => {
        const ordered = [...history].reverse()
        if (ordered.length === 0) return []

        const lats = ordered.map((p) => p.latitude)
        const lngs = ordered.map((p) => p.longitude)
        const minLat = Math.min(...lats)
        const maxLat = Math.max(...lats)
        const minLng = Math.min(...lngs)
        const maxLng = Math.max(...lngs)
        const latSpan = Math.max(maxLat - minLat, 0.01)
        const lngSpan = Math.max(maxLng - minLng, 0.01)
        const pad = 10

        return ordered.map((point, index) => ({
            id: point.id,
            left:
                ((point.longitude - minLng) / lngSpan) * (100 - pad * 2) + pad,
            top:
                (1 - (point.latitude - minLat) / latSpan) * (100 - pad * 2) +
                pad,
            isLatest: index === ordered.length - 1,
        }))
    }, [history])

    if (points.length === 0) {
        return (
            <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-gray-500">
                No trail points to plot.
            </div>
        )
    }

    return (
        <div>
            <h6 className="mb-1">
                Path preview ({history.length} points)
            </h6>
            <p className="mb-3 text-xs text-gray-500">
                Quick sketch of recent GPS fixes for this vehicle only — not the
                fleet Live Tracking map. Blue = latest.
            </p>
            <div
                className={classNames(
                    'relative h-[180px] overflow-hidden rounded-lg border border-gray-200',
                    'bg-[radial-gradient(circle,_#d1d5db_1px,_transparent_1px)] bg-[length:12px_12px]',
                    'dark:border-gray-700',
                )}
            >
                {points.map((point) => (
                    <span
                        key={point.id}
                        className={classNames(
                            'absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full',
                            point.isLatest
                                ? 'bg-primary ring-4 ring-primary/20'
                                : 'bg-gray-400',
                        )}
                        style={{ left: `${point.left}%`, top: `${point.top}%` }}
                    />
                ))}
            </div>
        </div>
    )
}

function MetricCard({
    label,
    value,
    hint,
}: {
    label: string
    value: ReactNode
    hint?: string
}) {
    return (
        <AdaptiveCard>
            <p className="text-xs uppercase tracking-wide text-gray-400">
                {label}
            </p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                {value}
            </p>
            {hint ? (
                <p className="mt-1 text-xs text-gray-500">{hint}</p>
            ) : null}
        </AdaptiveCard>
    )
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
            <dt className="text-xs uppercase tracking-wide text-gray-400">
                {label}
            </dt>
            <dd className="text-gray-800 dark:text-gray-200 sm:text-right">
                {value}
            </dd>
        </div>
    )
}

function readNumericField(
    payload: Record<string, unknown>,
    keys: readonly string[],
): number | null {
    const bags: Record<string, unknown>[] = [payload]
    const attrs = payload.attributes
    if (attrs && typeof attrs === 'object' && !Array.isArray(attrs)) {
        bags.push(attrs as Record<string, unknown>)
    }

    for (const bag of bags) {
        for (const key of keys) {
            const raw = bag[key]
            if (typeof raw === 'number' && Number.isFinite(raw)) return raw
            if (typeof raw === 'string' && raw.trim() !== '') {
                const n = Number(raw)
                if (Number.isFinite(n)) return n
            }
        }
    }
    return null
}

function extractDiagnostics(
    rawPayload: Record<string, unknown> | null | undefined,
): {
    rpm: number | null
    engineTempC: number | null
    fuelPct: number | null
} {
    if (!rawPayload || typeof rawPayload !== 'object') {
        return { rpm: null, engineTempC: null, fuelPct: null }
    }
    return {
        rpm: readNumericField(rawPayload, DIAGNOSTIC_ALIASES.rpm),
        engineTempC: readNumericField(
            rawPayload,
            DIAGNOSTIC_ALIASES.engineTempC,
        ),
        fuelPct: readNumericField(rawPayload, DIAGNOSTIC_ALIASES.fuelPct),
    }
}

function extractDeviceBattery(
    rawPayload: Record<string, unknown> | null | undefined,
): { levelPct: number | null; voltageV: number | null } {
    if (!rawPayload || typeof rawPayload !== 'object') {
        return { levelPct: null, voltageV: null }
    }
    return {
        levelPct: readNumericField(rawPayload, DEVICE_BATTERY_ALIASES.levelPct),
        voltageV: readNumericField(rawPayload, DEVICE_BATTERY_ALIASES.voltageV),
    }
}

function formatDeviceBattery(battery: {
    levelPct: number | null
    voltageV: number | null
}): string {
    if (battery.levelPct != null) return `${battery.levelPct.toFixed(0)}%`
    if (battery.voltageV != null) return `${battery.voltageV.toFixed(1)} V`
    return 'Unknown'
}

function batteryTone(battery: {
    levelPct: number | null
    voltageV: number | null
}): 'danger' | 'warning' | 'success' | 'default' {
    if (battery.levelPct != null) {
        if (battery.levelPct <= 15) return 'danger'
        if (battery.levelPct <= 30) return 'warning'
        return 'success'
    }
    if (battery.voltageV != null) {
        if (battery.voltageV < 3.4) return 'danger'
        if (battery.voltageV < 3.6) return 'warning'
        return 'success'
    }
    return 'default'
}

function extractSafeMetrics(
    rawPayload: Record<string, unknown> | null | undefined,
): Array<{ key: string; label: string; value: string }> {
    if (!rawPayload || typeof rawPayload !== 'object') return []

    const labels: Record<string, string> = {
        fuelPct: 'Fuel %',
        fuelPercent: 'Fuel %',
        rpm: 'RPM',
        engineTempC: 'Engine °C',
        coolantTempC: 'Coolant °C',
        'can.engine.rpm': 'RPM',
        'can.fuel.level': 'Fuel %',
        'can.engine.coolant.temperature': 'Coolant °C',
    }

    return SAFE_METRIC_KEYS.flatMap((key) => {
        const raw = rawPayload[key]
        if (typeof raw !== 'number' || !Number.isFinite(raw)) return []
        return [
            {
                key,
                label: labels[key] ?? key,
                value: Number.isInteger(raw) ? String(raw) : raw.toFixed(1),
            },
        ]
    })
}
