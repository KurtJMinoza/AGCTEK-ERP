'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Dialog from '@/components/ui/Dialog'
import Checkbox from '@/components/ui/Checkbox'
import Alert from '@/components/ui/Alert'
import Spinner from '@/components/ui/Spinner'
import { FormItem } from '@/components/ui/Form'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import {
    apiCancelVehicleDocument,
    apiCreateVehicleDocument,
    apiGetVehicleDocumentsByVehicle,
    apiUpdateVehicleDocument,
} from '../../services/scmApi'
import { getApiErrorMessage } from '../../utils/apiError'
import { formatStatusLabel, statusTone } from '../../utils/status'
import type { VehicleDocument, VehicleDocumentKind } from '../../types'

type Option = { value: string; label: string }

const kindFormOptions: Option[] = [
    { value: 'OR', label: 'OR (Official Receipt)' },
    { value: 'CR', label: 'CR (Certificate of Registration)' },
    { value: 'INSURANCE_CTPL', label: 'Insurance — CTPL' },
    { value: 'INSURANCE_COMPREHENSIVE', label: 'Insurance — Comprehensive' },
    { value: 'INSURANCE_OTHER', label: 'Insurance — Other' },
]

function defaultBlocks(kind: VehicleDocumentKind) {
    return kind === 'OR' || kind === 'CR' || kind === 'INSURANCE_CTPL'
}

function kindLabel(kind: string) {
    return (
        kindFormOptions.find((o) => o.value === kind)?.label ??
        formatStatusLabel(kind)
    )
}

function kindTitle(kind: VehicleDocumentKind) {
    switch (kind) {
        case 'OR':
            return 'OR'
        case 'CR':
            return 'CR'
        case 'INSURANCE_CTPL':
            return 'CTPL'
        case 'INSURANCE_COMPREHENSIVE':
            return 'Comprehensive'
        default:
            return 'Insurance'
    }
}

type DocForm = {
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

export function VehicleCompliancePanel({ vehicleId }: { vehicleId: string }) {
    const [docs, setDocs] = useState<VehicleDocument[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editing, setEditing] = useState<VehicleDocument | null>(null)
    const [form, setForm] = useState<DocForm>(emptyForm)
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const rows = await apiGetVehicleDocumentsByVehicle(vehicleId)
            setDocs(rows)
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Failed to load documents',
            )
            setDocs([])
        } finally {
            setLoading(false)
        }
    }, [vehicleId])

    useEffect(() => {
        void reload()
    }, [reload])

    const activeDocs = useMemo(
        () => docs.filter((d) => d.status !== 'CANCELLED'),
        [docs],
    )

    const summaryCards = useMemo(() => {
        const byKind = (kind: VehicleDocumentKind) =>
            activeDocs
                .filter((d) => d.kind === kind)
                .sort(
                    (a, b) =>
                        new Date(a.expiresAt).getTime() -
                        new Date(b.expiresAt).getTime(),
                )[0]

        const insurance = activeDocs
            .filter((d) => d.kind.startsWith('INSURANCE_'))
            .sort(
                (a, b) =>
                    new Date(a.expiresAt).getTime() -
                    new Date(b.expiresAt).getTime(),
            )[0]

        return [
            { key: 'OR', doc: byKind('OR'), label: 'OR' },
            { key: 'CR', doc: byKind('CR'), label: 'CR' },
            {
                key: 'INSURANCE',
                doc: insurance,
                label: insurance ? kindTitle(insurance.kind) : 'Insurance',
            },
        ]
    }, [activeDocs])

    const openCreate = () => {
        setEditing(null)
        setForm(emptyForm())
        setFormError(null)
        setDialogOpen(true)
    }

    const openEdit = (doc: VehicleDocument) => {
        setEditing(doc)
        setForm({
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

    const openRenew = (doc: VehicleDocument) => {
        setEditing(null)
        setForm({
            kind: doc.kind,
            documentNo: '',
            issuer: doc.issuer ?? '',
            issuedAt: new Date().toISOString().slice(0, 10),
            expiresAt: '',
            coverageNote: doc.coverageNote ?? '',
            fileUrl: '',
            remindDaysBefore: String(doc.remindDaysBefore),
            blocksVehicle: doc.blocksVehicle,
            notes: `Renewal of ${doc.documentNo}`,
        })
        setFormError(null)
        setDialogOpen(true)
    }

    const onSubmit = async () => {
        setSaving(true)
        setFormError(null)
        try {
            const payload = {
                vehicleId,
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
            if (!payload.documentNo) {
                setFormError('Document / policy number is required')
                return
            }
            if (!payload.expiresAt) {
                setFormError('Expiry date is required')
                return
            }
            if (editing) {
                await apiUpdateVehicleDocument(editing.id, payload)
            } else {
                await apiCreateVehicleDocument(payload)
            }
            setDialogOpen(false)
            setEditing(null)
            await reload()
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
                header: 'Kind',
                cell: ({ row }) => kindLabel(row.original.kind),
            },
            { header: 'No.', accessorKey: 'documentNo' },
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
                cell: ({ row }) =>
                    row.original.status === 'CANCELLED' ? null : (
                        <div className="flex flex-wrap justify-end gap-1">
                            <Button
                                size="xs"
                                onClick={() => openRenew(row.original)}
                            >
                                Renew
                            </Button>
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
                                            `Cancel ${kindLabel(row.original.kind)} ${row.original.documentNo}?`,
                                        )
                                    ) {
                                        void apiCancelVehicleDocument(
                                            row.original.id,
                                        ).then(() => reload())
                                    }
                                }}
                            >
                                Cancel
                            </Button>
                        </div>
                    ),
            },
        ],
        [reload],
    )

    if (loading && docs.length === 0) {
        return (
            <div className="flex justify-center py-6">
                <Spinner size={28} />
            </div>
        )
    }

    if (error && docs.length === 0) {
        return (
            <Alert showIcon type="danger" title="Compliance">
                {error}
            </Alert>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h6 className="text-sm font-semibold heading-text">
                        Registration & insurance
                    </h6>
                    <p className="text-xs text-gray-500">
                        PH LTO OR/CR and insurance. Expired + Blocks = routing
                        block; expiring soon = badge only.
                    </p>
                </div>
                <Button size="sm" variant="solid" onClick={openCreate}>
                    Add document
                </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {summaryCards.map((card) => (
                    <AdaptiveCard key={card.key}>
                        <p className="text-xs uppercase tracking-wide text-gray-500">
                            {card.label}
                        </p>
                        {card.doc ? (
                            <>
                                <p className="mt-1 truncate font-medium">
                                    {card.doc.documentNo}
                                </p>
                                <p className="mt-1 text-sm text-gray-500">
                                    Expires{' '}
                                    {new Date(
                                        card.doc.expiresAt,
                                    ).toLocaleDateString()}
                                </p>
                                <div className="mt-2">
                                    <StatusBadge
                                        tone={statusTone(card.doc.status)}
                                    >
                                        {formatStatusLabel(card.doc.status)}
                                    </StatusBadge>
                                </div>
                            </>
                        ) : (
                            <p className="mt-2 text-sm text-gray-500">
                                No active document
                            </p>
                        )}
                    </AdaptiveCard>
                ))}
            </div>

            <DataTable
                columns={columns}
                data={docs}
                loading={loading}
                noData={!loading && docs.length === 0}
                hidePagination
                pagingData={{
                    total: docs.length,
                    pageIndex: 1,
                    pageSize: Math.max(docs.length, 1),
                }}
            />

            <Dialog
                isOpen={dialogOpen}
                width={560}
                onClose={() => !saving && setDialogOpen(false)}
                onRequestClose={() => !saving && setDialogOpen(false)}
            >
                <h5 className="mb-1">
                    {editing ? 'Edit document' : 'Add / renew document'}
                </h5>
                <p className="mb-4 text-sm text-gray-500">
                    Renew creates a new document row (preferred). Edit updates
                    the current record.
                </p>

                {formError ? (
                    <Alert showIcon type="danger" className="mb-3">
                        {formError}
                    </Alert>
                ) : null}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <FormItem label="Kind">
                        <Select
                            options={kindFormOptions}
                            value={
                                kindFormOptions.find(
                                    (o) => o.value === form.kind,
                                ) ?? null
                            }
                            isDisabled={saving || Boolean(editing)}
                            onChange={(opt) => {
                                const kind = ((opt as Option | null)?.value ??
                                    'OR') as VehicleDocumentKind
                                setForm((f) => ({
                                    ...f,
                                    kind,
                                    blocksVehicle: defaultBlocks(kind),
                                }))
                            }}
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
                    <FormItem label="Issuer">
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
