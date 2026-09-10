'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Dialog from '@/components/ui/Dialog'
import Alert from '@/components/ui/Alert'
import Radio from '@/components/ui/Radio'
import { Form, FormItem } from '@/components/ui/Form'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import AssignLoadDrawer from '../components/AssignLoadDrawer'
import LocationSearchField from '../components/location/LocationSearchField'
import { useShipments } from '../hooks/useShipments'
import { scmPageBreadcrumbs } from '../utils/breadcrumbs'
import { getApiErrorMessage } from '../utils/apiError'
import {
    formatMovementLabel,
    formatStatusLabel,
    statusTone,
} from '../utils/status'
import type { Shipment, ShipmentMovementType, ShipmentStatus } from '../types'

type Option = { value: string; label: string }

const statusOptions: Option[] = [
    { value: '', label: 'All statuses' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'READY', label: 'Ready' },
    { value: 'ASSIGNED', label: 'Assigned' },
    { value: 'IN_TRANSIT', label: 'In Transit' },
    { value: 'DELIVERED', label: 'Delivered' },
    { value: 'CANCELLED', label: 'Cancelled' },
]

const movementFilterOptions: Option[] = [
    { value: '', label: 'All movements' },
    { value: 'DELIVERY', label: 'Shipping' },
    { value: 'PICKUP', label: 'Pickup' },
]

const emptyForm = {
    reference: '',
    customerName: '',
    externalOrderId: '',
    materialCode: '',
    movementType: 'DELIVERY' as ShipmentMovementType,
    originAddress: '',
    originLat: null as number | null,
    originLng: null as number | null,
    destAddress: '',
    destLat: null as number | null,
    destLng: null as number | null,
    quantity: '',
    earliestDeliveryAt: '',
    latestDeliveryAt: '',
    status: 'READY' as ShipmentStatus,
    notes: '',
}

export default function ShipmentsPage() {
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
    } = useShipments()

    const [selected, setSelected] = useState<Shipment[]>([])
    const [createOpen, setCreateOpen] = useState(false)
    const [assignOpen, setAssignOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [form, setForm] = useState(emptyForm)

    const columns = useMemo<ColumnDef<Shipment>[]>(
        () => [
            {
                header: 'Reference',
                accessorKey: 'reference',
            },
            {
                header: 'Customer',
                cell: ({ row }) => row.original.customerName || '—',
            },
            {
                header: 'Type',
                cell: ({ row }) => (
                    <StatusBadge
                        tone={
                            row.original.movementType === 'PICKUP'
                                ? 'warning'
                                : 'info'
                        }
                    >
                        {formatMovementLabel(row.original.movementType)}
                    </StatusBadge>
                ),
            },
            {
                header: 'Ship-to / return',
                accessorKey: 'destAddress',
            },
            {
                header: 'Material',
                cell: ({ row }) => row.original.materialCode || '—',
            },
            {
                header: 'Ext. order',
                cell: ({ row }) => row.original.externalOrderId || '—',
            },
            {
                header: 'Quantity',
                cell: ({ row }) =>
                    (row.original.quantity ?? 0).toLocaleString(),
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
                header: 'Updated',
                cell: ({ row }) =>
                    new Date(row.original.updatedAt).toLocaleString(),
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) => (
                    <div className="flex items-center gap-1">
                        {row.original.status === 'READY' ? (
                            <Button
                                size="xs"
                                onClick={() => {
                                    setSelected([row.original])
                                    setAssignOpen(true)
                                }}
                            >
                                Assign
                            </Button>
                        ) : null}
                        <Button
                            size="xs"
                            variant="plain"
                            className="text-red-600"
                            onClick={() => {
                                const id = row.original.id
                                void remove(id).then(() => {
                                    setSelected((current) =>
                                        current.filter((item) => item.id !== id),
                                    )
                                })
                            }}
                        >
                            Delete
                        </Button>
                    </div>
                ),
            },
        ],
        [remove],
    )

    const onCreate = async () => {
        setSaving(true)
        setFormError(null)
        try {
            await create({
                reference: form.reference,
                customerName: form.customerName || null,
                externalOrderId: form.externalOrderId.trim() || null,
                materialCode: form.materialCode.trim() || null,
                movementType: form.movementType,
                originAddress: form.originAddress.trim() || null,
                originLat: form.originAddress.trim() ? form.originLat : null,
                originLng: form.originAddress.trim() ? form.originLng : null,
                destAddress: form.destAddress,
                destLat: form.destLat,
                destLng: form.destLng,
                quantity: Number(form.quantity),
                earliestDeliveryAt: form.earliestDeliveryAt || null,
                latestDeliveryAt: form.latestDeliveryAt || null,
                status: form.status,
                notes: form.notes || null,
            })
            setCreateOpen(false)
            setForm(emptyForm)
        } catch (err) {
            setFormError(getApiErrorMessage(err, 'Failed to create shipment'))
        } finally {
            setSaving(false)
        }
    }

    const selectedReady = selected.filter((item) => item.status === 'READY')

    return (
        <PageContainer>
            <PageHeader
                title="Shipments"
                description="Phase 2 warehouse release pool + Step 3 load building. Select READY orders → Assign load for capacity, stops, and plan approval."
                breadcrumbs={scmPageBreadcrumbs('Shipments')}
                actions={
                    <>
                        {selectedReady.length > 0 ? (
                            <Button onClick={() => setAssignOpen(true)}>
                                Load plan ({selectedReady.length})
                            </Button>
                        ) : null}
                        <Button
                            variant="solid"
                            onClick={() => {
                                setForm(emptyForm)
                                setFormError(null)
                                setCreateOpen(true)
                            }}
                        >
                            Warehouse release
                        </Button>
                    </>
                }
            />

            {error ? (
                <Alert showIcon type="danger" className="mb-4" title="API error">
                    {error}
                </Alert>
            ) : null}

            <Alert showIcon type="info" className="mb-4" title="Warehouse release stub">
                Manual create marks shipments READY (packed / ready to ship). A
                real MM → SCM listener will replace this hand-off later.
            </Alert>

            <AdaptiveCard className="mb-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <Input
                        className="md:max-w-xs"
                        placeholder="Search reference, customer, address…"
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
                                    option.value === (params.status ?? 'READY'),
                            ) ?? statusOptions[1]
                        }
                        onChange={(option) =>
                            setParams((current) => ({
                                ...current,
                                page: 1,
                                status: (option as Option | null)?.value || undefined,
                            }))
                        }
                    />
                    <Select
                        className="md:w-48"
                        options={movementFilterOptions}
                        value={
                            movementFilterOptions.find(
                                (option) =>
                                    option.value ===
                                    (params.movementType ?? ''),
                            ) ?? movementFilterOptions[0]
                        }
                        onChange={(option) =>
                            setParams((current) => ({
                                ...current,
                                page: 1,
                                movementType:
                                    (option as Option | null)?.value ||
                                    undefined,
                            }))
                        }
                    />
                </div>
            </AdaptiveCard>

            <AdaptiveCard>
                <DataTable
                    selectable
                    columns={columns}
                    data={data}
                    loading={loading}
                    pagingData={{
                        total,
                        pageIndex: page,
                        pageSize,
                    }}
                    checkboxChecked={(row) =>
                        selected.some((item) => item.id === row.id)
                    }
                    indeterminateCheckboxChecked={(rows) =>
                        rows.length > 0 &&
                        rows.every((row) =>
                            selected.some((item) => item.id === row.original.id),
                        )
                    }
                    onCheckBoxChange={(checked, row) => {
                        setSelected((current) =>
                            checked
                                ? current.some((item) => item.id === row.id)
                                    ? current
                                    : [...current, row]
                                : current.filter((item) => item.id !== row.id),
                        )
                    }}
                    onIndeterminateCheckBoxChange={(checked, rows) => {
                        const pageRows = rows.map((row) => row.original)
                        setSelected((current) => {
                            if (checked) {
                                const next = [...current]
                                for (const row of pageRows) {
                                    if (!next.some((item) => item.id === row.id)) {
                                        next.push(row)
                                    }
                                }
                                return next
                            }
                            const ids = new Set(pageRows.map((row) => row.id))
                            return current.filter((item) => !ids.has(item.id))
                        })
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
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                onRequestClose={() => setCreateOpen(false)}
                width={560}
            >
                <h5 className="mb-4">Warehouse release (READY)</h5>
                {formError ? (
                    <Alert showIcon type="danger" className="mb-4">
                        {formError}
                    </Alert>
                ) : null}
                <Form
                    onSubmit={(e) => {
                        e.preventDefault()
                        void onCreate()
                    }}
                >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <FormItem
                            label="Movement"
                            className="md:col-span-2"
                        >
                            <Radio.Group
                                value={form.movementType}
                                onChange={(value) =>
                                    setForm((f) => ({
                                        ...f,
                                        movementType:
                                            value as ShipmentMovementType,
                                    }))
                                }
                            >
                                <Radio value="DELIVERY">
                                    Shipping (deliver to customer)
                                </Radio>
                                <Radio value="PICKUP">
                                    Pickup (collect from customer)
                                </Radio>
                            </Radio.Group>
                        </FormItem>
                        <FormItem label="Reference">
                            <Input
                                value={form.reference}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        reference: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Customer">
                            <Input
                                value={form.customerName}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        customerName: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="External order ID">
                            <Input
                                value={form.externalOrderId}
                                placeholder="MM / WMS order ref (optional)"
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        externalOrderId: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Material code">
                            <Input
                                value={form.materialCode}
                                placeholder="SKU / material (optional)"
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        materialCode: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem
                            label={
                                form.movementType === 'PICKUP'
                                    ? 'Pickup from'
                                    : 'Origin (optional)'
                            }
                        >
                            <LocationSearchField
                                value={form.originAddress}
                                placeholder={
                                    form.movementType === 'PICKUP'
                                        ? 'Search pickup address…'
                                        : 'Search origin address (optional)…'
                                }
                                countryBias="Philippines"
                                onChange={(location) =>
                                    setForm((f) => ({
                                        ...f,
                                        originAddress: location.address,
                                        originLat: location.lat ?? null,
                                        originLng: location.lng ?? null,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem
                            label={
                                form.movementType === 'PICKUP'
                                    ? 'Return to / depot'
                                    : 'Ship-to'
                            }
                        >
                            <LocationSearchField
                                value={form.destAddress}
                                placeholder={
                                    form.movementType === 'PICKUP'
                                        ? 'Search return / depot address…'
                                        : 'Search ship-to address…'
                                }
                                countryBias="Philippines"
                                onChange={(location) =>
                                    setForm((f) => ({
                                        ...f,
                                        destAddress: location.address,
                                        destLat: location.lat ?? null,
                                        destLng: location.lng ?? null,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Quantity (items)">
                            <Input
                                value={form.quantity}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        quantity: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem
                            label={
                                form.movementType === 'PICKUP'
                                    ? 'Pickup window start'
                                    : 'Window start'
                            }
                        >
                            <Input
                                type="datetime-local"
                                value={form.earliestDeliveryAt}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        earliestDeliveryAt: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem
                            label={
                                form.movementType === 'PICKUP'
                                    ? 'Pickup window end'
                                    : 'Window end'
                            }
                        >
                            <Input
                                type="datetime-local"
                                value={form.latestDeliveryAt}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        latestDeliveryAt: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                    </div>
                    <FormItem label="Notes">
                        <Input
                            textArea
                            value={form.notes}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    notes: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <div className="mt-4 flex justify-end gap-2">
                        <Button
                            type="button"
                            onClick={() => setCreateOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button variant="solid" type="submit" loading={saving}>
                            Release as READY
                        </Button>
                    </div>
                </Form>
            </Dialog>

            <AssignLoadDrawer
                isOpen={assignOpen}
                preselected={selectedReady}
                onClose={() => setAssignOpen(false)}
                onAssigned={() => {
                    setSelected([])
                    void reload()
                }}
            />
        </PageContainer>
    )
}
