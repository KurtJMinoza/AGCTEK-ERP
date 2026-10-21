'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
import Alert from '@/components/ui/Alert'
import { Form, FormItem } from '@/components/ui/Form'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import FormDialog from '@/components/shared/FormDialog'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import useResourceAccess from '@/utils/hooks/useResourceAccess'
import { useCarriers } from '../hooks/useCarriers'
import { scmPageBreadcrumbs } from '../utils/breadcrumbs'
import { getApiErrorMessage } from '../utils/apiError'
import type { Carrier } from '../types'

type Option = { value: string; label: string }

const activeFilterOptions: Option[] = [
    { value: '', label: 'All couriers' },
    { value: 'true', label: 'Active' },
    { value: 'false', label: 'Inactive' },
]

type CarrierForm = {
    code: string
    name: string
    trackingUrlTemplate: string
    notes: string
    isActive: boolean
    supportsCod: boolean
}

const emptyForm = (): CarrierForm => ({
    code: '',
    name: '',
    trackingUrlTemplate: '',
    notes: '',
    isActive: true,
    supportsCod: false,
})

export default function CouriersPage() {
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
        update,
        remove,
    } = useCarriers()
    const { canCreate, canUpdate, canDelete } = useResourceAccess('scm.couriers')

    const [dialogOpen, setDialogOpen] = useState(false)
    const [editing, setEditing] = useState<Carrier | null>(null)
    const [form, setForm] = useState<CarrierForm>(emptyForm)
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [actionError, setActionError] = useState<string | null>(null)

    const openCreate = () => {
        setEditing(null)
        setForm(emptyForm())
        setFormError(null)
        setDialogOpen(true)
    }

    const openEdit = (carrier: Carrier) => {
        setEditing(carrier)
        setForm({
            code: carrier.code,
            name: carrier.name,
            trackingUrlTemplate: carrier.trackingUrlTemplate ?? '',
            notes: carrier.notes ?? '',
            isActive: carrier.isActive,
            supportsCod: carrier.supportsCod,
        })
        setFormError(null)
        setDialogOpen(true)
    }

    const onSubmit = async () => {
        setSaving(true)
        setFormError(null)
        const body = {
            code: form.code.trim(),
            name: form.name.trim(),
            trackingUrlTemplate: form.trackingUrlTemplate.trim() || null,
            notes: form.notes.trim() || null,
            isActive: form.isActive,
            supportsCod: form.supportsCod,
        }
        try {
            if (editing) await update(editing.id, body)
            else await create(body)
            setDialogOpen(false)
            setEditing(null)
        } catch (err) {
            setFormError(
                getApiErrorMessage(
                    err,
                    editing ? 'Failed to update courier' : 'Failed to add courier',
                ),
            )
        } finally {
            setSaving(false)
        }
    }

    const runAction = async (fn: () => Promise<unknown>, fallback: string) => {
        setActionError(null)
        try {
            await fn()
        } catch (err) {
            setActionError(getApiErrorMessage(err, fallback))
        }
    }

    const columns = useMemo<ColumnDef<Carrier>[]>(
        () => [
            {
                header: 'Courier',
                cell: ({ row }) => (
                    <div>
                        <p className="font-medium">{row.original.name}</p>
                        <p className="text-xs text-gray-500">{row.original.code}</p>
                    </div>
                ),
            },
            {
                header: 'Integration',
                cell: ({ row }) => (
                    <StatusBadge
                        tone={row.original.integrationType === 'API' ? 'info' : 'default'}
                    >
                        {row.original.integrationType === 'API' ? 'API' : 'Manual'}
                    </StatusBadge>
                ),
            },
            {
                header: 'Tracking link',
                cell: ({ row }) =>
                    row.original.trackingUrlTemplate ? (
                        <span className="text-xs text-gray-500 break-all">
                            {row.original.trackingUrlTemplate}
                        </span>
                    ) : (
                        <span className="text-gray-400">—</span>
                    ),
            },
            {
                header: 'Consignments',
                cell: ({ row }) =>
                    (row.original._count?.consignments ?? 0).toLocaleString(),
            },
            {
                header: 'Active',
                cell: ({ row }) =>
                    canUpdate ? (
                        <Switcher
                            checked={row.original.isActive}
                            onChange={(checked) =>
                                void runAction(
                                    () => update(row.original.id, { isActive: checked }),
                                    'Failed to update courier',
                                )
                            }
                        />
                    ) : (
                        <StatusBadge tone={row.original.isActive ? 'success' : 'default'}>
                            {row.original.isActive ? 'Active' : 'Inactive'}
                        </StatusBadge>
                    ),
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) => (
                    <div className="flex items-center justify-end gap-1">
                        {canUpdate && (
                            <Button size="xs" onClick={() => openEdit(row.original)}>
                                Edit
                            </Button>
                        )}
                        {canDelete && !row.original._count?.consignments && (
                            <Button
                                size="xs"
                                variant="plain"
                                className="text-red-600"
                                onClick={() => {
                                    if (confirm(`Delete courier ${row.original.name}?`)) {
                                        void runAction(
                                            () => remove(row.original.id),
                                            'Failed to delete courier',
                                        )
                                    }
                                }}
                            >
                                Delete
                            </Button>
                        )}
                    </div>
                ),
            },
        ],
        [update, remove, canUpdate, canDelete],
    )

    return (
        <PageContainer>
            <PageHeader
                title="Couriers"
                description="Third-party couriers (3PL) used when a shipment does not go on our own trucks. Tracking numbers are entered by hand until a courier API is connected."
                breadcrumbs={scmPageBreadcrumbs('Couriers')}
                actions={
                    canCreate ? (
                        <Button variant="solid" onClick={openCreate}>
                            Add courier
                        </Button>
                    ) : undefined
                }
            />

            {error || actionError ? (
                <Alert showIcon type="danger" className="mb-4">
                    {actionError ?? error}
                </Alert>
            ) : null}

            <AdaptiveCard className="mb-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <Input
                        className="md:max-w-xs"
                        placeholder="Search name or code…"
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
                        options={activeFilterOptions}
                        value={
                            activeFilterOptions.find(
                                (option) =>
                                    option.value ===
                                    (params.isActive == null ? '' : String(params.isActive)),
                            ) ?? activeFilterOptions[0]
                        }
                        onChange={(option) => {
                            const value = (option as Option | null)?.value ?? ''
                            setParams((current) => ({
                                ...current,
                                page: 1,
                                isActive: value === '' ? undefined : value === 'true',
                            }))
                        }}
                    />
                </div>
            </AdaptiveCard>

            <AdaptiveCard>
                <DataTable
                    columns={columns}
                    data={data}
                    loading={loading}
                    noData={!loading && data.length === 0}
                    pagingData={{ total, pageIndex: page, pageSize }}
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

            <FormDialog
                isOpen={dialogOpen}
                onClose={() => setDialogOpen(false)}
                title={editing ? `Edit ${editing.name}` : 'Add courier'}
                confirmText={editing ? 'Save' : 'Add courier'}
                confirmLoading={saving}
                onSubmit={() => void onSubmit()}
            >
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
                        <FormItem label="Code">
                            <Input
                                value={form.code}
                                placeholder="e.g. JNT"
                                onChange={(e) =>
                                    setForm((f) => ({ ...f, code: e.target.value }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Name">
                            <Input
                                value={form.name}
                                placeholder="e.g. J&T Express"
                                onChange={(e) =>
                                    setForm((f) => ({ ...f, name: e.target.value }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Tracking link" className="md:col-span-2">
                            <Input
                                value={form.trackingUrlTemplate}
                                placeholder="https://courier.example/track/{tracking}"
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        trackingUrlTemplate: e.target.value,
                                    }))
                                }
                            />
                            <p className="mt-1 text-xs text-gray-500">
                                Optional. <code>{'{tracking}'}</code> is replaced
                                with the tracking number.
                            </p>
                        </FormItem>
                        <FormItem label="Notes" className="md:col-span-2">
                            <Input
                                textArea
                                rows={2}
                                value={form.notes}
                                onChange={(e) =>
                                    setForm((f) => ({ ...f, notes: e.target.value }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Active">
                            <Switcher
                                checked={form.isActive}
                                onChange={(checked) =>
                                    setForm((f) => ({ ...f, isActive: checked }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Can collect COD">
                            <Switcher
                                checked={form.supportsCod}
                                onChange={(checked) =>
                                    setForm((f) => ({ ...f, supportsCod: checked }))
                                }
                            />
                            <p className="mt-1 text-xs text-gray-500">
                                Cash on Delivery orders still ship with our own
                                fleet until courier COD remittance is available.
                            </p>
                        </FormItem>
                    </div>
                </Form>
            </FormDialog>
        </PageContainer>
    )
}
