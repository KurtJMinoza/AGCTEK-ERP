'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Dialog from '@/components/ui/Dialog'
import { Form, FormItem } from '@/components/ui/Form'
import Alert from '@/components/ui/Alert'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import { scmPageBreadcrumbs } from '@/modules/scm/utils/breadcrumbs'
import StatusBadge from '@/components/shared/StatusBadge'
import { useTrips } from '../hooks/useTrips'
import { useVehicles } from '../hooks/useVehicles'
import { formatStatusLabel, statusTone } from '../utils/status'
import type { Trip, TripStatus } from '../types'

type Option = { value: string; label: string }

const statusOptions: Option[] = [
    { value: '', label: 'All statuses' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'PLANNED', label: 'Planned' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'CANCELLED', label: 'Cancelled' },
]

const nextStatus: Partial<Record<TripStatus, TripStatus>> = {
    DRAFT: 'PLANNED',
    PLANNED: 'IN_PROGRESS',
    IN_PROGRESS: 'COMPLETED',
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
        create,
        updateStatus,
        remove,
    } = useTrips()

    const vehicles = useVehicles({ page: 1, pageSize: 100 })

    const [dialogOpen, setDialogOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [form, setForm] = useState({
        code: '',
        vehicleId: '',
        plannedStartAt: '',
        notes: '',
        stopAddress: '',
        stopName: '',
        windowStart: '',
        windowEnd: '',
    })

    const vehicleOptions: Option[] = useMemo(
        () => [
            { value: '', label: 'Unassigned' },
            ...vehicles.data.map((vehicle) => ({
                value: vehicle.id,
                label: `${vehicle.code} · ${vehicle.plateNumber}${
                    vehicle.routingBlocked ? ' (blocked)' : ''
                }`,
            })),
        ],
        [vehicles.data],
    )

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
                    return (
                        <div className="flex gap-1">
                            {advance ? (
                                <Button
                                    size="xs"
                                    onClick={() =>
                                        void updateStatus(row.original.id, advance)
                                    }
                                >
                                    → {formatStatusLabel(advance)}
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

    const onSubmit = async () => {
        setSaving(true)
        setFormError(null)
        try {
            await create({
                code: form.code,
                vehicleId: form.vehicleId || null,
                plannedStartAt: form.plannedStartAt || null,
                notes: form.notes || null,
                status: 'DRAFT',
                stops: form.stopAddress
                    ? [
                          {
                              sequence: 1,
                              name: form.stopName || undefined,
                              address: form.stopAddress,
                              windowStart: form.windowStart || undefined,
                              windowEnd: form.windowEnd || undefined,
                          },
                      ]
                    : [],
            })
            setDialogOpen(false)
            setForm({
                code: '',
                vehicleId: '',
                plannedStartAt: '',
                notes: '',
                stopAddress: '',
                stopName: '',
                windowStart: '',
                windowEnd: '',
            })
        } catch (err) {
            setFormError(
                err instanceof Error ? err.message : 'Failed to create trip',
            )
        } finally {
            setSaving(false)
        }
    }

    return (
        <PageContainer>
            <PageHeader
                title="Trips"
                description="Multi-stop routes with vehicle assignment and time windows."
                breadcrumbs={scmPageBreadcrumbs('Trips')}
                actions={
                    <Button
                        variant="solid"
                        onClick={() => {
                            setFormError(null)
                            setDialogOpen(true)
                        }}
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

            <Dialog
                isOpen={dialogOpen}
                onClose={() => setDialogOpen(false)}
                onRequestClose={() => setDialogOpen(false)}
            >
                <h4 className="mb-4">Plan trip</h4>
                {formError ? (
                    <Alert showIcon type="danger" className="mb-3">
                        {formError}
                    </Alert>
                ) : null}
                <Form
                    onSubmit={(e) => {
                        e.preventDefault()
                        void onSubmit()
                    }}
                >
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <FormItem label="Trip code">
                            <Input
                                value={form.code}
                                onChange={(e) =>
                                    setForm((current) => ({
                                        ...current,
                                        code: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Vehicle">
                            <Select
                                options={vehicleOptions}
                                value={
                                    vehicleOptions.find(
                                        (option) => option.value === form.vehicleId,
                                    ) ?? vehicleOptions[0]
                                }
                                onChange={(option) =>
                                    setForm((current) => ({
                                        ...current,
                                        vehicleId:
                                            (option as Option | null)?.value || '',
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Planned start">
                            <Input
                                type="datetime-local"
                                value={form.plannedStartAt}
                                onChange={(e) =>
                                    setForm((current) => ({
                                        ...current,
                                        plannedStartAt: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="First stop name">
                            <Input
                                value={form.stopName}
                                onChange={(e) =>
                                    setForm((current) => ({
                                        ...current,
                                        stopName: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="First stop address" className="md:col-span-2">
                            <Input
                                value={form.stopAddress}
                                onChange={(e) =>
                                    setForm((current) => ({
                                        ...current,
                                        stopAddress: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Window start">
                            <Input
                                type="datetime-local"
                                value={form.windowStart}
                                onChange={(e) =>
                                    setForm((current) => ({
                                        ...current,
                                        windowStart: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Window end">
                            <Input
                                type="datetime-local"
                                value={form.windowEnd}
                                onChange={(e) =>
                                    setForm((current) => ({
                                        ...current,
                                        windowEnd: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                    </div>
                    <FormItem label="Notes" className="mt-3">
                        <Input
                            textArea
                            value={form.notes}
                            onChange={(e) =>
                                setForm((current) => ({
                                    ...current,
                                    notes: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <div className="mt-4 flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="plain"
                            onClick={() => setDialogOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" variant="solid" loading={saving}>
                            Save trip
                        </Button>
                    </div>
                </Form>
            </Dialog>
        </PageContainer>
    )
}
