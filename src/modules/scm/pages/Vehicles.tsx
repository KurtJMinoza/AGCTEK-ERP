'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Dialog from '@/components/ui/Dialog'
import Pagination from '@/components/ui/Pagination'
import Spinner from '@/components/ui/Spinner'
import { Form, FormItem } from '@/components/ui/Form'
import Alert from '@/components/ui/Alert'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import { scmPageBreadcrumbs } from '@/modules/scm/utils/breadcrumbs'
import VehicleViewDialog from '../components/VehicleViewDialog'
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

const pageSizeOptions: Option[] = [
    { value: '10', label: '10 / page' },
    { value: '20', label: '20 / page' },
    { value: '50', label: '50 / page' },
]

const emptyForm = {
    code: '',
    plateNumber: '',
    make: '',
    model: '',
    year: '',
    type: 'TRUCK' as VehicleType,
    status: 'AVAILABLE' as VehicleStatus,
    capacityQty: '',
    odometerKm: '0',
    maintenanceThresholdKm: '',
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
        reload,
    } = useVehicles()

    const [createOpen, setCreateOpen] = useState(false)
    const [viewId, setViewId] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [form, setForm] = useState(emptyForm)

    const openCreate = () => {
        setForm(emptyForm)
        setFormError(null)
        setCreateOpen(true)
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
                capacityQty: Number(form.capacityQty),
                odometerKm: Number(form.odometerKm || 0),
                maintenanceThresholdKm: form.maintenanceThresholdKm
                    ? Number(form.maintenanceThresholdKm)
                    : null,
                notes: form.notes || null,
            })
            setCreateOpen(false)
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
                description="Fleet master data — Capacity (items) drives load assignment and routing eligibility."
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
                                (option) =>
                                    option.value === (params.status ?? ''),
                            ) ?? statusOptions[0]
                        }
                        onChange={(option) =>
                            setParams((current) => ({
                                ...current,
                                page: 1,
                                status:
                                    (option as Option | null)?.value ||
                                    undefined,
                            }))
                        }
                    />
                </div>
            </AdaptiveCard>

            {loading && data.length === 0 ? (
                <div className="flex justify-center py-16">
                    <Spinner size={40} />
                </div>
            ) : null}

            {!loading && data.length === 0 ? (
                <AdaptiveCard>
                    <p className="py-10 text-center text-sm text-gray-500">
                        No vehicles found.
                    </p>
                </AdaptiveCard>
            ) : null}

            {data.length > 0 ? (
                <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {data.map((vehicle) => (
                            <VehicleCard
                                key={vehicle.id}
                                vehicle={vehicle}
                                onView={() => setViewId(vehicle.id)}
                                onDelete={() => void remove(vehicle.id)}
                            />
                        ))}
                    </div>

                    <div className="mt-13 flex flex-col gap-3 border-t border-gray-200 pt-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
                        <Pagination
                            pageSize={pageSize}
                            currentPage={page}
                            total={total}
                            onChange={(nextPage) =>
                                setParams((current) => ({
                                    ...current,
                                    page: nextPage,
                                }))
                            }
                        />
                        <div className="min-w-[130px]">
                            <Select
                                size="sm"
                                menuPlacement="top"
                                isSearchable={false}
                                options={pageSizeOptions}
                                value={
                                    pageSizeOptions.find(
                                        (option) =>
                                            option.value === String(pageSize),
                                    ) ?? pageSizeOptions[0]
                                }
                                onChange={(option) =>
                                    setParams((current) => ({
                                        ...current,
                                        page: 1,
                                        pageSize: Number(
                                            (option as Option | null)?.value ||
                                                10,
                                        ),
                                    }))
                                }
                            />
                        </div>
                    </div>
                </>
            ) : null}

            <Dialog
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                onRequestClose={() => setCreateOpen(false)}
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
                                        type: ((option as Option | null)
                                            ?.value ||
                                            'TRUCK') as VehicleType,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Capacity (items)">
                            <Input
                                value={form.capacityQty}
                                onChange={(e) =>
                                    setForm((current) => ({
                                        ...current,
                                        capacityQty: e.target.value,
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
                        <FormItem label="Maintenance threshold (km)">
                            <Input
                                value={form.maintenanceThresholdKm}
                                placeholder="e.g. 50000 — flags service when reached"
                                onChange={(e) =>
                                    setForm((current) => ({
                                        ...current,
                                        maintenanceThresholdKm: e.target.value,
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
                            onClick={() => setCreateOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" variant="solid" loading={saving}>
                            Save
                        </Button>
                    </div>
                </Form>
            </Dialog>

            <VehicleViewDialog
                vehicleId={viewId}
                isOpen={viewId != null}
                onClose={() => setViewId(null)}
                onUpdated={() => void reload()}
            />
        </PageContainer>
    )
}

function VehicleCard({
    vehicle,
    onView,
    onDelete,
}: {
    vehicle: Vehicle
    onView: () => void
    onDelete: () => void
}) {
    return (
        <Card
            clickable
            className="h-full"
            bodyClass="flex h-full flex-col gap-4"
            header={{
                content: (
                    <div className="flex min-w-0 flex-col gap-1">
                        <span className="truncate font-semibold">
                            {vehicle.plateNumber}
                        </span>
                        <span className="truncate text-xs font-normal text-gray-500">
                            {vehicle.code}
                        </span>
                    </div>
                ),
                extra: (
                    <div className="flex flex-wrap justify-end gap-1">
                        <StatusBadge tone={statusTone(vehicle.status)}>
                            {formatStatusLabel(vehicle.status)}
                        </StatusBadge>
                        {vehicle.routingBlocked ? (
                            <StatusBadge tone="danger">Blocked</StatusBadge>
                        ) : null}
                    </div>
                ),
            }}
            onClick={onView}
        >
            <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                    {vehicle.make} {vehicle.model}
                    {vehicle.year ? ` (${vehicle.year})` : ''}
                </p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {formatStatusLabel(vehicle.type)}
                </p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
                <div className="min-w-0">
                    <dt className="text-xs uppercase tracking-wide text-gray-400">
                        Capacity
                    </dt>
                    <dd className="mt-0.5 truncate font-medium tabular-nums">
                        {(vehicle.capacityQty ?? 0).toLocaleString()}{' '}
                        <span className="font-normal text-gray-500">items</span>
                    </dd>
                </div>
                <div className="min-w-0">
                    <dt className="text-xs uppercase tracking-wide text-gray-400">
                        Odometer (last)
                    </dt>
                    <dd className="mt-0.5 truncate font-medium tabular-nums">
                        {(vehicle.odometerKm ?? 0).toLocaleString()}{' '}
                        <span className="font-normal text-gray-500">km</span>
                    </dd>
                </div>
            </dl>
            <div className="mt-auto flex items-center justify-end gap-2 pt-1">
                <Button
                    size="xs"
                    onClick={(e) => {
                        e.stopPropagation()
                        onView()
                    }}
                >
                    View
                </Button>
                <Button
                    size="xs"
                    variant="plain"
                    className="text-red-600"
                    onClick={(e) => {
                        e.stopPropagation()
                        onDelete()
                    }}
                >
                    Delete
                </Button>
            </div>
        </Card>
    )
}
