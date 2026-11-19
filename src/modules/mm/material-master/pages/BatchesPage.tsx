'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import { type ColumnDef } from '@/components/shared/DataTable'
import MaterialMasterResponsiveTable from '../components/MaterialMasterResponsiveTable'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import FormDialog from '@/components/shared/FormDialog'
import EllipsisButton from '@/components/shared/EllipsisButton'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Dropdown from '@/components/ui/Dropdown'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import {
    HiOutlineBeaker,
    HiOutlineCheckCircle,
    HiOutlineClipboardList,
    HiOutlineExclamation,
    HiOutlinePencil,
    HiOutlinePlus,
    HiOutlineSearch,
    HiOutlineShieldExclamation,
    HiOutlineTrash,
} from 'react-icons/hi'
import { batchService } from '../services/referenceService'
import type { MmBatch } from '../types'
import {
    materialMasterFeatureDescription,
    materialMasterParentBreadcrumbs,
} from '../utils/materialMasterPageUi'
import { useBatchAccess } from '../hooks/useBatchAccess'
import { required, visibleError, type FieldErrors } from '@/modules/mm/shared/formValidation'
import { useMaterialOptions, useSupplierOptions } from '@/modules/mm/shared/useEntityOptions'
import TrackingNumberInput from '@/modules/mm/shared/TrackingNumberInput'
import { formatTrackingNumber } from '@/modules/mm/shared/trackingNumberFormat'
import {
    RcvAnimatedStatus,
    RcvDateCell,
    RcvMaterialCell,
    RcvPartyCell,
} from '@/modules/mm/receiving/components/receivingTableUi'
import { BatchTrackingCodeCell, MM_BATCH_STATUS_TONE } from '../components/batchesTableUi'

const ROUTE = '/modules/mm/material-master/batches'
const MATERIAL_DETAIL = '/modules/mm/material-master/materials-skus'

const STATUS_OPTS = [
    { value: '', label: 'All statuses' },
    { value: 'AVAILABLE', label: 'Available' },
    { value: 'QUARANTINE', label: 'Quarantine' },
    { value: 'EXPIRED', label: 'Expired' },
    { value: 'CLOSED', label: 'Closed' },
]

type FilterOption = { value: string; label: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

function batchMatchesSearch(row: MmBatch, q: string): boolean {
    const needle = q.trim().toLowerCase()
    if (!needle) return true
    const parts = [
        row.batchNumber,
        row.lotNumber,
        row.material?.materialCode,
        row.material?.materialName,
        row.supplier?.supplierCode,
        row.supplier?.supplierName,
        row.status,
    ]
    return parts.some((p) => p && String(p).toLowerCase().includes(needle))
}

type StatCardProps = {
    label: string
    value: number
    icon: ReactNode
    tone?: 'default' | 'success' | 'info' | 'warning'
}

const toneClasses: Record<NonNullable<StatCardProps['tone']>, { icon: string; text: string }> = {
    default: {
        icon: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
        text: 'text-gray-900 dark:text-gray-100',
    },
    success: {
        icon: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300',
        text: 'text-gray-900 dark:text-gray-100',
    },
    info: {
        icon: 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300',
        text: 'text-gray-900 dark:text-gray-100',
    },
    warning: {
        icon: 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300',
        text: 'text-gray-900 dark:text-gray-100',
    },
}

const StatCard = ({ label, value, icon, tone = 'default' }: StatCardProps) => (
    <AdaptiveCard>
        <div className="flex items-start justify-between gap-3">
            <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
                <p className={`mt-1 text-2xl font-bold ${toneClasses[tone].text}`}>
                    {value.toLocaleString()}
                </p>
            </div>
            <span
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneClasses[tone].icon}`}
            >
                {icon}
            </span>
        </div>
    </AdaptiveCard>
)

const BatchesPage = () => {
    const router = useRouter()
    const parentBreadcrumbs = useMemo(() => materialMasterParentBreadcrumbs(ROUTE), [])
    const { canCreate, canUpdate, canDelete } = useBatchAccess()
    const [items, setItems] = useState<MmBatch[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [formOpen, setFormOpen] = useState(false)
    const [formMode, setFormMode] = useState<'add' | 'edit'>('add')
    const [editing, setEditing] = useState<MmBatch | null>(null)
    const [deleting, setDeleting] = useState<MmBatch | null>(null)
    const [materialId, setMaterialId] = useState('')
    const [manufacturingDate, setManufacturingDate] = useState('')
    const [expiryDate, setExpiryDate] = useState('')
    const [supplierId, setSupplierId] = useState('')
    const [status, setStatus] = useState('AVAILABLE')
    const [batchNumber, setBatchNumber] = useState('')
    const [lotNumber, setLotNumber] = useState('')
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
    const [bulkDeleting, setBulkDeleting] = useState(false)
    const [touched, setTouched] = useState<Record<string, boolean>>({})
    const [forceValidate, setForceValidate] = useState(false)
    const [tableVersion, setTableVersion] = useState(0)

    const { options: materialOpts } = useMaterialOptions({
        enabled: formOpen && formMode === 'add',
    })
    const { options: supplierOpts } = useSupplierOptions({ enabled: formOpen })

    const fieldErrors = useMemo<FieldErrors>(
        () => ({
            materialId: required(materialId, 'Material'),
        }),
        [materialId],
    )
    const err = (key: string) => visibleError(fieldErrors, touched, key, forceValidate)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            setItems((await batchService.list()) as MmBatch[])
            setTableVersion((v) => v + 1)
        } catch {
            /* ignore */
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void load()
    }, [load])

    const stats = useMemo(() => {
        const now = Date.now()
        const in30d = now + 30 * 24 * 60 * 60 * 1000
        return {
            total: items.length,
            available: items.filter((b) => b.status === 'AVAILABLE').length,
            quarantine: items.filter((b) => b.status === 'QUARANTINE').length,
            expiringSoon: items.filter((b) => {
                if (!b.expiryDate) return false
                const t = new Date(b.expiryDate).getTime()
                return Number.isFinite(t) && t >= now && t <= in30d
            }).length,
        }
    }, [items])

    const filteredItems = useMemo(() => {
        return items.filter((row) => {
            if (statusFilter && row.status !== statusFilter) return false
            return batchMatchesSearch(row, search)
        })
    }, [items, search, statusFilter])

    const resetForm = () => {
        setMaterialId('')
        setManufacturingDate('')
        setExpiryDate('')
        setSupplierId('')
        setStatus('AVAILABLE')
        setBatchNumber('')
        setLotNumber('')
        setTouched({})
        setForceValidate(false)
    }

    const openAdd = () => {
        resetForm()
        setFormMode('add')
        setEditing(null)
        setFormOpen(true)
    }

    const openEdit = useCallback((row: MmBatch) => {
        resetForm()
        setFormMode('edit')
        setEditing(row)
        setMaterialId(row.materialId)
        setBatchNumber(row.batchNumber ?? '')
        setLotNumber(row.lotNumber ?? '')
        setSupplierId(row.supplierId ?? '')
        setManufacturingDate(
            row.manufacturingDate ? String(row.manufacturingDate).slice(0, 10) : '',
        )
        setExpiryDate(row.expiryDate ? String(row.expiryDate).slice(0, 10) : '')
        setStatus(row.status ?? 'AVAILABLE')
        setFormOpen(true)
    }, [])

    const goToMaterial = useCallback(
        (materialId: string) => {
            router.push(`${MATERIAL_DETAIL}/${materialId}`)
        },
        [router],
    )

    const handleSave = async () => {
        setForceValidate(true)
        if (formMode === 'add' && fieldErrors.materialId) {
            pushToast('danger', 'Validation', 'Select a material.')
            return
        }
        if (
            formMode === 'add' &&
            !batchNumber.trim() &&
            !lotNumber.trim() &&
            !supplierId
        ) {
            pushToast(
                'danger',
                'Validation',
                'Enter a batch or lot number, or choose a supplier for auto-generation.',
            )
            return
        }
        if (formMode === 'edit' && !editing) return

        try {
            if (formMode === 'add') {
                const created = await batchService.create({
                    materialId,
                    ...(batchNumber.trim()
                        ? { batchNumber: formatTrackingNumber(batchNumber) }
                        : {}),
                    ...(lotNumber.trim()
                        ? { lotNumber: formatTrackingNumber(lotNumber) }
                        : {}),
                    manufacturingDate: manufacturingDate || undefined,
                    expiryDate: expiryDate || undefined,
                    supplierId: supplierId || undefined,
                    status,
                })
                pushToast('success', 'Created', `Batch ${created.batchNumber} created.`)
            } else if (editing) {
                await batchService.update(editing.id, {
                    ...(batchNumber.trim()
                        ? { batchNumber: formatTrackingNumber(batchNumber) }
                        : {}),
                    lotNumber: lotNumber.trim()
                        ? formatTrackingNumber(lotNumber)
                        : null,
                    manufacturingDate: manufacturingDate || null,
                    expiryDate: expiryDate || null,
                    supplierId: supplierId || null,
                    status,
                })
                pushToast(
                    'success',
                    'Updated',
                    `Batch ${batchNumber || editing.batchNumber} saved.`,
                )
            }
            setFormOpen(false)
            resetForm()
            setEditing(null)
            void load()
        } catch (e: unknown) {
            const err = e as { response?: { data?: { message?: string } }; message?: string }
            pushToast(
                'danger',
                'Error',
                err?.response?.data?.message || err?.message || 'Failed to save batch',
            )
        }
    }

    const handleDelete = async () => {
        if (!deleting) return
        try {
            await batchService.remove(deleting.id)
            pushToast('success', 'Deleted', 'Batch removed.')
            setDeleting(null)
            void load()
        } catch {
            pushToast('danger', 'Error', 'Delete failed')
        }
    }

    const handleCheckBoxChange = useCallback((checked: boolean, row: MmBatch) => {
        setSelectedRows((prev) => {
            const next = new Set(prev)
            if (checked) next.add(row.id)
            else next.delete(row.id)
            return next
        })
    }, [])

    const handleSelectAllChange = useCallback(
        (checked: boolean, rows: { original: MmBatch }[]) => {
            setSelectedRows((prev) => {
                const next = new Set(prev)
                for (const r of rows) {
                    if (checked) next.add(r.original.id)
                    else next.delete(r.original.id)
                }
                return next
            })
        },
        [],
    )

    const handleBulkDelete = useCallback(async () => {
        setBulkDeleting(true)
        try {
            await Promise.all(Array.from(selectedRows).map((id) => batchService.remove(id)))
            pushToast('success', 'Bulk delete', `${selectedRows.size} batch(es) deleted.`)
            setSelectedRows(new Set())
            setBulkDeleteOpen(false)
            void load()
        } catch {
            pushToast('danger', 'Error', 'Some deletions failed')
        } finally {
            setBulkDeleting(false)
        }
    }, [selectedRows, load])

    const columns = useMemo<ColumnDef<MmBatch>[]>(
        () => [
            {
                header: 'Material',
                id: 'material',
                size: 240,
                cell: ({ row }) => {
                    const m = row.original.material
                    if (!m) {
                        return <span className="text-sm text-gray-400">—</span>
                    }
                    return (
                        <button
                            type="button"
                            onClick={() => goToMaterial(row.original.materialId)}
                            className="w-full min-w-0 text-left transition-opacity hover:opacity-90"
                        >
                            <RcvMaterialCell code={m.materialCode} name={m.materialName} />
                        </button>
                    )
                },
            },
            {
                header: 'Batch #',
                id: 'batchNumber',
                size: 150,
                cell: ({ row }) => (
                    <BatchTrackingCodeCell value={row.original.batchNumber} variant="batch" />
                ),
            },
            {
                header: 'Lot #',
                id: 'lotNumber',
                size: 140,
                cell: ({ row }) => (
                    <BatchTrackingCodeCell value={row.original.lotNumber} variant="lot" />
                ),
            },
            {
                header: 'Supplier',
                id: 'supplier',
                size: 200,
                cell: ({ row }) => {
                    const s = row.original.supplier
                    return (
                        <RcvPartyCell
                            kind="supplier"
                            name={s?.supplierName ?? s?.supplierCode}
                            subtitle={s?.supplierName ? s.supplierCode : undefined}
                        />
                    )
                },
            },
            {
                header: 'Status',
                accessorKey: 'status',
                size: 120,
                cell: ({ row }) => {
                    const st = row.original.status ?? 'AVAILABLE'
                    return (
                        <RcvAnimatedStatus
                            status={st}
                            tone={MM_BATCH_STATUS_TONE[st] ?? 'default'}
                        />
                    )
                },
            },
            {
                header: 'Mfg date',
                accessorKey: 'manufacturingDate',
                size: 115,
                cell: ({ row }) => <RcvDateCell iso={row.original.manufacturingDate} />,
            },
            {
                header: 'Expiry',
                accessorKey: 'expiryDate',
                size: 115,
                cell: ({ row }) => <RcvDateCell iso={row.original.expiryDate} />,
            },
            {
                id: 'actions',
                header: '',
                size: 56,
                enableSorting: false,
                cell: ({ row }) => (
                    <Dropdown renderTitle={<EllipsisButton />} placement="bottom-end">
                        {canUpdate && (
                            <Dropdown.Item eventKey="edit" onClick={() => openEdit(row.original)}>
                                <HiOutlinePencil className="text-base" />
                                <span>Edit</span>
                            </Dropdown.Item>
                        )}
                        {canDelete && (
                            <Dropdown.Item
                                eventKey="delete"
                                onClick={() => setDeleting(row.original)}
                            >
                                <HiOutlineTrash className="text-base text-red-500" />
                                <span className="text-red-500">Delete</span>
                            </Dropdown.Item>
                        )}
                    </Dropdown>
                ),
            },
        ],
        [canDelete, canUpdate, goToMaterial, openEdit],
    )

    const batchesMobile = useMemo(
        () => ({
            title: (b: MmBatch) => b.batchNumber || b.lotNumber || 'Batch',
            subtitle: (b: MmBatch) => {
                const m = b.material
                return m ? `${m.materialCode} · ${m.materialName}` : undefined
            },
            status: (b: MmBatch) => {
                const st = b.status ?? 'AVAILABLE'
                return { text: st, tone: MM_BATCH_STATUS_TONE[st] ?? 'default' }
            },
            onPress: canUpdate ? (b: MmBatch) => openEdit(b) : undefined,
            fields: [
                {
                    label: 'Lot #',
                    value: (b: MmBatch) => b.lotNumber || '—',
                },
                {
                    label: 'Supplier',
                    value: (b: MmBatch) =>
                        b.supplier?.supplierName ?? b.supplier?.supplierCode ?? '—',
                },
                {
                    label: 'Mfg',
                    value: (b: MmBatch) => <RcvDateCell iso={b.manufacturingDate} />,
                },
                {
                    label: 'Expiry',
                    value: (b: MmBatch) => <RcvDateCell iso={b.expiryDate} />,
                },
            ],
        }),
        [canUpdate, openEdit],
    )

    const hasFilters = Boolean(search.trim() || statusFilter)

    return (
        <PageContainer>
            <PageHeader
                breadcrumbs={parentBreadcrumbs}
                title="Batches"
                description={`${materialMasterFeatureDescription('Batches')} You can also add batches from a material’s detail page → Batches tab.`}
                actions={
                    canCreate ? (
                        <Button
                            variant="solid"
                            size="sm"
                            icon={<HiOutlinePlus />}
                            onClick={openAdd}
                        >
                            Add batch
                        </Button>
                    ) : undefined
                }
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    label="Total batches"
                    value={stats.total}
                    icon={<HiOutlineClipboardList className="text-lg" />}
                />
                <StatCard
                    label="Available"
                    value={stats.available}
                    tone="success"
                    icon={<HiOutlineCheckCircle className="text-lg" />}
                />
                <StatCard
                    label="Quarantine"
                    value={stats.quarantine}
                    tone="warning"
                    icon={<HiOutlineShieldExclamation className="text-lg" />}
                />
                <StatCard
                    label="Expiring in 30 days"
                    value={stats.expiringSoon}
                    tone="info"
                    icon={<HiOutlineExclamation className="text-lg" />}
                />
            </div>

            <AdaptiveCard className="mt-6">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Input
                        prefix={<HiOutlineSearch className="text-lg" />}
                        placeholder="Search material, batch, lot, supplier…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <Select<FilterOption>
                        placeholder="Status"
                        options={STATUS_OPTS}
                        value={STATUS_OPTS.find((o) => o.value === statusFilter)}
                        onChange={(opt) => setStatusFilter(opt?.value ?? '')}
                    />
                </div>

                {canDelete && selectedRows.size > 0 && (
                    <div className="mt-4 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 dark:border-red-500/30 dark:bg-red-500/10 sm:flex-row sm:items-center">
                        <span className="text-sm font-medium text-red-700 dark:text-red-300">
                            {selectedRows.size} item{selectedRows.size > 1 ? 's' : ''} selected
                        </span>
                        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                            <Button size="xs" onClick={() => setSelectedRows(new Set())}>
                                Clear
                            </Button>
                            <Button
                                size="xs"
                                variant="solid"
                                customColorClass={() => 'bg-red-500 hover:bg-red-600 text-white'}
                                icon={<HiOutlineTrash />}
                                onClick={() => setBulkDeleteOpen(true)}
                            >
                                Delete selected
                            </Button>
                        </div>
                    </div>
                )}

                <div className="mt-4">
                    <div key={tableVersion}>
                        <MaterialMasterResponsiveTable<MmBatch>
                            columns={columns}
                            data={filteredItems}
                            compact
                            loading={loading}
                            hidePagination
                            tableMinWidthClass="min-w-[960px]"
                            getRowId={(row) => row.id}
                            selectable={canDelete}
                            checkboxChecked={(row) => selectedRows.has(row.id)}
                            onCheckBoxChange={handleCheckBoxChange}
                            onIndeterminateCheckBoxChange={(checked, rows) =>
                                handleSelectAllChange(checked, rows as { original: MmBatch }[])
                            }
                            mobile={batchesMobile}
                            noData={filteredItems.length === 0}
                            customNoDataIcon={
                                <div className="flex w-full flex-col items-center gap-3 py-10 text-center">
                                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-subtle text-primary-deep">
                                        <HiOutlineBeaker className="text-2xl" />
                                    </span>
                                    <div>
                                        <p className="text-base font-semibold heading-text">
                                            {hasFilters
                                                ? 'No batches match your filters'
                                                : 'No batches registered yet'}
                                        </p>
                                        <p className="mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
                                            {hasFilters
                                                ? 'Try clearing search or status filters.'
                                                : 'Add a batch here or from a material’s Batches tab after enabling batch tracking.'}
                                        </p>
                                    </div>
                                    {hasFilters ? (
                                        <Button
                                            size="sm"
                                            onClick={() => {
                                                setSearch('')
                                                setStatusFilter('')
                                            }}
                                        >
                                            Clear filters
                                        </Button>
                                    ) : canCreate ? (
                                        <Button
                                            size="sm"
                                            variant="solid"
                                            icon={<HiOutlinePlus />}
                                            onClick={openAdd}
                                        >
                                            Add batch
                                        </Button>
                                    ) : null}
                                </div>
                            }
                        />
                    </div>
                </div>
            </AdaptiveCard>

            <FormDialog
                isOpen={formOpen}
                onClose={() => {
                    setFormOpen(false)
                    setEditing(null)
                }}
                size="md"
                title={formMode === 'edit' ? 'Edit batch / lot' : 'Add batch / lot'}
                description={
                    formMode === 'edit'
                        ? 'Update batch number, lot, supplier, dates, or status. Material cannot be changed.'
                        : 'Batch tracking turns on for the material when you save. Enter batch and/or lot numbers, or leave batch blank to auto-generate from the supplier.'
                }
                icon={formMode === 'edit' ? <HiOutlinePencil /> : <HiOutlinePlus />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setFormOpen(false)}>
                            Cancel
                        </Button>
                        <Button size="sm" variant="solid" onClick={() => void handleSave()}>
                            {formMode === 'edit' ? 'Save' : 'Add'}
                        </Button>
                    </>
                }
            >
                {formMode === 'edit' && editing?.material ? (
                    <FormItem label="Material">
                        <p className="text-sm font-medium heading-text">
                            {editing.material.materialCode} — {editing.material.materialName}
                        </p>
                    </FormItem>
                ) : (
                    <FormItem
                        label="Material"
                        asterisk
                        invalid={Boolean(err('materialId'))}
                        errorMessage={err('materialId')}
                    >
                        <Select
                            isSearchable
                            placeholder="Search material…"
                            options={materialOpts}
                            value={materialOpts.find((o) => o.value === materialId) ?? null}
                            onChange={(opt: { value?: string } | null) => {
                                setMaterialId(opt?.value ?? '')
                                setTouched((t) => ({ ...t, materialId: true }))
                            }}
                        />
                    </FormItem>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <FormItem label="Batch number">
                        <TrackingNumberInput
                            value={batchNumber}
                            placeholder="Optional — auto if blank"
                            onChange={setBatchNumber}
                        />
                    </FormItem>
                    <FormItem label="Lot number">
                        <TrackingNumberInput
                            value={lotNumber}
                            placeholder="Optional"
                            onChange={setLotNumber}
                        />
                    </FormItem>
                </div>
                <FormItem label="Supplier">
                    <Select
                        isSearchable
                        placeholder="Search supplier…"
                        options={supplierOpts}
                        value={supplierOpts.find((o) => o.value === supplierId) ?? null}
                        onChange={(opt: { value?: string } | null) => {
                            setSupplierId(opt?.value ?? '')
                            setTouched((t) => ({ ...t, supplierId: true }))
                        }}
                    />
                </FormItem>
                <p className="mb-3 text-xs text-gray-500">
                    If batch is blank, the system generates one (supplier code + sequence, e.g.
                    SUP-0001).
                </p>
                <FormItem label="Manufacture date">
                    <Input
                        type="date"
                        value={manufacturingDate}
                        onChange={(e) => setManufacturingDate(e.target.value)}
                    />
                </FormItem>
                <FormItem label="Expiry date">
                    <Input
                        type="date"
                        value={expiryDate}
                        onChange={(e) => setExpiryDate(e.target.value)}
                    />
                </FormItem>
                <FormItem label="Status">
                    <Select
                        options={STATUS_OPTS.filter((o) => o.value !== '')}
                        value={STATUS_OPTS.find((o) => o.value === status)}
                        onChange={(opt: { value?: string } | null) =>
                            setStatus(opt?.value ?? 'AVAILABLE')
                        }
                    />
                </FormItem>
            </FormDialog>

            <ConfirmDialog
                isOpen={Boolean(deleting)}
                type="danger"
                title="Delete batch?"
                confirmText="Delete"
                onRequestClose={() => setDeleting(null)}
                onCancel={() => setDeleting(null)}
                onConfirm={() => void handleDelete()}
            >
                <p>Are you sure?</p>
            </ConfirmDialog>
            <ConfirmDialog
                isOpen={bulkDeleteOpen}
                type="danger"
                title={`Delete ${selectedRows.size} batch(es)?`}
                confirmText={`Delete ${selectedRows.size}`}
                onRequestClose={() => setBulkDeleteOpen(false)}
                onCancel={() => setBulkDeleteOpen(false)}
                onConfirm={() => void handleBulkDelete()}
                confirmButtonProps={{
                    loading: bulkDeleting,
                    customColorClass: () => 'bg-red-500 hover:bg-red-500/90 text-white',
                }}
            >
                <p>
                    Are you sure you want to delete{' '}
                    <span className="font-semibold">{selectedRows.size}</span> selected batch
                    {selectedRows.size > 1 ? 'es' : ''}?
                </p>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default BatchesPage