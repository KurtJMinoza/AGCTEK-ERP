'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { HiOutlineEye } from 'react-icons/hi'
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
import TripLoadManifestDialog from '../components/trips/TripLoadManifestDialog'
import { useTrips } from '../hooks/useTrips'
import { computeCapacity } from '../utils/capacity'
import { formatStatusLabel, statusTone } from '../utils/status'
import type { Trip } from '../types'

type Option = { value: string; label: string }

const statusOptions: Option[] = [
    { value: '', label: 'All statuses' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'PLANNED', label: 'Planned' },
    { value: 'READY', label: 'Ready' },
    { value: 'DISPATCHED', label: 'Dispatched' },
    { value: 'ASSIGNED', label: 'Assigned' },
    { value: 'IN_TRANSIT', label: 'In Transit' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'CANCELLED', label: 'Cancelled' },
]

export default function TripsPage() {
    const { data, total, page, pageSize, loading, error, params, setParams } =
        useTrips()

    const [manifestTripId, setManifestTripId] = useState<string | null>(null)

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
                cell: ({ row }) => (
                    <Button
                        size="xs"
                        variant="plain"
                        icon={<HiOutlineEye />}
                        aria-label={`View load manifest for ${row.original.code}`}
                        onClick={() => setManifestTripId(row.original.id)}
                    />
                ),
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <PageHeader
                title="Trips"
                description="Trip list and history. Trips are planned and dispatched in Trip Planning; drivers start and complete them in the driver app."
                breadcrumbs={scmPageBreadcrumbs('Trips')}
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

            <TripLoadManifestDialog
                isOpen={Boolean(manifestTripId)}
                tripId={manifestTripId}
                onClose={() => setManifestTripId(null)}
            />
        </PageContainer>
    )
}
