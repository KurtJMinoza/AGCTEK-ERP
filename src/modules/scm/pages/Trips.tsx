'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Alert from '@/components/ui/Alert'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import { scmPageBreadcrumbs } from '@/modules/scm/utils/breadcrumbs'
import StatusBadge from '@/components/shared/StatusBadge'
import PlanTripWizard from '../components/trips/PlanTripWizard'
import EditTripDialog from '../components/trips/EditTripDialog'
import { useTrips } from '../hooks/useTrips'
import { computeCapacity } from '../utils/capacity'
import { formatStatusLabel, statusTone } from '../utils/status'
import type { Trip, TripStatus } from '../types'

type Option = { value: string; label: string }

const statusOptions: Option[] = [
    { value: '', label: 'All statuses' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'PLANNED', label: 'Planned' },
    { value: 'ASSIGNED', label: 'Assigned' },
    { value: 'IN_TRANSIT', label: 'In Transit' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'CANCELLED', label: 'Cancelled' },
]

/** Phase 3.2 Dispatch → 3.3 Start → Complete */
const nextStatus: Partial<Record<TripStatus, TripStatus>> = {
    DRAFT: 'PLANNED',
    PLANNED: 'ASSIGNED',
    ASSIGNED: 'IN_TRANSIT',
    IN_TRANSIT: 'COMPLETED',
}

const advanceLabel: Partial<Record<TripStatus, string>> = {
    DRAFT: 'Approve plan',
    PLANNED: 'Dispatch',
    ASSIGNED: 'Start trip',
    IN_TRANSIT: 'Complete',
}

export default function TripsPage() {
    const {
        data,
        total,
        page,
        pageSize,
        loading,
        error,
        params,
        setParams,
        updateStatus,
        update,
        remove,
        reload,
    } = useTrips()

    const [wizardOpen, setWizardOpen] = useState(false)
    const [editingTrip, setEditingTrip] = useState<Trip | null>(null)

    const columns = useMemo<ColumnDef<Trip>[]>(
        () => [
            { header: 'Code', accessorKey: 'code' },
            {
                header: 'Vehicle',
                cell: ({ row }) =>
                    row.original.vehicle
                        ? `${row.original.vehicle.code} (${row.original.vehicle.plateNumber})`
                        : '—',
            },
            {
                header: 'Driver',
                cell: ({ row }) =>
                    row.original.driver
                        ? `${row.original.driver.firstName} ${row.original.driver.lastName}`
                        : '—',
            },
            {
                header: 'Stops',
                cell: ({ row }) => row.original.stops?.length ?? 0,
            },
            {
                header: 'Load',
                cell: ({ row }) => {
                    const vehicle = row.original.vehicle
                    if (!vehicle) return '—'
                    const shipments =
                        row.original.stops?.flatMap(
                            (stop) =>
                                stop.shipments
                                    ?.map((link) => link.shipment)
                                    .filter(Boolean) ?? [],
                        ) ?? []
                    const unique = [
                        ...new Map(
                            shipments.map((s) => [s!.id, s!]),
                        ).values(),
                    ]
                    const snap = computeCapacity(vehicle, unique)
                    if (snap.pctQty == null) {
                        return '—'
                    }
                    return (
                        <span className="text-xs text-gray-600 dark:text-gray-300">
                            {snap.loadedQty}/{snap.capacityQty} (
                            {Math.round(snap.pctQty)}%)
                        </span>
                    )
                },
            },
            {
                header: 'Planned start',
                cell: ({ row }) =>
                    row.original.plannedStartAt
                        ? new Date(row.original.plannedStartAt).toLocaleString()
                        : '—',
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
                header: '',
                id: 'actions',
                cell: ({ row }) => {
                    const advance = nextStatus[row.original.status]
                    const canEdit =
                        row.original.status === 'DRAFT' ||
                        row.original.status === 'PLANNED'
                    return (
                        <div className="flex flex-wrap gap-1">
                            {canEdit ? (
                                <Button
                                    size="xs"
                                    onClick={() => setEditingTrip(row.original)}
                                >
                                    Edit
                                </Button>
                            ) : null}
                            {advance ? (
                                <Button
                                    size="xs"
                                    variant="solid"
                                    onClick={() =>
                                        void updateStatus(row.original.id, advance)
                                    }
                                >
                                    {advanceLabel[row.original.status] ??
                                        `→ ${formatStatusLabel(advance)}`}
                                </Button>
                            ) : null}
                            <Button
                                size="xs"
                                variant="plain"
                                className="text-red-600"
                                onClick={() => void remove(row.original.id)}
                            >
                                Delete
                            </Button>
                        </div>
                    )
                },
            },
        ],
        [remove, updateStatus],
    )

    return (
        <PageContainer>
            <PageHeader
                title="Trips"
                description="Fleet & Dispatch (3.2) → Start trip for In-Transit Monitoring (3.3). Plan trip builds load; Dispatch requires a vehicle."
                breadcrumbs={scmPageBreadcrumbs('Trips')}
                actions={
                    <Button
                        variant="solid"
                        onClick={() => setWizardOpen(true)}
                    >
                        Plan trip
                    </Button>
                }
            />

            {error ? (
                <Alert showIcon type="danger" className="mb-4" title="API error">
                    {error}
                </Alert>
            ) : null}

            <AdaptiveCard className="mb-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <Input
                        className="md:max-w-xs"
                        placeholder="Search trip code…"
                        value={params.search ?? ''}
                        onChange={(e) =>
                            setParams((current) => ({
                                ...current,
                                page: 1,
                                search: e.target.value,
                            }))
                        }
                    />
                    <Select
                        className="md:w-56"
                        options={statusOptions}
                        value={
                            statusOptions.find(
                                (option) => option.value === (params.status ?? ''),
                            ) ?? statusOptions[0]
                        }
                        onChange={(option) =>
                            setParams((current) => ({
                                ...current,
                                page: 1,
                                status: (option as Option | null)?.value || undefined,
                            }))
                        }
                    />
                </div>
            </AdaptiveCard>

            <AdaptiveCard>
                <DataTable
                    columns={columns}
                    data={data}
                    loading={loading}
                    noData={!loading && data.length === 0}
                    pagingData={{
                        total,
                        pageIndex: page,
                        pageSize,
                    }}
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
            </AdaptiveCard>

            <PlanTripWizard
                isOpen={wizardOpen}
                onClose={() => setWizardOpen(false)}
                onCreated={() => {
                    void reload()
                }}
            />

            <EditTripDialog
                isOpen={Boolean(editingTrip)}
                trip={editingTrip}
                onClose={() => setEditingTrip(null)}
                onSave={async (id, body) => {
                    await update(id, body)
                }}
            />
        </PageContainer>
    )
}
