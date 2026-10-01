'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { HiOutlineRefresh } from 'react-icons/hi'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import DataTable from '@/components/shared/DataTable'
import DebouceInput from '@/components/shared/DebouceInput'
import StatusBadge from '@/components/shared/StatusBadge'
import { useVehicleTelematicsHistory } from '../../hooks/useVehicleTelematicsHistory'
import { knownAlarmLabel } from '../../utils/telematicsEvents'
import type { TelematicsHistoryPoint } from '../../types'

type Preset = { key: string; label: string; range: () => [Date, Date] }

const HOUR = 60 * 60 * 1000

const presets: Preset[] = [
    {
        key: 'today',
        label: 'Today',
        range: () => {
            const start = new Date()
            start.setHours(0, 0, 0, 0)
            return [start, new Date()]
        },
    },
    { key: '24h', label: 'Last 24h', range: () => [new Date(Date.now() - 24 * HOUR), new Date()] },
    { key: '7d', label: 'Last 7 days', range: () => [new Date(Date.now() - 7 * 24 * HOUR), new Date()] },
    { key: '30d', label: 'Last 30 days', range: () => [new Date(Date.now() - 30 * 24 * HOUR), new Date()] },
]

/** Date → value for <input type="datetime-local"> in local time. */
function toLocalInput(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function localInputToIso(value: string): string | undefined {
    if (!value) return undefined
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

const summaryDate = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })

const fixed = (value: number | null, digits: number) =>
    value == null ? '—' : value.toFixed(digits)

function eventLabel(point: TelematicsHistoryPoint): string | null {
    if (point.alarmDescription) return point.alarmDescription
    if (point.alarmCode == null || point.alarmCode === 0) return null
    return knownAlarmLabel(point.alarmCode) ?? `Alarm ${point.alarmCode}`
}

type Props = { vehicleId: string }

export default function VehicleTelematicsHistoryPanel({ vehicleId }: Props) {
    const {
        data,
        total,
        page,
        pageSize,
        generatedAt,
        loading,
        error,
        params,
        setParams,
        setFilters,
        reload,
    } = useVehicleTelematicsHistory(vehicleId)

    const [fromInput, setFromInput] = useState('')
    const [toInput, setToInput] = useState('')
    const [searchKey, setSearchKey] = useState(0)

    const applyRange = (from: string, to: string) => {
        setFromInput(from)
        setToInput(to)
        setFilters({ from: localInputToIso(from), to: localInputToIso(to) })
    }

    const clearAll = () => {
        setFromInput('')
        setToInput('')
        setSearchKey((k) => k + 1)
        setFilters({ from: undefined, to: undefined, search: undefined })
    }

    const summary = [
        params.from || params.to
            ? `${params.from ? summaryDate(params.from) : 'Any time'} – ${params.to ? summaryDate(params.to) : 'now'}`
            : 'All time',
        params.search ? `search: “${params.search}”` : null,
    ]
        .filter(Boolean)
        .join(' · ')

    const columns = useMemo<ColumnDef<TelematicsHistoryPoint>[]>(
        () => [
            {
                header: 'Recorded at',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap">
                        {new Date(row.original.recordedAt).toLocaleString()}
                    </span>
                ),
            },
            { header: 'Lat', cell: ({ row }) => fixed(row.original.latitude, 6) },
            { header: 'Lng', cell: ({ row }) => fixed(row.original.longitude, 6) },
            {
                header: 'Speed (km/h)',
                cell: ({ row }) => fixed(row.original.speedKmh, 1),
            },
            {
                header: 'Heading (°)',
                cell: ({ row }) => fixed(row.original.heading, 0),
            },
            {
                header: 'Ignition',
                cell: ({ row }) =>
                    row.original.ignition == null ? (
                        '—'
                    ) : (
                        <StatusBadge
                            tone={row.original.ignition ? 'success' : 'default'}
                        >
                            {row.original.ignition ? 'On' : 'Off'}
                        </StatusBadge>
                    ),
            },
            {
                header: 'Event',
                cell: ({ row }) => {
                    const label = eventLabel(row.original)
                    return label ? (
                        <StatusBadge tone="warning">{label}</StatusBadge>
                    ) : (
                        '—'
                    )
                },
            },
            {
                header: 'Source / device',
                cell: ({ row }) => (
                    <div className="text-xs">
                        <div className="font-medium">
                            {row.original.source ?? '—'}
                        </div>
                        <div className="text-gray-500">
                            {row.original.deviceId ?? '—'}
                        </div>
                    </div>
                ),
            },
            {
                header: 'Trip',
                cell: ({ row }) => row.original.tripCode ?? '—',
            },
            {
                header: 'Ref',
                cell: ({ row }) => (
                    <span
                        className="font-mono text-xs text-gray-500"
                        title={
                            row.original.messageRef
                                ? `Log ${row.original.id} · message ${row.original.messageRef}`
                                : `Log ${row.original.id}`
                        }
                    >
                        {row.original.id.slice(-8)}
                    </span>
                ),
            },
            {
                header: '',
                id: 'map',
                cell: ({ row }) => (
                    <a
                        className="text-xs text-primary hover:underline"
                        href={`https://www.openstreetmap.org/?mlat=${row.original.latitude}&mlon=${row.original.longitude}#map=17/${row.original.latitude}/${row.original.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                    >
                        Map
                    </a>
                ),
            },
        ],
        [],
    )

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="text-xs text-gray-500">
                        From
                        <Input
                            type="datetime-local"
                            size="sm"
                            className="mt-1"
                            value={fromInput}
                            onChange={(e) => applyRange(e.target.value, toInput)}
                        />
                    </label>
                    <label className="text-xs text-gray-500">
                        To
                        <Input
                            type="datetime-local"
                            size="sm"
                            className="mt-1"
                            value={toInput}
                            onChange={(e) => applyRange(fromInput, e.target.value)}
                        />
                    </label>
                </div>
                <DebouceInput
                    key={searchKey}
                    size="sm"
                    className="xl:max-w-xs"
                    placeholder="Search device, source, trip, alarm, log id…"
                    defaultValue={params.search ?? ''}
                    onChange={(e) =>
                        setFilters({ search: e.target.value.trim() || undefined })
                    }
                />
                <div className="flex flex-wrap gap-2">
                    {presets.map((preset) => (
                        <Button
                            key={preset.key}
                            size="sm"
                            onClick={() => {
                                const [from, to] = preset.range()
                                applyRange(toLocalInput(from), toLocalInput(to))
                            }}
                        >
                            {preset.label}
                        </Button>
                    ))}
                    <Button size="sm" variant="plain" onClick={clearAll}>
                        Clear
                    </Button>
                    <Button
                        size="sm"
                        icon={<HiOutlineRefresh />}
                        loading={loading}
                        onClick={() => void reload()}
                    >
                        Refresh
                    </Button>
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                <span>
                    {summary} · {total.toLocaleString()} point
                    {total === 1 ? '' : 's'}
                </span>
                {generatedAt ? (
                    <span>As of {new Date(generatedAt).toLocaleString()}</span>
                ) : null}
            </div>

            {error ? (
                <Alert showIcon type="danger" title="Could not load history">
                    {error}
                </Alert>
            ) : null}

            <DataTable
                columns={columns}
                data={data}
                loading={loading}
                noData={!loading && data.length === 0}
                customNoDataIcon={
                    <span className="font-semibold">
                        No telematics points in this range
                    </span>
                }
                pagingData={{ total, pageIndex: page, pageSize }}
                onPaginationChange={(nextPage) =>
                    setParams((current) => ({ ...current, page: nextPage }))
                }
                onSelectChange={(nextSize) =>
                    setParams((current) => ({
                        ...current,
                        page: 1,
                        pageSize: nextSize,
                    }))
                }
            />

            <p className="text-xs text-gray-400">
                Read-only view of GPS points as stored at ingest. Points are
                never edited from this screen.
            </p>
        </div>
    )
}
