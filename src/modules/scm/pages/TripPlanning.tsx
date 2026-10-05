'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'
import Button from '@/components/ui/Button'
import Alert from '@/components/ui/Alert'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import { scmPageBreadcrumbs } from '@/modules/scm/utils/breadcrumbs'
import Input from '@/components/ui/Input'
import Segment from '@/components/ui/Segment'
import CreateTmsTripDialog from '../components/tms/CreateTmsTripDialog'
import TmsTripPanel from '../components/tms/TmsTripPanel'
import TripRoutePreviewMap from '../components/trips/TripRoutePreviewMap'
import { useTripPlanning } from '../hooks/useTripPlanning'
import { useTripRoutePreview } from '../hooks/useTripRoutePreview'
import { formatStatusLabel, statusTone } from '../utils/status'
import type { DepartureMode, Trip, TripCandidate } from '../types'

function notify(type: 'success' | 'danger', msg: string) {
    toast.push(
        <Notification type={type} title="Trip Planning" closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const actionSuccess = {
    validate: 'Trip validated — ready to dispatch',
    dispatch: 'Trip dispatched to the driver',
    cancel: 'Trip cancelled — load is READY again',
} as const

/**
 * Cargo-first Trip Planning: only READY loads are candidates. Stops are
 * generated from the load's cargo lines; planners sequence deliveries,
 * assign a driver, validate and dispatch.
 */
export default function TripPlanningPage() {
    const tp = useTripPlanning()
    const [creating, setCreating] = useState<TripCandidate | null>(null)
    const [planningId, setPlanningId] = useState<string | null>(null)
    const [stopOrder, setStopOrder] = useState<string[] | null>(null)
    const [departInput, setDepartInput] = useState('')
    const [departureMode, setDepartureMode] = useState<DepartureMode>('ON_TIME')

    const planning = tp.candidates.find((c) => c.loadPlanId === planningId) ?? null
    const previewRequest = useMemo(
        () => ({
            departureMode,
            ...(stopOrder ? { stopOrder } : {}),
            ...(departInput ? { departAt: new Date(departInput).toISOString() } : {}),
        }),
        [stopOrder, departInput, departureMode],
    )
    const route = useTripRoutePreview(planning?.loadPlanId, previewRequest)

    const selectLoad = (loadPlanId: string) => {
        setPlanningId(loadPlanId)
        setStopOrder(null)
        setDepartInput('')
        setDepartureMode('ON_TIME')
    }

    const moveDelivery = (key: string, direction: -1 | 1) => {
        if (!route.preview) return
        const keys = route.preview.stops.map((s) => s.key)
        const deliveries = route.preview.stops.filter((s) => s.type === 'SHIP_TO').map((s) => s.key)
        const from = deliveries.indexOf(key)
        const to = from + direction
        if (from < 0 || to < 0 || to >= deliveries.length) return
        const a = keys.indexOf(deliveries[from])
        const b = keys.indexOf(deliveries[to])
        ;[keys[a], keys[b]] = [keys[b], keys[a]]
        setStopOrder(keys)
    }

    const exec = async (fn: () => Promise<string | null>, success: string) => {
        const err = await fn()
        notify(err ? 'danger' : 'success', err ?? success)
    }

    const candidateColumns = useMemo<ColumnDef<TripCandidate>[]>(
        () => [
            { header: 'Load plan', accessorKey: 'code' },
            {
                header: 'Vehicle',
                cell: ({ row }) => (
                    <span>
                        {row.original.vehicle.plateNumber}
                        <span className="text-xs text-gray-500"> · {row.original.vehicle.code}</span>
                    </span>
                ),
            },
            {
                header: 'Load',
                cell: ({ row }) =>
                    `${row.original.totalQty} / ${row.original.vehicle.capacityQty} items`,
            },
            {
                header: 'Cargo',
                cell: ({ row }) =>
                    `${row.original.lineCount} line(s) · ${row.original.shipmentCount} shipment(s)`,
            },
            {
                header: 'Stops',
                cell: ({ row }) => {
                    const p = row.original.stopPreview
                    return `${p.ship} load · ${p.to} deliver${p.ret ? ` · ${p.ret} return` : ''}`
                },
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) => (
                    <Button
                        size="xs"
                        variant={planningId === row.original.loadPlanId ? 'solid' : 'default'}
                        disabled={row.original.vehicle.routingBlocked}
                        title={
                            row.original.vehicle.routingBlocked
                                ? 'Vehicle is blocked from routing'
                                : undefined
                        }
                        onClick={() => selectLoad(row.original.loadPlanId)}
                    >
                        Plan route
                    </Button>
                ),
            },
        ],
        [planningId],
    )

    const tripColumns = useMemo<ColumnDef<Trip>[]>(
        () => [
            { header: 'Trip', accessorKey: 'code' },
            { header: 'Load plan', cell: ({ row }) => row.original.loadPlan?.code ?? '—' },
            { header: 'Vehicle', cell: ({ row }) => row.original.vehicle?.plateNumber ?? '—' },
            {
                header: 'Driver',
                cell: ({ row }) =>
                    row.original.driver
                        ? `${row.original.driver.firstName} ${row.original.driver.lastName}`
                        : '—',
            },
            { header: 'Stops', cell: ({ row }) => row.original.stops?.length ?? 0 },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <StatusBadge tone={statusTone(row.original.status)}>
                        {formatStatusLabel(row.original.status)}
                    </StatusBadge>
                ),
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) => (
                    <Button
                        size="xs"
                        variant={tp.selected?.id === row.original.id ? 'solid' : 'default'}
                        onClick={() => tp.setSelectedId(row.original.id)}
                    >
                        Open
                    </Button>
                ),
            },
        ],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [tp.selected?.id, tp.setSelectedId],
    )

    const selected = tp.selected

    return (
        <PageContainer>
            <PageHeader
                title="Trip Planning"
                description="Trips are created only from READY loads. Stops are derived from the cargo on the vehicle: load (ship-from), deliver (ship-to), return."
                breadcrumbs={scmPageBreadcrumbs('Trip Planning')}
                actions={
                    <div className="flex gap-2">
                        <Link href="/scm/load-building">
                            <Button>Load Building</Button>
                        </Link>
                        <Link href="/scm/tracking">
                            <Button>Tracking</Button>
                        </Link>
                    </div>
                }
            />

            {tp.error ? (
                <Alert showIcon type="danger" className="mb-4" title="API error">
                    {tp.error}
                </Alert>
            ) : null}

            <AdaptiveCard className="mb-4">
                <h5 className="mb-3">READY loads</h5>
                <DataTable
                    columns={candidateColumns}
                    data={tp.candidates}
                    loading={tp.loading}
                    noData={!tp.loading && tp.candidates.length === 0}
                    hidePagination
                />
                {!tp.loading && tp.candidates.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-500">
                        No READY loads. Build and mark a load READY in{' '}
                        <Link href="/scm/load-building" className="underline">
                            Load Building
                        </Link>
                        .
                    </p>
                ) : null}
            </AdaptiveCard>

            <AdaptiveCard className="mb-4">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h5>
                            Route preview
                            {planning ? ` · ${planning.code} · ${planning.vehicle.plateNumber}` : ''}
                        </h5>
                        <p className="text-xs text-gray-500">
                            Built only from the selected load&apos;s cargo. Nothing is saved until you confirm the trip.
                        </p>
                    </div>
                    {planning ? (
                        <div className="flex flex-wrap items-end gap-2">
                            <div className="text-xs text-gray-500">
                                Recommended departure
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
                                Departure from pickup (optional)
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
                                    Use recommended
                                </Button>
                            ) : null}
                            {stopOrder ? (
                                <Button size="sm" onClick={() => setStopOrder(null)}>
                                    Reset order
                                </Button>
                            ) : null}
                            <Button
                                size="sm"
                                variant="solid"
                                disabled={tp.busy || !route.preview || route.loading}
                                onClick={() => setCreating(planning)}
                            >
                                Confirm trip
                            </Button>
                        </div>
                    ) : null}
                </div>
                <TripRoutePreviewMap
                    hasLoad={Boolean(planning)}
                    preview={route.preview}
                    loading={route.loading}
                    error={route.error}
                    onMoveStop={moveDelivery}
                />
            </AdaptiveCard>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
                <AdaptiveCard className="xl:col-span-2">
                    <h5 className="mb-3">Trips in planning</h5>
                    <DataTable
                        columns={tripColumns}
                        data={tp.trips}
                        loading={tp.loading}
                        noData={!tp.loading && tp.trips.length === 0}
                        hidePagination
                    />
                </AdaptiveCard>
                <div className="xl:col-span-3">
                    {selected ? (
                        <TmsTripPanel
                            key={selected.id}
                            trip={selected}
                            drivers={tp.drivers}
                            busy={tp.busy}
                            onUpdate={(body) =>
                                void exec(() => tp.updateTrip(selected.id, body), 'Trip details saved')
                            }
                            onReorder={(stopIds) =>
                                void exec(() => tp.reorder(selected.id, stopIds), 'Stop order saved')
                            }
                            onAction={(name) =>
                                void exec(() => tp.action(selected.id, name), actionSuccess[name])
                            }
                        />
                    ) : (
                        <AdaptiveCard>
                            <p className="py-10 text-center text-gray-500">
                                Open a trip to sequence stops, assign a driver and dispatch.
                            </p>
                        </AdaptiveCard>
                    )}
                </div>
            </div>

            <CreateTmsTripDialog
                candidate={creating}
                drivers={tp.drivers}
                busy={tp.busy}
                initialPlannedStartAt={route.preview?.departAt ?? null}
                stopOrder={stopOrder}
                onClose={() => setCreating(null)}
                onCreate={async (body) => {
                    const err = await tp.createTrip(body)
                    if (!err) setPlanningId(null)
                    return err
                }}
            />
        </PageContainer>
    )
}
