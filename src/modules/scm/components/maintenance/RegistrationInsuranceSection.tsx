'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Dialog from '@/components/ui/Dialog'
import Checkbox from '@/components/ui/Checkbox'
import Alert from '@/components/ui/Alert'
import { FormItem } from '@/components/ui/Form'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import { useVehicleDocuments } from '../../hooks/useVehicleDocuments'
import { apiGetVehicles } from '../../services/scmApi'
import { getApiErrorMessage } from '../../utils/apiError'
import { formatStatusLabel, statusTone } from '../../utils/status'
import type {
    Vehicle,
    VehicleDocument,
    VehicleDocumentKind,
    VehicleDocumentStatus,
} from '../../types'

type Option = { value: string; label: string }

const kindOptions: Option[] = [
    { value: '', label: 'All kinds' },
    { value: 'OR', label: 'OR (Official Receipt)' },
    { value: 'CR', label: 'CR (Certificate of Registration)' },
    { value: 'INSURANCE_CTPL', label: 'Insurance — CTPL' },
    { value: 'INSURANCE_COMPREHENSIVE', label: 'Insurance — Comprehensive' },
    { value: 'INSURANCE_OTHER', label: 'Insurance — Other' },
]

const statusFilterOptions: Option[] = [
    { value: '', label: 'All statuses' },
    { value: 'VALID', label: 'Valid' },
    { value: 'EXPIRING_SOON', label: 'Expiring soon' },
    { value: 'EXPIRED', label: 'Expired' },
    { value: 'CANCELLED', label: 'Cancelled' },
]

const kindFormOptions = kindOptions.filter((o) => o.value !== '')

function defaultBlocks(kind: VehicleDocumentKind) {
    return kind === 'OR' || kind === 'CR' || kind === 'INSURANCE_CTPL'
}

type DocForm = {
    vehicleId: string
    kind: VehicleDocumentKind
    documentNo: string
    issuer: string
    issuedAt: string
    expiresAt: string
    coverageNote: string
    fileUrl: string
    remindDaysBefore: string
    blocksVehicle: boolean
    notes: string
}

const emptyForm = (): DocForm => ({
    vehicleId: '',
    kind: 'OR',
    documentNo: '',
    issuer: '',
    issuedAt: '',
    expiresAt: '',
    coverageNote: '',
    fileUrl: '',
    remindDaysBefore: '30',
    blocksVehicle: true,
    notes: '',
})

function kindLabel(kind: string) {
    return (
        kindFormOptions.find((o) => o.value === kind)?.label ??
        formatStatusLabel(kind)
    )
}

export default function RegistrationInsuranceSection() {
    const {
        data,
        total,
        page,
        pageSize,
        loading,
        error,
        params,
        setParams,
        summary,
        create,
        update,
        cancel,
    } = useVehicleDocuments()

    const [vehicles, setVehicles] = useState<Vehicle[]>([])
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editing, setEditing] = useState<VehicleDocument | null>(null)
    const [form, setForm] = useState<DocForm>(emptyForm)
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)

    useEffect(() => {
        void apiGetVehicles({ page: 1, pageSize: 100 })
            .then((result) => setVehicles(result.data))
            .catch(() => setVehicles([]))
    }, [])

    const vehicleOptions: Option[] = useMemo(
        () =>
            vehicles.map((v) => ({
                value: v.id,
                label: `${v.plateNumber} · ${v.code}`,
            })),
        [vehicles],
    )

    const openCreate = () => {
        setEditing(null)
        setForm({
            ...emptyForm(),
            vehicleId: vehicles[0]?.id ?? '',
        })
        setFormError(null)
        setDialogOpen(true)
    }

    const openEdit = (doc: VehicleDocument) => {
        setEditing(doc)
        setForm({
            vehicleId: doc.vehicleId,
            kind: doc.kind,
            documentNo: doc.documentNo,
            issuer: doc.issuer ?? '',
            issuedAt: doc.issuedAt
                ? new Date(doc.issuedAt).toISOString().slice(0, 10)
                : '',
            expiresAt: doc.expiresAt
                ? new Date(doc.expiresAt).toISOString().slice(0, 10)
                : '',
            coverageNote: doc.coverageNote ?? '',
            fileUrl: doc.fileUrl ?? '',
            remindDaysBefore: String(doc.remindDaysBefore),
            blocksVehicle: doc.blocksVehicle,
            notes: doc.notes ?? '',
        })
        setFormError(null)
        setDialogOpen(true)
    }

    const onKindChange = (kind: VehicleDocumentKind) => {
        setForm((prev) => ({
            ...prev,
            kind,
            blocksVehicle: editing ? prev.blocksVehicle : defaultBlocks(kind),
        }))
    }

    const onSubmit = async () => {
        setSaving(true)
        setFormError(null)
        try {
            const payload = {
                vehicleId: form.vehicleId,
                kind: form.kind,
                documentNo: form.documentNo.trim(),
                issuer: form.issuer.trim() || null,
                issuedAt: form.issuedAt
                    ? new Date(form.issuedAt).toISOString()
                    : null,
                expiresAt: form.expiresAt
                    ? new Date(form.expiresAt).toISOString()
                    : '',
                coverageNote: form.coverageNote.trim() || null,
                fileUrl: form.fileUrl.trim() || null,
                remindDaysBefore: Number(form.remindDaysBefore || 30),
                blocksVehicle: form.blocksVehicle,
                notes: form.notes.trim() || null,
            }
            if (!payload.expiresAt) {
                setFormError('Expiry date is required')
                return
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
                        ? 'Failed to update document'
                        : 'Failed to create document',
                ),
            )
        } finally {
            setSaving(false)
        }
    }

    const columns = useMemo<ColumnDef<VehicleDocument>[]>(
        () => [
            {
                header: 'Plate',
                cell: ({ row }) => (
                    <div>
                        <p className="font-medium">
                            {row.original.vehicle?.plateNumber ?? '—'}
                        </p>
                        <p className="text-xs text-gray-500">
                            {row.original.vehicle?.code ??
                                row.original.vehicleId}
                        </p>
                    </div>
                ),
            },
            {
                header: 'Kind',
                cell: ({ row }) => kindLabel(row.original.kind),
            },
            {
                header: 'Document no.',
                accessorKey: 'documentNo',
            },
            {
                header: 'Issuer',
                cell: ({ row }) => row.original.issuer ?? '—',
            },
            {
                header: 'Issued',
                cell: ({ row }) =>
                    row.original.issuedAt
                        ? new Date(row.original.issuedAt).toLocaleDateString()
                        : '—',
            },
            {
                header: 'Expires',
                cell: ({ row }) =>
                    new Date(row.original.expiresAt).toLocaleDateString(),
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
                header: 'Blocks',
                cell: ({ row }) =>
                    row.original.blocksVehicle ? (
                        <StatusBadge tone="warning">Yes</StatusBadge>
                    ) : (
                        'No'
                    ),
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) => (
                    <div className="flex flex-wrap justify-end gap-1">
                        <Button size="xs" onClick={() => openEdit(row.original)}>
                            Edit
                        </Button>
                        {row.original.status !== 'CANCELLED' ? (
                            <Button
                                size="xs"
                                variant="plain"
                                className="text-red-600"
                                onClick={() => {
                                    if (
                                        confirm(
                                            `Cancel ${kindLabel(row.original.kind)} ${row.original.documentNo}?`,
                                        )
                                    ) {
                                        void cancel(row.original.id)
                                    }
                                }}
                            >
                                Cancel
                            </Button>
                        ) : null}
                    </div>
                ),
            },
        ],
        [cancel],
    )

    return (
        <div className="space-y-4">
            {summary ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <AdaptiveCard>
                        <p className="text-xs text-gray-500">Expired</p>
                        <p className="text-2xl font-semibold text-red-600">
                            {summary.expired}
                        </p>
                    </AdaptiveCard>
                    <AdaptiveCard>
                        <p className="text-xs text-gray-500">Expiring soon</p>
                        <p className="text-2xl font-semibold text-amber-600">
                            {summary.expiring}
                        </p>
                    </AdaptiveCard>
                    <AdaptiveCard>
                        <p className="text-xs text-gray-500">Valid</p>
                        <p className="text-2xl font-semibold text-emerald-600">
                            {summary.valid}
                        </p>
                    </AdaptiveCard>
                    <AdaptiveCard>
                        <p className="text-xs text-gray-500">Cancelled</p>
                        <p className="text-2xl font-semibold">{summary.cancelled}</p>
                    </AdaptiveCard>
                </div>
            ) : null}

            <AdaptiveCard>
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div className="flex flex-wrap gap-3">
                        <FormItem label="Kind" className="mb-0 min-w-[200px]">
                            <Select
                                options={kindOptions}
                                value={
                                    kindOptions.find(
                                        (o) => o.value === (params.kind ?? ''),
                                    ) ?? kindOptions[0]
                                }
                                onChange={(opt) =>
                                    setParams((p) => ({
                                        ...p,
                                        page: 1,
                                        kind: (opt as Option | null)?.value || undefined,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Status" className="mb-0 min-w-[180px]">
                            <Select
                                options={statusFilterOptions}
                                value={
                                    statusFilterOptions.find(
                                        (o) =>
                                            o.value === (params.status ?? ''),
                                    ) ?? statusFilterOptions[0]
                                }
                                onChange={(opt) =>
                                    setParams((p) => ({
                                        ...p,
                                        page: 1,
                                        status:
                                            ((opt as Option | null)?.value as
                                                | VehicleDocumentStatus
                                                | '') || undefined,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Search" className="mb-0 min-w-[200px]">
                            <Input
                                placeholder="Plate, OR/CR/policy no…"
                                value={params.search ?? ''}
                                onChange={(e) =>
                                    setParams((p) => ({
                                        ...p,
                                        page: 1,
                                        search: e.target.value || undefined,
                                    }))
                                }
                            />
                        </FormItem>
                    </div>
                    <Button variant="solid" onClick={openCreate}>
                        Add document
                    </Button>
                </div>

                {error ? (
                    <Alert showIcon type="danger" className="mb-4" title="API error">
                        {error}
                    </Alert>
                ) : null}

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
                        setParams((p) => ({ ...p, page: nextPage }))
                    }
                    onSelectChange={(nextSize) =>
                        setParams((p) => ({
                            ...p,
                            page: 1,
                            pageSize: nextSize,
                        }))
                    }
                />
            </AdaptiveCard>

            <Dialog
                isOpen={dialogOpen}
                width={640}
                onClose={() => !saving && setDialogOpen(false)}
                onRequestClose={() => !saving && setDialogOpen(false)}
            >
                <h5 className="mb-1">
                    {editing ? 'Edit document' : 'Add registration / insurance'}
                </h5>
                <p className="mb-4 text-sm text-gray-500">
                    PH LTO OR/CR and insurance expiry. Expired + Blocks = routing
                    block (same as open PM). Expiring soon = badge only.
                </p>

                {formError ? (
                    <Alert showIcon type="danger" className="mb-3">
                        {formError}
                    </Alert>
                ) : null}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <FormItem label="Vehicle">
                        <Select
                            options={vehicleOptions}
                            value={
                                vehicleOptions.find(
                                    (o) => o.value === form.vehicleId,
                                ) ?? null
                            }
                            isDisabled={Boolean(editing) || saving}
                            onChange={(opt) =>
                                setForm((f) => ({
                                    ...f,
                                    vehicleId:
                                        (opt as Option | null)?.value ?? '',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Kind">
                        <Select
                            options={kindFormOptions}
                            value={
                                kindFormOptions.find(
                                    (o) => o.value === form.kind,
                                ) ?? null
                            }
                            isDisabled={saving}
                            onChange={(opt) =>
                                onKindChange(
                                    ((opt as Option | null)?.value ??
                                        'OR') as VehicleDocumentKind,
                                )
                            }
                        />
                    </FormItem>
                    <FormItem label="Document / policy no.">
                        <Input
                            value={form.documentNo}
                            disabled={saving}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    documentNo: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Issuer (LTO / insurer)">
                        <Input
                            value={form.issuer}
                            disabled={saving}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    issuer: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Issued">
                        <Input
                            type="date"
                            value={form.issuedAt}
                            disabled={saving}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    issuedAt: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Expires">
                        <Input
                            type="date"
                            value={form.expiresAt}
                            disabled={saving}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    expiresAt: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Remind days before">
                        <Input
                            type="number"
                            min={0}
                            value={form.remindDaysBefore}
                            disabled={saving}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    remindDaysBefore: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="File URL (optional)">
                        <Input
                            value={form.fileUrl}
                            disabled={saving}
                            placeholder="https://…"
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    fileUrl: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Coverage note" className="sm:col-span-2">
                        <Input
                            value={form.coverageNote}
                            disabled={saving}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    coverageNote: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Notes" className="sm:col-span-2">
                        <Input
                            textArea
                            value={form.notes}
                            disabled={saving}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    notes: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <div className="sm:col-span-2">
                        <Checkbox
                            checked={form.blocksVehicle}
                            disabled={saving}
                            onChange={(checked) =>
                                setForm((f) => ({
                                    ...f,
                                    blocksVehicle: Boolean(checked),
                                }))
                            }
                        >
                            Block routing when expired
                        </Checkbox>
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-2">
                    <Button
                        disabled={saving}
                        onClick={() => setDialogOpen(false)}
                    >
                        Close
                    </Button>
                    <Button
                        variant="solid"
                        loading={saving}
                        onClick={() => void onSubmit()}
                    >
                        {editing ? 'Save' : 'Create'}
                    </Button>
                </div>
            </Dialog>
        </div>
    )
}
