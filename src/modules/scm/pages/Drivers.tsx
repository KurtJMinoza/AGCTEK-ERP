'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Dialog from '@/components/ui/Dialog'
import Alert from '@/components/ui/Alert'
import { Form, FormItem } from '@/components/ui/Form'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import { useDrivers } from '../hooks/useDrivers'
import {
    apiGetAuthProfile,
} from '../services/scmApi'
import { scmPageBreadcrumbs } from '../utils/breadcrumbs'
import { getApiErrorMessage } from '../utils/apiError'
import { formatStatusLabel, statusTone } from '../utils/status'
import type { Driver, DriverStatus } from '../types'

type Option = { value: string; label: string }

const statusFilterOptions: Option[] = [
    { value: '', label: 'All statuses' },
    { value: 'AVAILABLE', label: 'Available' },
    { value: 'ON_TRIP', label: 'On trip' },
    { value: 'OFF_DUTY', label: 'Off duty' },
    { value: 'INACTIVE', label: 'Inactive' },
]

const statusFormOptions: Option[] = statusFilterOptions.filter(
    (option) => option.value !== '',
)

type DriverForm = {
    userName: string
    firstName: string
    lastName: string
    employeeCode: string
    licenseNumber: string
    licenseExpiry: string
    phone: string
    status: DriverStatus
}

const emptyForm = (): DriverForm => ({
    userName: '',
    firstName: '',
    lastName: '',
    employeeCode: '',
    licenseNumber: '',
    licenseExpiry: '',
    phone: '',
    status: 'AVAILABLE',
})

function toDateInput(value: string | null | undefined) {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    return d.toISOString().slice(0, 10)
}

function driverDisplayName(driver: Driver) {
    const name = `${driver.firstName} ${driver.lastName}`.trim()
    return name || driver.user?.userName || '—'
}

export default function DriversPage() {
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
    } = useDrivers()

    const [dialogOpen, setDialogOpen] = useState(false)
    const [editing, setEditing] = useState<Driver | null>(null)
    const [form, setForm] = useState<DriverForm>(emptyForm)
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)

    const openCreate = () => {
        setEditing(null)
        setForm(emptyForm())
        setFormError(null)
        setDialogOpen(true)
    }

    const openEdit = (driver: Driver) => {
        setEditing(driver)
        setForm({
            userName: driver.user?.userName ?? '',
            firstName: driver.firstName,
            lastName: driver.lastName,
            employeeCode: driver.employeeCode ?? '',
            licenseNumber: driver.licenseNumber,
            licenseExpiry: toDateInput(driver.licenseExpiry),
            phone: driver.phone,
            status: driver.status,
        })
        setFormError(null)
        setDialogOpen(true)
    }

    const onSubmit = async () => {
        setSaving(true)
        setFormError(null)
        try {
            if (editing) {
                await update(editing.id, {
                    firstName: form.firstName.trim(),
                    lastName: form.lastName.trim(),
                    employeeCode: form.employeeCode.trim() || null,
                    licenseNumber: form.licenseNumber.trim(),
                    licenseExpiry: form.licenseExpiry,
                    phone: form.phone.trim(),
                    status: form.status,
                })
            } else {
                const profile = await apiGetAuthProfile(form.userName.trim())
                await create({
                    userId: profile.id,
                    firstName: form.firstName.trim(),
                    lastName: form.lastName.trim(),
                    employeeCode: form.employeeCode.trim() || null,
                    licenseNumber: form.licenseNumber.trim(),
                    licenseExpiry: form.licenseExpiry,
                    phone: form.phone.trim(),
                    status: form.status,
                })
            }
            setDialogOpen(false)
            setEditing(null)
            setForm(emptyForm())
        } catch (err) {
            setFormError(
                getApiErrorMessage(
                    err,
                    editing ? 'Failed to update driver' : 'Failed to create driver',
                ),
            )
        } finally {
            setSaving(false)
        }
    }

    const columns = useMemo<ColumnDef<Driver>[]>(
        () => [
            {
                header: 'Name',
                cell: ({ row }) => (
                    <div>
                        <p className="font-medium">{driverDisplayName(row.original)}</p>
                        {row.original.employeeCode ? (
                            <p className="text-xs text-gray-500">
                                {row.original.employeeCode}
                            </p>
                        ) : null}
                    </div>
                ),
            },
            {
                header: 'User',
                cell: ({ row }) => (
                    <div className="text-sm">
                        <p>{row.original.user?.userName ?? '—'}</p>
                        <p className="text-xs text-gray-500">
                            {row.original.user?.email ?? '—'}
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
                header: 'License',
                cell: ({ row }) => (
                    <div className="text-sm">
                        <p>{row.original.licenseNumber}</p>
                        <p className="text-xs text-gray-500">
                            Exp{' '}
                            {row.original.licenseExpiry
                                ? new Date(
                                      row.original.licenseExpiry,
                                  ).toLocaleDateString()
                                : '—'}
                        </p>
                    </div>
                ),
            },
            {
                header: 'Phone',
                cell: ({ row }) => row.original.phone || '—',
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) => (
                    <div className="flex items-center justify-end gap-1">
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
                                        `Delete driver ${driverDisplayName(row.original)}?`,
                                    )
                                ) {
                                    void remove(row.original.id)
                                }
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

    return (
        <PageContainer>
            <PageHeader
                title="Drivers"
                description="Driver master data linked to ERP users. Used for trip assign and the mobile driver app."
                breadcrumbs={scmPageBreadcrumbs('Drivers')}
                actions={
                    <Button variant="solid" onClick={openCreate}>
                        Add driver
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
                        placeholder="Search name, license, user, phone…"
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
                                (option) =>
                                    option.value === (params.status ?? ''),
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
                {!loading && data.length === 0 && !error ? (
                    <p className="px-4 pb-4 text-center text-sm text-gray-500">
                        No drivers yet. Seed with{' '}
                        <code>npm run prisma:seed</code> in backend, or add one
                        linked to an ERP username.
                    </p>
                ) : null}
            </AdaptiveCard>

            <Dialog
                isOpen={dialogOpen}
                onClose={() => setDialogOpen(false)}
                onRequestClose={() => setDialogOpen(false)}
                width={560}
            >
                <h5 className="mb-4">
                    {editing ? 'Edit driver' : 'Add driver'}
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
                        <FormItem
                            label="ERP username"
                            className="md:col-span-2"
                        >
                            <Input
                                value={form.userName}
                                disabled={Boolean(editing)}
                                placeholder="e.g. driver01"
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        userName: e.target.value,
                                    }))
                                }
                            />
                            {!editing ? (
                                <p className="mt-1 text-xs text-gray-500">
                                    Must match an existing User (
                                    <code>GET /auth/profile</code>).
                                </p>
                            ) : null}
                        </FormItem>
                        <FormItem label="First name">
                            <Input
                                value={form.firstName}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        firstName: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Last name">
                            <Input
                                value={form.lastName}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        lastName: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Employee code">
                            <Input
                                value={form.employeeCode}
                                placeholder="Optional"
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        employeeCode: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Status">
                            <Select
                                options={statusFormOptions}
                                value={
                                    statusFormOptions.find(
                                        (option) =>
                                            option.value === form.status,
                                    ) ?? statusFormOptions[0]
                                }
                                onChange={(option) =>
                                    setForm((f) => ({
                                        ...f,
                                        status: ((option as Option | null)
                                            ?.value ||
                                            'AVAILABLE') as DriverStatus,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="License number">
                            <Input
                                value={form.licenseNumber}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        licenseNumber: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="License expiry">
                            <Input
                                type="date"
                                value={form.licenseExpiry}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        licenseExpiry: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Phone" className="md:col-span-2">
                            <Input
                                value={form.phone}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        phone: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                    </div>
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
