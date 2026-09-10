'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Dialog from '@/components/ui/Dialog'
import Checkbox from '@/components/ui/Checkbox'
import Alert from '@/components/ui/Alert'
import { Form, FormItem } from '@/components/ui/Form'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import { useMaintenance } from '../hooks/useMaintenance'
import {
    apiGetVehicles,
    apiSetOdometerThresholds,
} from '../services/scmApi'
import { scmPageBreadcrumbs } from '../utils/breadcrumbs'
import { getApiErrorMessage } from '../utils/apiError'
import { formatStatusLabel, statusTone } from '../utils/status'
import type {
    MaintenanceRecord,
    MaintenanceStatus,
    MaintenanceType,
    Vehicle,
} from '../types'

type Option = { value: string; label: string }

const statusFilterOptions: Option[] = [
    { value: '', label: 'All statuses' },
    { value: 'SCHEDULED', label: 'Scheduled' },
    { value: 'IN_PROGRESS', label: 'In progress' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'CANCELLED', label: 'Cancelled' },
]

const typeFilterOptions: Option[] = [
    { value: '', label: 'All types' },
    { value: 'PREVENTATIVE', label: 'Preventative' },
    { value: 'CORRECTIVE', label: 'Corrective' },
    { value: 'INSPECTION', label: 'Inspection' },
    { value: 'OTHER', label: 'Other' },
]

const typeFormOptions = typeFilterOptions.filter((o) => o.value !== '')

type MaintForm = {
    vehicleId: string
    type: MaintenanceType
    title: string
    description: string
    scheduledAt: string
    odometerKm: string
    cost: string
    blocksRouting: boolean
    status: MaintenanceStatus
}

const emptyForm = (): MaintForm => ({
    vehicleId: '',
    type: 'PREVENTATIVE',
    title: '',
    description: '',
    scheduledAt: new Date().toISOString().slice(0, 16),
    odometerKm: '',
    cost: '',
    blocksRouting: true,
    status: 'SCHEDULED',
})

function nextStatus(
    status: MaintenanceStatus,
): MaintenanceStatus | null {
    if (status === 'SCHEDULED') return 'IN_PROGRESS'
    if (status === 'IN_PROGRESS') return 'COMPLETED'
    return null
}

export default function MaintenancePage() {
    const {
        data,
        total,
        page,
        pageSize,
        loading,
        error,
        params,
        setParams,
        reload,
        create,
        update,
        remove,
    } = useMaintenance()

    const [vehicles, setVehicles] = useState<Vehicle[]>([])
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editing, setEditing] = useState<MaintenanceRecord | null>(null)
    const [form, setForm] = useState<MaintForm>(emptyForm)
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)

    const [thresholdModalOpen, setThresholdModalOpen] = useState(false)
    const [thresholdKm, setThresholdKm] = useState('')
    const [selectedVehicleIds, setSelectedVehicleIds] = useState<Option[]>([])
    const [thresholdSaving, setThresholdSaving] = useState(false)
    const [thresholdMsg, setThresholdMsg] = useState<string | null>(null)
    const [thresholdErr, setThresholdErr] = useState<string | null>(null)

    const openThresholdModal = () => {
        setThresholdErr(null)
        setThresholdMsg(null)
        setThresholdModalOpen(true)
    }

    const closeThresholdModal = () => {
        if (thresholdSaving) return
        setThresholdModalOpen(false)
    }

    useEffect(() => {
        void apiGetVehicles({ page: 1, pageSize: 100 })
            .then((result) => setVehicles(result.data))
            .catch(() => setVehicles([]))
    }, [])

    const vehicleOptions: Option[] = useMemo(
        () =>
            vehicles.map((v) => ({
                value: v.id,
                label: `${v.plateNumber} · ${v.code} (${v.odometerKm.toLocaleString()} km${
                    v.maintenanceThresholdKm != null
                        ? ` · due @ ${v.maintenanceThresholdKm.toLocaleString()} km`
                        : ''
                })`,
            })),
        [vehicles],
    )

    const parseThresholdInput = (): number | null | 'invalid' => {
        const trimmed = thresholdKm.trim()
        if (trimmed === '') return null
        const n = Number(trimmed)
        if (!Number.isFinite(n) || n <= 0) return 'invalid'
        return n
    }

    const applyThresholds = async (scope: 'all' | 'selected') => {
        setThresholdErr(null)
        setThresholdMsg(null)
        const parsed = parseThresholdInput()
        if (parsed === 'invalid' || parsed === null) {
            setThresholdErr('Enter a threshold greater than 0 km.')
            return
        }
        if (scope === 'selected' && selectedVehicleIds.length === 0) {
            setThresholdErr('Select at least one vehicle.')
            return
        }
        if (
            scope === 'all' &&
            !confirm(
                `Set maintenance threshold to ${parsed.toLocaleString()} km on ALL vehicles? Vehicles already at or past that odometer will get a blocking preventative record.`,
            )
        ) {
            return
        }

        setThresholdSaving(true)
        try {
            const result = await apiSetOdometerThresholds({
                thresholdKm: parsed,
                ...(scope === 'selected'
                    ? {
                          vehicleIds: selectedVehicleIds.map((o) => o.value),
                      }
                    : {}),
            })
            setThresholdMsg(
                `Set ${parsed.toLocaleString()} km on ${result.updated} vehicle(s)${
                    result.dueOpened
                        ? ` · ${result.dueOpened} already due (opened maintenance)`
                        : ''
                }.`,
            )
            const refreshed = await apiGetVehicles({ page: 1, pageSize: 100 })
            setVehicles(refreshed.data)
            await reload()
        } catch (err) {
            setThresholdErr(
                getApiErrorMessage(err, 'Failed to update odometer thresholds'),
            )
        } finally {
            setThresholdSaving(false)
        }
    }

    const clearThresholds = async (scope: 'all' | 'selected') => {
        setThresholdErr(null)
        setThresholdMsg(null)
        if (scope === 'selected' && selectedVehicleIds.length === 0) {
            setThresholdErr('Select at least one vehicle.')
            return
        }
        if (
            scope === 'all' &&
            !confirm(
                'Clear odometer service thresholds on ALL vehicles?',
            )
        ) {
            return
        }

        setThresholdSaving(true)
        try {
            const result = await apiSetOdometerThresholds({
                thresholdKm: null,
                ...(scope === 'selected'
                    ? {
                          vehicleIds: selectedVehicleIds.map((o) => o.value),
                      }
                    : {}),
            })
            setThresholdMsg(
                `Cleared thresholds on ${result.updated} vehicle(s).`,
            )
            const refreshed = await apiGetVehicles({ page: 1, pageSize: 100 })
            setVehicles(refreshed.data)
        } catch (err) {
            setThresholdErr(
                getApiErrorMessage(err, 'Failed to clear odometer thresholds'),
            )
        } finally {
            setThresholdSaving(false)
        }
    }

    const openCreate = () => {
        setEditing(null)
        const first = vehicles[0]
        setForm({
            ...emptyForm(),
            vehicleId: first?.id ?? '',
            odometerKm: first ? String(first.odometerKm) : '',
        })
        setFormError(null)
        setDialogOpen(true)
    }

    const openEdit = (record: MaintenanceRecord) => {
        setEditing(record)
        setForm({
            vehicleId: record.vehicleId,
            type: record.type,
            title: record.title,
            description: record.description ?? '',
            scheduledAt: record.scheduledAt
                ? new Date(record.scheduledAt).toISOString().slice(0, 16)
                : '',
            odometerKm:
                record.odometerKm != null ? String(record.odometerKm) : '',
            cost: record.cost != null ? String(record.cost) : '',
            blocksRouting: record.blocksRouting,
            status: record.status,
        })
        setFormError(null)
        setDialogOpen(true)
    }

    const onSubmit = async () => {
        setSaving(true)
        setFormError(null)
        try {
            const payload = {
                vehicleId: form.vehicleId,
                type: form.type,
                title: form.title.trim(),
                description: form.description.trim() || null,
                scheduledAt: form.scheduledAt
                    ? new Date(form.scheduledAt).toISOString()
                    : new Date().toISOString(),
                odometerKm: form.odometerKm
                    ? Number(form.odometerKm)
                    : null,
                cost: form.cost ? Number(form.cost) : null,
                blocksRouting: form.blocksRouting,
                status: form.status,
            }
            if (editing) {
                await update(editing.id, payload)
            } else {
                await create(payload)
            }
            setDialogOpen(false)
            setEditing(null)
        } catch (err) {
            setFormError(
                getApiErrorMessage(
                    err,
                    editing
                        ? 'Failed to update maintenance'
                        : 'Failed to create maintenance',
                ),
            )
        } finally {
            setSaving(false)
        }
    }

    const advance = async (record: MaintenanceRecord) => {
        const next = nextStatus(record.status)
        if (!next) return
        try {
            await update(record.id, { status: next })
        } catch (err) {
            alert(getApiErrorMessage(err, 'Failed to update status'))
        }
    }

    const columns = useMemo<ColumnDef<MaintenanceRecord>[]>(
        () => [
            {
                header: 'Vehicle',
                cell: ({ row }) => (
                    <div>
                        <p className="font-medium">
                            {row.original.vehicle?.plateNumber ?? '—'}
                        </p>
                        <p className="text-xs text-gray-500">
                            {row.original.vehicle?.code ?? row.original.vehicleId}
                            {row.original.vehicle
                                ? ` · ${formatStatusLabel(row.original.vehicle.status)}`
                                : ''}
                        </p>
                    </div>
                ),
            },
            {
                header: 'Title / type',
                cell: ({ row }) => (
                    <div>
                        <p className="font-medium">{row.original.title}</p>
                        <p className="text-xs text-gray-500">
                            {formatStatusLabel(row.original.type)}
                        </p>
                    </div>
                ),
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
                    new Date(row.original.scheduledAt).toLocaleString(),
            },
            {
                header: 'Completed',
                cell: ({ row }) =>
                    row.original.completedAt
                        ? new Date(row.original.completedAt).toLocaleString()
                        : '—',
            },
            {
                header: 'Blocks',
                cell: ({ row }) =>
                    row.original.blocksRouting ||
                    row.original.status === 'IN_PROGRESS' ? (
                        <StatusBadge tone="warning">Yes</StatusBadge>
                    ) : (
                        'No'
                    ),
            },
            {
                header: 'Cost',
                cell: ({ row }) =>
                    row.original.cost != null
                        ? row.original.cost.toLocaleString(undefined, {
                              style: 'currency',
                              currency: 'PHP',
                          })
                        : '—',
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) => {
                    const advanceLabel =
                        row.original.status === 'SCHEDULED'
                            ? 'Start'
                            : row.original.status === 'IN_PROGRESS'
                              ? 'Complete'
                              : null
                    return (
                        <div className="flex flex-wrap items-center justify-end gap-1">
                            {advanceLabel ? (
                                <Button
                                    size="xs"
                                    variant="solid"
                                    onClick={() => void advance(row.original)}
                                >
                                    {advanceLabel}
                                </Button>
                            ) : null}
                            {row.original.status === 'SCHEDULED' ||
                            row.original.status === 'IN_PROGRESS' ? (
                                <Button
                                    size="xs"
                                    onClick={() =>
                                        void update(row.original.id, {
                                            status: 'CANCELLED',
                                        })
                                    }
                                >
                                    Cancel
                                </Button>
                            ) : null}
                            <Button
                                size="xs"
                                onClick={() => openEdit(row.original)}
                            >
                                Edit
                            </Button>
                            <Button
                                size="xs"
                                variant="plain"
                                className="text-red-600"
                                onClick={() => {
                                    if (
                                        confirm(
                                            `Delete maintenance “${row.original.title}”?`,
                                        )
                                    ) {
                                        void remove(row.original.id)
                                    }
                                }}
                            >
                                Delete
                            </Button>
                        </div>
                    )
                },
            },
        ],
        [remove, update],
    )

    return (
        <PageContainer>
            <PageHeader
                title="Maintenance"
                description="Fleet preventative / corrective work. Blocking records take vehicles out of the routing pool (not an OBD console)."
                breadcrumbs={scmPageBreadcrumbs('Maintenance')}
                actions={
                    <div className="flex flex-wrap gap-2">
                        <Button onClick={openThresholdModal}>
                            Odometer thresholds
                        </Button>
                        <Button variant="solid" onClick={openCreate}>
                            Schedule maintenance
                        </Button>
                    </div>
                }
            />

            {error ? (
                <Alert showIcon type="danger" className="mb-4" title="API error">
                    {error}
                </Alert>
            ) : null}

            <Dialog
                isOpen={thresholdModalOpen}
                width={640}
                onClose={closeThresholdModal}
                onRequestClose={closeThresholdModal}
            >
                <h5 className="mb-1">Odometer service thresholds</h5>
                <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                    Set the absolute odometer km that triggers a blocking
                    preventative job. Apply to the whole fleet or selected
                    vehicles (writes each vehicle&apos;s maintenance threshold).
                </p>

                {thresholdErr ? (
                    <Alert showIcon type="danger" className="mb-3">
                        {thresholdErr}
                    </Alert>
                ) : null}
                {thresholdMsg ? (
                    <Alert showIcon type="success" className="mb-3">
                        {thresholdMsg}
                    </Alert>
                ) : null}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormItem label="Threshold (km)">
                        <Input
                            type="number"
                            min={1}
                            placeholder="e.g. 50000"
                            value={thresholdKm}
                            disabled={thresholdSaving}
                            onChange={(e) => setThresholdKm(e.target.value)}
                        />
                    </FormItem>
                    <FormItem label="Vehicles (for Apply / Clear selected)">
                        <Select
                            isMulti
                            options={vehicleOptions}
                            value={selectedVehicleIds}
                            isDisabled={thresholdSaving}
                            placeholder="Select vehicles…"
                            onChange={(opts) =>
                                setSelectedVehicleIds(
                                    (opts as Option[] | null) ?? [],
                                )
                            }
                        />
                    </FormItem>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                        variant="solid"
                        loading={thresholdSaving}
                        onClick={() => void applyThresholds('all')}
                    >
                        Apply to all vehicles
                    </Button>
                    <Button
                        loading={thresholdSaving}
                        onClick={() => void applyThresholds('selected')}
                    >
                        Apply to selected
                    </Button>
                    <Button
                        loading={thresholdSaving}
                        onClick={() => void clearThresholds('selected')}
                    >
                        Clear selected
                    </Button>
                    <Button
                        variant="plain"
                        className="text-red-600"
                        loading={thresholdSaving}
                        onClick={() => void clearThresholds('all')}
                    >
                        Clear all
                    </Button>
                </div>

                <div className="mt-6 flex justify-end">
                    <Button
                        disabled={thresholdSaving}
                        onClick={closeThresholdModal}
                    >
                        Close
                    </Button>
                </div>
            </Dialog>

            <AdaptiveCard className="mb-4">
                <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
                    <Input
                        className="md:max-w-xs"
                        placeholder="Search plate, code, title…"
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
                        className="md:w-48"
                        options={statusFilterOptions}
                        value={
                            statusFilterOptions.find(
                                (o) => o.value === (params.status ?? ''),
                            ) ?? statusFilterOptions[0]
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
                    <Select
                        className="md:w-48"
                        options={typeFilterOptions}
                        value={
                            typeFilterOptions.find(
                                (o) => o.value === (params.type ?? ''),
                            ) ?? typeFilterOptions[0]
                        }
                        onChange={(option) =>
                            setParams((current) => ({
                                ...current,
                                page: 1,
                                type:
                                    (option as Option | null)?.value ||
                                    undefined,
                            }))
                        }
                    />
                    <Select
                        className="md:w-64"
                        options={[
                            { value: '', label: 'All vehicles' },
                            ...vehicleOptions,
                        ]}
                        value={
                            [
                                { value: '', label: 'All vehicles' },
                                ...vehicleOptions,
                            ].find(
                                (o) => o.value === (params.vehicleId ?? ''),
                            ) ?? { value: '', label: 'All vehicles' }
                        }
                        onChange={(option) =>
                            setParams((current) => ({
                                ...current,
                                page: 1,
                                vehicleId:
                                    (option as Option | null)?.value ||
                                    undefined,
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
                        setParams((current) => ({
                            ...current,
                            page: nextPage,
                        }))
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
                width={560}
            >
                <h5 className="mb-4">
                    {editing ? 'Edit maintenance' : 'Schedule maintenance'}
                </h5>
                {formError ? (
                    <Alert showIcon type="danger" className="mb-4">
                        {formError}
                    </Alert>
                ) : null}
                <Form
                    onSubmit={(e) => {
                        e.preventDefault()
                        void onSubmit()
                    }}
                >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <FormItem label="Vehicle" className="md:col-span-2">
                            <Select
                                isDisabled={Boolean(editing)}
                                options={vehicleOptions}
                                value={
                                    vehicleOptions.find(
                                        (o) => o.value === form.vehicleId,
                                    ) ?? null
                                }
                                onChange={(option) => {
                                    const id =
                                        (option as Option | null)?.value ?? ''
                                    const vehicle = vehicles.find(
                                        (v) => v.id === id,
                                    )
                                    setForm((f) => ({
                                        ...f,
                                        vehicleId: id,
                                        odometerKm: vehicle
                                            ? String(vehicle.odometerKm)
                                            : f.odometerKm,
                                    }))
                                }}
                            />
                        </FormItem>
                        <FormItem label="Type">
                            <Select
                                options={typeFormOptions}
                                value={
                                    typeFormOptions.find(
                                        (o) => o.value === form.type,
                                    ) ?? typeFormOptions[0]
                                }
                                onChange={(option) =>
                                    setForm((f) => ({
                                        ...f,
                                        type: ((option as Option | null)
                                            ?.value ||
                                            'PREVENTATIVE') as MaintenanceType,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Status">
                            <Select
                                options={statusFilterOptions.filter(
                                    (o) => o.value !== '',
                                )}
                                value={
                                    statusFilterOptions.find(
                                        (o) => o.value === form.status,
                                    ) ?? statusFilterOptions[1]
                                }
                                onChange={(option) =>
                                    setForm((f) => ({
                                        ...f,
                                        status: ((option as Option | null)
                                            ?.value ||
                                            'SCHEDULED') as MaintenanceStatus,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Title" className="md:col-span-2">
                            <Input
                                value={form.title}
                                placeholder="e.g. Oil change / PM service"
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        title: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Description" className="md:col-span-2">
                            <Input
                                textArea
                                value={form.description}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        description: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Scheduled at">
                            <Input
                                type="datetime-local"
                                value={form.scheduledAt}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        scheduledAt: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Odometer (km)">
                            <Input
                                value={form.odometerKm}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        odometerKm: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Cost (optional)">
                            <Input
                                value={form.cost}
                                placeholder="0"
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        cost: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label=" " className="flex items-end">
                            <Checkbox
                                checked={form.blocksRouting}
                                onChange={(checked) =>
                                    setForm((f) => ({
                                        ...f,
                                        blocksRouting: Boolean(checked),
                                    }))
                                }
                            >
                                Block from routing pool
                            </Checkbox>
                        </FormItem>
                    </div>
                    <p className="mt-3 text-xs text-gray-500">
                        IN_PROGRESS always blocks routing. Completing / cancelling
                        the last blocking record restores AVAILABLE (unless the
                        vehicle is IN_TRANSIT).
                    </p>
                    <div className="mt-6 flex justify-end gap-2">
                        <Button
                            type="button"
                            onClick={() => setDialogOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="solid"
                            type="submit"
                            loading={saving}
                        >
                            {editing ? 'Save' : 'Create'}
                        </Button>
                    </div>
                </Form>
            </Dialog>
        </PageContainer>
    )
}
