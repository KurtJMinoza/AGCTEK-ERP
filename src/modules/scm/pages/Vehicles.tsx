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
import { useVehicles } from '../hooks/useVehicles'
import { formatStatusLabel, statusTone } from '../utils/status'
import type { Vehicle, VehicleStatus, VehicleType } from '../types'

type Option = { value: string; label: string }

const typeOptions: Option[] = [
    { value: 'TRUCK', label: 'Truck' },
    { value: 'VAN', label: 'Van' },
    { value: 'TRAILER', label: 'Trailer' },
    { value: 'REEFER', label: 'Reefer' },
    { value: 'OTHER', label: 'Other' },
]

const statusOptions: Option[] = [
    { value: '', label: 'All statuses' },
    { value: 'AVAILABLE', label: 'Available' },
    { value: 'IN_TRANSIT', label: 'In Transit' },
    { value: 'MAINTENANCE', label: 'Maintenance' },
    { value: 'OUT_OF_SERVICE', label: 'Out of Service' },
    { value: 'INACTIVE', label: 'Inactive' },
]

const emptyForm = {
    code: '',
    plateNumber: '',
    make: '',
    model: '',
    year: '',
    type: 'TRUCK' as VehicleType,
    status: 'AVAILABLE' as VehicleStatus,
    capacityWeightKg: '',
    capacityVolumeM3: '',
    odometerKm: '0',
    maxOdometerKm: '',
    notes: '',
}

export default function VehiclesPage() {
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
        remove,
    } = useVehicles()

    const [dialogOpen, setDialogOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [form, setForm] = useState(emptyForm)

    const columns = useMemo<ColumnDef<Vehicle>[]>(
        () => [
            {
                header: 'Code',
                accessorKey: 'code',
            },
            {
                header: 'Plate',
                accessorKey: 'plateNumber',
            },
            {
                header: 'Vehicle',
                cell: ({ row }) =>
                    `${row.original.make} ${row.original.model}${
                        row.original.year ? ` (${row.original.year})` : ''
                    }`,
            },
            {
                header: 'Type',
                accessorKey: 'type',
                cell: ({ row }) => formatStatusLabel(row.original.type),
            },
            {
                header: 'Capacity',
                cell: ({ row }) =>
                    `${row.original.capacityWeightKg} kg / ${row.original.capacityVolumeM3} m³`,
            },
            {
                header: 'Odometer',
                cell: ({ row }) => `${row.original.odometerKm.toLocaleString()} km`,
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <div className="flex flex-wrap gap-1">
                        <StatusBadge tone={statusTone(row.original.status)}>
                            {formatStatusLabel(row.original.status)}
                        </StatusBadge>
                        {row.original.routingBlocked ? (
                            <StatusBadge tone="danger">Routing blocked</StatusBadge>
                        ) : null}
                    </div>
                ),
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) => (
                    <Button
                        size="xs"
                        variant="plain"
                        className="text-red-600"
                        onClick={() => void remove(row.original.id)}
                    >
                        Delete
                    </Button>
                ),
            },
        ],
        [remove],
    )

    const openCreate = () => {
        setForm(emptyForm)
        setFormError(null)
        setDialogOpen(true)
    }

    const onSubmit = async () => {
        setSaving(true)
        setFormError(null)
        try {
            await create({
                code: form.code,
                plateNumber: form.plateNumber,
                make: form.make,
                model: form.model,
                year: form.year ? Number(form.year) : null,
                type: form.type,
                status: form.status,
                capacityWeightKg: Number(form.capacityWeightKg),
                capacityVolumeM3: Number(form.capacityVolumeM3),
                odometerKm: Number(form.odometerKm || 0),
                maxOdometerKm: form.maxOdometerKm
                    ? Number(form.maxOdometerKm)
                    : null,
                notes: form.notes || null,
            })
            setDialogOpen(false)
        } catch (err) {
            setFormError(
                err instanceof Error ? err.message : 'Failed to create vehicle',
            )
        } finally {
            setSaving(false)
        }
    }

    return (
        <PageContainer>
            <PageHeader
                title="Vehicles"
                description="Fleet master data for transportation planning and load building."
                breadcrumbs={scmPageBreadcrumbs('Vehicles')}
                actions={
                    <Button variant="solid" onClick={openCreate}>
                        Add vehicle
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
                        placeholder="Search code, plate, make…"
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
                <h4 className="mb-4">Add vehicle</h4>
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
                        <FormItem label="Code">
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
                        <FormItem label="Plate number">
                            <Input
                                value={form.plateNumber}
                                onChange={(e) =>
                                    setForm((current) => ({
                                        ...current,
                                        plateNumber: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Make">
                            <Input
                                value={form.make}
                                onChange={(e) =>
                                    setForm((current) => ({
                                        ...current,
                                        make: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Model">
                            <Input
                                value={form.model}
                                onChange={(e) =>
                                    setForm((current) => ({
                                        ...current,
                                        model: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Year">
                            <Input
                                value={form.year}
                                onChange={(e) =>
                                    setForm((current) => ({
                                        ...current,
                                        year: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Type">
                            <Select
                                options={typeOptions}
                                value={typeOptions.find(
                                    (option) => option.value === form.type,
                                )}
                                onChange={(option) =>
                                    setForm((current) => ({
                                        ...current,
                                        type: ((option as Option | null)?.value ||
                                            'TRUCK') as VehicleType,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Capacity weight (kg)">
                            <Input
                                value={form.capacityWeightKg}
                                onChange={(e) =>
                                    setForm((current) => ({
                                        ...current,
                                        capacityWeightKg: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Capacity volume (m³)">
                            <Input
                                value={form.capacityVolumeM3}
                                onChange={(e) =>
                                    setForm((current) => ({
                                        ...current,
                                        capacityVolumeM3: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Odometer (km)">
                            <Input
                                value={form.odometerKm}
                                onChange={(e) =>
                                    setForm((current) => ({
                                        ...current,
                                        odometerKm: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Max odometer (km)">
                            <Input
                                value={form.maxOdometerKm}
                                placeholder="Optional — blocks routing when reached"
                                onChange={(e) =>
                                    setForm((current) => ({
                                        ...current,
                                        maxOdometerKm: e.target.value,
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
                            Save
                        </Button>
                    </div>
                </Form>
            </Dialog>
        </PageContainer>
    )
}
