'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Alert from '@/components/ui/Alert'
import Progress from '@/components/ui/Progress'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import DataTable from '@/components/shared/DataTable'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import { scmPageBreadcrumbs } from '@/modules/scm/utils/breadcrumbs'
import { useLoadBuilding } from '../hooks/useLoadBuilding'
import { formatStatusLabel, statusTone } from '../utils/status'
import type { LoadPlan, LoadPlanLine, ShipmentLine, Vehicle } from '../types'

type Option = { value: string; label: string }

function notify(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

function shipFromLabel(line: ShipmentLine) {
    return line.shipFromWarehouse?.name ?? line.shipFromAddress ?? '—'
}

function returnLabel(line: ShipmentLine) {
    return line.returnWarehouse?.name ?? line.returnAddress ?? '—'
}

function lineLabel(line: ShipmentLine) {
    return line.materialCode ?? line.description ?? `Line ${line.lineNo}`
}

function vehicleOptionLabel(vehicle: Vehicle, plan: LoadPlan | undefined) {
    const base = `${vehicle.plateNumber} · ${vehicle.code} · ${vehicle.capacityQty} items`
    return plan ? `${base} — ${plan.code} (${formatStatusLabel(plan.status)})` : base
}

function CapacitySummary({ plan }: { plan: LoadPlan }) {
    const { capacity } = plan
    const pct =
        capacity.capacityQty > 0 ? (capacity.totalQty / capacity.capacityQty) * 100 : 0
    const barClass = pct > 100 ? 'bg-red-500' : pct >= 90 ? 'bg-amber-500' : 'bg-emerald-500'
    return (
        <div>
            <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-gray-800 dark:text-gray-200">Items</span>
                <span className="text-xs text-gray-500">{Math.round(pct)}%</span>
            </div>
            <Progress percent={Math.min(pct, 100)} showInfo={false} customColorClass={barClass} />
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div>
                    <p className="text-xs text-gray-500">Capacity</p>
                    <p className="font-semibold">{capacity.capacityQty}</p>
                </div>
                <div>
                    <p className="text-xs text-gray-500">Used</p>
                    <p className="font-semibold">{capacity.totalQty}</p>
                </div>
                <div>
                    <p className="text-xs text-gray-500">Remaining</p>
                    <p
                        className={
                            capacity.remainingQty < 0
                                ? 'font-semibold text-red-600'
                                : 'font-semibold'
                        }
                    >
                        {capacity.remainingQty}
                    </p>
                </div>
            </div>
            {capacity.capacityWeightKg != null ? (
                <p className="mt-3 text-xs text-gray-500">
                    Weight {Math.round(capacity.totalWeightKg * 10) / 10} /{' '}
                    {capacity.capacityWeightKg} kg
                </p>
            ) : null}
            {capacity.capacityVolumeM3 != null ? (
                <p className="mt-1 text-xs text-gray-500">
                    Volume {Math.round(capacity.totalVolumeM3 * 100) / 100} /{' '}
                    {capacity.capacityVolumeM3} m³
                </p>
            ) : null}
            {capacity.message ? (
                <Alert showIcon type="danger" className="mt-3">
                    {capacity.message}
                </Alert>
            ) : null}
        </div>
    )
}

/**
 * Cargo-first Load Building: which shipment lines ride on which vehicle.
 * No routing here — READY loads move on to Trip Planning.
 */
export default function LoadBuildingPage() {
    const lb = useLoadBuilding()
    const [confirmCancel, setConfirmCancel] = useState(false)

    const { plan } = lb
    const editable = plan?.status === 'DRAFT' || plan?.status === 'VALIDATED'
    const activeTrip = plan?.trips[0] ?? null

    const vehicleOptions = useMemo<Option[]>(
        () =>
            lb.vehicles.map((v) => ({
                value: v.id,
                label: vehicleOptionLabel(v, lb.planByVehicle.get(v.id)),
            })),
        [lb.vehicles, lb.planByVehicle],
    )

    const exec = async (
        fn: () => Promise<string | null>,
        success: string,
    ) => {
        const err = await fn()
        if (err) notify('danger', 'Load Building', err)
        else notify('success', 'Load Building', success)
    }

    const cargoColumns = useMemo<ColumnDef<LoadPlanLine>[]>(
        () => [
            {
                header: 'Shipment',
                cell: ({ row }) => row.original.shipmentLine.shipment.reference,
            },
            {
                header: 'Item',
                cell: ({ row }) => lineLabel(row.original.shipmentLine),
            },
            { header: 'Qty', accessorKey: 'assignedQty' },
            {
                header: 'Ship from',
                cell: ({ row }) => shipFromLabel(row.original.shipmentLine),
            },
            {
                header: 'Ship to',
                cell: ({ row }) => (
                    <span className="line-clamp-2 max-w-xs">
                        {row.original.shipmentLine.shipment.customerName
                            ? `${row.original.shipmentLine.shipment.customerName} — `
                            : ''}
                        {row.original.shipmentLine.shipToAddress}
                    </span>
                ),
            },
            {
                header: 'Return',
                cell: ({ row }) => returnLabel(row.original.shipmentLine),
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) =>
                    editable ? (
                        <Button
                            size="xs"
                            variant="plain"
                            className="text-red-600"
                            disabled={lb.busy}
                            onClick={() =>
                                void exec(
                                    () => lb.removeLine(row.original.id),
                                    'Line removed from load',
                                )
                            }
                        >
                            Remove
                        </Button>
                    ) : null,
            },
        ],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [editable, lb.busy, lb.removeLine],
    )

    const availableColumns = useMemo<ColumnDef<ShipmentLine>[]>(
        () => [
            { header: 'Shipment', cell: ({ row }) => row.original.shipment.reference },
            { header: 'Item', cell: ({ row }) => lineLabel(row.original) },
            { header: 'Qty', accessorKey: 'quantity' },
            { header: 'Ship from', cell: ({ row }) => shipFromLabel(row.original) },
            {
                header: 'Ship to',
                cell: ({ row }) => (
                    <span className="line-clamp-2 max-w-xs">
                        {row.original.shipment.customerName
                            ? `${row.original.shipment.customerName} — `
                            : ''}
                        {row.original.shipToAddress}
                    </span>
                ),
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) => {
                    const overCapacity =
                        plan != null && row.original.quantity > plan.capacity.remainingQty
                    return (
                        <Button
                            size="xs"
                            variant="solid"
                            disabled={!editable || lb.busy || overCapacity}
                            title={overCapacity ? 'Exceeds remaining item capacity' : undefined}
                            onClick={() =>
                                void exec(
                                    () => lb.addLine(row.original),
                                    `${row.original.shipment.reference} line ${row.original.lineNo} loaded`,
                                )
                            }
                        >
                            Add
                        </Button>
                    )
                },
            },
        ],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [editable, lb.busy, lb.addLine, plan],
    )

    return (
        <PageContainer>
            <PageHeader
                title="Load Building"
                description="Put shipment lines on a vehicle within its item capacity, validate, then mark the load READY for Trip Planning."
                breadcrumbs={scmPageBreadcrumbs('Load Building')}
                actions={
                    <Link href="/scm/trip-planning">
                        <Button>Trip Planning</Button>
                    </Link>
                }
            />

            {lb.error ? (
                <Alert showIcon type="danger" className="mb-4" title="API error">
                    {lb.error}
                </Alert>
            ) : null}

            <AdaptiveCard className="mb-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <Select
                        className="md:w-[32rem]"
                        placeholder={lb.loading ? 'Loading vehicles…' : 'Select vehicle…'}
                        isLoading={lb.loading}
                        options={vehicleOptions}
                        value={vehicleOptions.find((o) => o.value === lb.vehicleId) ?? null}
                        onChange={(option) =>
                            lb.setVehicleId((option as Option | null)?.value ?? '')
                        }
                    />
                    {lb.vehicle?.routingBlocked ? (
                        <StatusBadge tone="danger">Routing blocked</StatusBadge>
                    ) : null}
                </div>
            </AdaptiveCard>

            {!lb.vehicle ? (
                <AdaptiveCard>
                    <p className="py-10 text-center text-gray-500">
                        Select a vehicle to build its load.
                    </p>
                </AdaptiveCard>
            ) : !plan ? (
                <AdaptiveCard>
                    <div className="flex flex-col items-center gap-3 py-10 text-center">
                        <p className="text-gray-600 dark:text-gray-300">
                            {lb.vehicle.plateNumber} has no active load plan.
                        </p>
                        <Button
                            variant="solid"
                            loading={lb.busy}
                            disabled={lb.vehicle.routingBlocked || lb.vehicle.capacityQty <= 0}
                            onClick={() => void exec(lb.startPlan, 'Load plan started')}
                        >
                            Start load plan
                        </Button>
                        {lb.vehicle.capacityQty <= 0 ? (
                            <p className="text-xs text-red-600">
                                Set the vehicle item capacity before load building.
                            </p>
                        ) : null}
                    </div>
                </AdaptiveCard>
            ) : (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    <AdaptiveCard className="xl:col-span-1">
                        <div className="mb-4 flex items-start justify-between gap-2">
                            <div>
                                <p className="text-xs text-gray-500">Load plan</p>
                                <p className="text-lg font-semibold">{plan.code}</p>
                                <p className="text-xs text-gray-500">
                                    {plan.lineCount} line(s) · {lb.vehicle.plateNumber}
                                </p>
                            </div>
                            <StatusBadge tone={statusTone(plan.status)}>
                                {formatStatusLabel(plan.status)}
                            </StatusBadge>
                        </div>

                        <CapacitySummary plan={plan} />

                        <div className="mt-5 flex flex-wrap gap-2">
                            {plan.status === 'DRAFT' ? (
                                <Button
                                    variant="solid"
                                    loading={lb.busy}
                                    disabled={plan.lineCount === 0}
                                    onClick={() =>
                                        void exec(() => lb.action('validate'), 'Load validated')
                                    }
                                >
                                    Validate
                                </Button>
                            ) : null}
                            {plan.status === 'VALIDATED' ? (
                                <Button
                                    variant="solid"
                                    loading={lb.busy}
                                    onClick={() =>
                                        void exec(
                                            () => lb.action('ready'),
                                            'Load is READY for Trip Planning',
                                        )
                                    }
                                >
                                    Mark ready
                                </Button>
                            ) : null}
                            {(plan.status === 'VALIDATED' || plan.status === 'READY') &&
                            !activeTrip ? (
                                <Button
                                    disabled={lb.busy}
                                    onClick={() =>
                                        void exec(() => lb.action('reopen'), 'Load reopened for editing')
                                    }
                                >
                                    Reopen
                                </Button>
                            ) : null}
                            {!activeTrip &&
                            ['DRAFT', 'VALIDATED', 'READY'].includes(plan.status) ? (
                                <Button
                                    variant="plain"
                                    className="text-red-600"
                                    disabled={lb.busy}
                                    onClick={() => setConfirmCancel(true)}
                                >
                                    Cancel plan
                                </Button>
                            ) : null}
                        </div>

                        {plan.status === 'READY' && !activeTrip ? (
                            <Alert showIcon type="success" className="mt-4">
                                Ready — create the trip in{' '}
                                <Link href="/scm/trip-planning" className="underline">
                                    Trip Planning
                                </Link>
                                .
                            </Alert>
                        ) : null}
                        {activeTrip ? (
                            <Alert showIcon type="info" className="mt-4">
                                On trip {activeTrip.code} ({formatStatusLabel(activeTrip.status)}).
                                Cargo is locked.
                            </Alert>
                        ) : null}
                        {plan.status === 'VALIDATED' ? (
                            <p className="mt-3 text-xs text-gray-500">
                                Adding or removing cargo returns the plan to Draft.
                            </p>
                        ) : null}
                    </AdaptiveCard>

                    <div className="flex flex-col gap-4 xl:col-span-2">
                        <AdaptiveCard>
                            <h5 className="mb-3">Assigned cargo</h5>
                            <DataTable
                                columns={cargoColumns}
                                data={plan.lines}
                                noData={plan.lines.length === 0}
                                hidePagination
                            />
                        </AdaptiveCard>

                        {editable ? (
                            <AdaptiveCard>
                                <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                    <h5>Available shipment lines</h5>
                                    <Input
                                        className="md:max-w-xs"
                                        size="sm"
                                        placeholder="Search reference, customer, address…"
                                        value={lb.search}
                                        onChange={(e) => lb.setSearch(e.target.value)}
                                    />
                                </div>
                                <p className="mb-2 text-xs text-gray-500">
                                    Lines of READY shipments not yet on a vehicle. Whole lines only —
                                    no splitting across vehicles.
                                </p>
                                <DataTable
                                    columns={availableColumns}
                                    data={lb.available}
                                    loading={lb.linesLoading}
                                    noData={!lb.linesLoading && lb.available.length === 0}
                                    hidePagination
                                />
                            </AdaptiveCard>
                        ) : null}
                    </div>
                </div>
            )}

            <ConfirmDialog
                isOpen={confirmCancel}
                type="danger"
                title="Cancel load plan"
                confirmText="Cancel plan"
                onClose={() => setConfirmCancel(false)}
                onCancel={() => setConfirmCancel(false)}
                onConfirm={() => {
                    setConfirmCancel(false)
                    void exec(() => lb.action('cancel'), 'Load plan cancelled — cargo released')
                }}
            >
                <p>All cargo lines are released back to the available pool.</p>
            </ConfirmDialog>
        </PageContainer>
    )
}
