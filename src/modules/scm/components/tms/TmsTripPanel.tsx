'use client'

import { useEffect, useMemo, useState } from 'react'
import { HiArrowDown, HiArrowUp } from 'react-icons/hi'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Tag from '@/components/ui/Tag'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import StatusBadge from '@/components/shared/StatusBadge'
import { formatStatusLabel, statusTone } from '../../utils/status'
import type { Driver, Trip, TripStop, TripStopType } from '../../types'

type Option = { value: string; label: string }

const stopTypeLabel: Record<TripStopType, string> = {
    SHIP: 'Load',
    TO: 'Deliver',
    RETURN: 'Return',
}

const stopTypeClass: Record<TripStopType, string> = {
    SHIP: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200',
    TO: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200',
    RETURN: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200',
}

function toLocalInput(iso: string | null | undefined) {
    if (!iso) return ''
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatWindow(stop: TripStop) {
    if (!stop.windowStart && !stop.windowEnd) return null
    const fmt = (iso: string) =>
        new Date(iso).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    return `${stop.windowStart ? fmt(stop.windowStart) : '…'} – ${stop.windowEnd ? fmt(stop.windowEnd) : '…'}`
}

type Props = {
    trip: Trip
    drivers: Driver[]
    busy: boolean
    onUpdate: (body: { driverId?: string | null; plannedStartAt?: string | null }) => void
    onReorder: (stopIds: string[]) => void
    onAction: (name: 'validate' | 'dispatch' | 'cancel') => void
}

/**
 * Trip detail for planners: generated stops (SHIP → TO → RETURN) with cargo refs.
 * Only delivery (TO) stops can be moved; the server re-validates the order.
 */
export default function TmsTripPanel({
    trip,
    drivers,
    busy,
    onUpdate,
    onReorder,
    onAction,
}: Props) {
    const stops = useMemo(() => trip.stops ?? [], [trip.stops])
    const [order, setOrder] = useState<string[]>(() => stops.map((s) => s.id))
    const [driverId, setDriverId] = useState(trip.driverId ?? '')
    const [plannedStartAt, setPlannedStartAt] = useState(toLocalInput(trip.plannedStartAt))

    useEffect(() => {
        setOrder(stops.map((s) => s.id))
        setDriverId(trip.driverId ?? '')
        setPlannedStartAt(toLocalInput(trip.plannedStartAt))
    }, [stops, trip.driverId, trip.plannedStartAt])

    const editable = trip.status === 'PLANNED' || trip.status === 'READY'
    const byId = useMemo(() => new Map(stops.map((s) => [s.id, s])), [stops])
    const ordered = order.map((id) => byId.get(id)).filter((s): s is TripStop => Boolean(s))
    const orderChanged = order.join('|') !== stops.map((s) => s.id).join('|')
    const detailsChanged =
        driverId !== (trip.driverId ?? '') ||
        plannedStartAt !== toLocalInput(trip.plannedStartAt)

    const move = (index: number, delta: -1 | 1) => {
        const target = index + delta
        const a = ordered[index]
        const b = ordered[target]
        if (!a || !b || a.stopType !== 'TO' || b.stopType !== 'TO') return
        const next = [...order]
        ;[next[index], next[target]] = [next[target], next[index]]
        setOrder(next)
    }

    const driverOptions = useMemo<Option[]>(
        () => [
            { value: '', label: 'No driver' },
            ...drivers.map((d) => ({
                value: d.id,
                label: `${d.firstName} ${d.lastName}${d.employeeCode ? ` · ${d.employeeCode}` : ''}`,
            })),
        ],
        [drivers],
    )

    return (
        <AdaptiveCard>
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <h5>{trip.code}</h5>
                        <StatusBadge tone={statusTone(trip.status)}>
                            {formatStatusLabel(trip.status)}
                        </StatusBadge>
                    </div>
                    <p className="text-sm text-gray-500">
                        {trip.vehicle?.plateNumber ?? '—'} · load {trip.loadPlan?.code ?? '—'} ·{' '}
                        {trip.totalQty ?? 0} items · {stops.length} stops
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {trip.status === 'PLANNED' ? (
                        <Button
                            variant="solid"
                            loading={busy}
                            disabled={orderChanged || detailsChanged}
                            onClick={() => onAction('validate')}
                        >
                            Validate
                        </Button>
                    ) : null}
                    {trip.status === 'READY' ? (
                        <Button
                            variant="solid"
                            loading={busy}
                            disabled={orderChanged || detailsChanged}
                            onClick={() => onAction('dispatch')}
                        >
                            Dispatch
                        </Button>
                    ) : null}
                    {['PLANNED', 'READY', 'DISPATCHED'].includes(trip.status) ? (
                        <Button
                            variant="plain"
                            className="text-red-600"
                            disabled={busy}
                            onClick={() => onAction('cancel')}
                        >
                            Cancel trip
                        </Button>
                    ) : null}
                </div>
            </div>

            {trip.status === 'DISPATCHED' ? (
                <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
                    Dispatched — the driver can start the trip from the driver app. Live position
                    appears in Tracking once the trip is in transit.
                </p>
            ) : null}

            <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3 md:items-end">
                <div>
                    <p className="mb-1 text-xs text-gray-500">Driver</p>
                    <Select
                        size="sm"
                        isDisabled={!editable || busy}
                        options={driverOptions}
                        value={driverOptions.find((o) => o.value === driverId) ?? driverOptions[0]}
                        onChange={(option) => setDriverId((option as Option | null)?.value ?? '')}
                    />
                </div>
                <div>
                    <p className="mb-1 text-xs text-gray-500">Planned start</p>
                    <Input
                        size="sm"
                        type="datetime-local"
                        disabled={!editable || busy}
                        value={plannedStartAt}
                        onChange={(e) => setPlannedStartAt(e.target.value)}
                    />
                </div>
                {editable ? (
                    <div>
                        <Button
                            size="sm"
                            disabled={!detailsChanged || busy}
                            onClick={() =>
                                onUpdate({
                                    driverId: driverId || null,
                                    plannedStartAt: plannedStartAt
                                        ? new Date(plannedStartAt).toISOString()
                                        : null,
                                })
                            }
                        >
                            Save details
                        </Button>
                    </div>
                ) : null}
            </div>

            <div className="mb-2 flex items-center justify-between">
                <h6>Stops (from cargo)</h6>
                {editable && orderChanged ? (
                    <div className="flex gap-2">
                        <Button size="xs" onClick={() => setOrder(stops.map((s) => s.id))}>
                            Reset
                        </Button>
                        <Button size="xs" variant="solid" loading={busy} onClick={() => onReorder(order)}>
                            Save order
                        </Button>
                    </div>
                ) : null}
            </div>
            {editable ? (
                <p className="mb-3 text-xs text-gray-500">
                    Load stops come first and return stops last; only delivery stops can be
                    reordered. Changing the order or details after validation requires validating
                    again.
                </p>
            ) : null}

            <ol className="flex flex-col gap-2">
                {ordered.map((stop, index) => {
                    const type = stop.stopType ?? 'TO'
                    const prev = ordered[index - 1]
                    const next = ordered[index + 1]
                    const window = formatWindow(stop)
                    return (
                        <li
                            key={stop.id}
                            className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                        >
                            <span className="mt-0.5 w-6 text-center font-semibold text-gray-500">
                                {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Tag className={stopTypeClass[type]}>{stopTypeLabel[type]}</Tag>
                                    <span className="font-medium">{stop.name ?? stop.address}</span>
                                    {stop.status !== 'PENDING' ? (
                                        <StatusBadge tone={statusTone(stop.status)}>
                                            {formatStatusLabel(stop.status)}
                                        </StatusBadge>
                                    ) : null}
                                </div>
                                <p className="truncate text-xs text-gray-500">{stop.address}</p>
                                {window ? (
                                    <p className="text-xs text-gray-500">Window {window}</p>
                                ) : null}
                                <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                                    {(stop.lines ?? [])
                                        .map((l) =>
                                            l.shipmentLine
                                                ? `${l.shipmentLine.shipment.reference}/${l.shipmentLine.lineNo} ×${l.shipmentLine.quantity}`
                                                : l.shipmentLineId,
                                        )
                                        .join(' · ')}
                                </p>
                            </div>
                            {editable && type === 'TO' ? (
                                <div className="flex flex-col gap-1">
                                    <Button
                                        size="xs"
                                        variant="plain"
                                        icon={<HiArrowUp />}
                                        aria-label="Move up"
                                        disabled={busy || prev?.stopType !== 'TO'}
                                        onClick={() => move(index, -1)}
                                    />
                                    <Button
                                        size="xs"
                                        variant="plain"
                                        icon={<HiArrowDown />}
                                        aria-label="Move down"
                                        disabled={busy || next?.stopType !== 'TO'}
                                        onClick={() => move(index, 1)}
                                    />
                                </div>
                            ) : null}
                        </li>
                    )
                })}
            </ol>
        </AdaptiveCard>
    )
}
