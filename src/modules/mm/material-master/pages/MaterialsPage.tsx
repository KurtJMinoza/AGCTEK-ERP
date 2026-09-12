'use client'

import { useCallback, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import EllipsisButton from '@/components/shared/EllipsisButton'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Tag from '@/components/ui/Tag'
import Dropdown from '@/components/ui/Dropdown'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    HiOutlineArchive,
    HiOutlineCheckCircle,
    HiOutlineClipboardList,
    HiOutlineCube,
    HiOutlineExclamation,
    HiOutlinePencil,
    HiOutlinePlus,
    HiOutlineSearch,
    HiOutlineTrash,
    HiOutlineEye,
} from 'react-icons/hi'
import MaterialFormDialog from '../components/MaterialFormDialog'
import MaterialViewDialog from '../components/MaterialViewDialog'
import { useMaterials } from '../hooks/useMaterials'
import { useReferenceData } from '../hooks/useReferenceData'
import { materialService } from '../services/materialService'
import type { Material, MaterialStatus } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const MATERIALS_PATH = '/modules/mm/material-master/materials-skus'

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger'> = {
    ACTIVE: 'success',
    DRAFT: 'default',
    INACTIVE: 'warning',
    BLOCKED: 'danger',
}

type FilterOption = { value: string; label: string }

const STATUS_FILTER_OPTIONS: FilterOption[] = [
    { value: '', label: 'All statuses' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'ACTIVE', label: 'Active' },
    { value: 'INACTIVE', label: 'Inactive' },
    { value: 'BLOCKED', label: 'Blocked' },
]

const MaterialsPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(MATERIALS_PATH)

    const { materialTypes, materialCategories } = useReferenceData([
        'materialTypes',
        'materialCategories',
    ])

    const typeFilterOptions = useMemo<FilterOption[]>(
        () => [
            { value: '', label: 'All types' },
            ...materialTypes.map((t) => ({ value: t.id, label: t.name })),
        ],
        [materialTypes],
    )

    const categoryFilterOptions = useMemo<FilterOption[]>(
        () => [
            { value: '', label: 'All categories' },
            ...materialCategories.map((c) => ({ value: c.id, label: c.name })),
        ],
        [materialCategories],
    )

    const [search, setSearch] = useState('')
    const [typeFilter, setTypeFilter] = useState('')
    const [categoryFilter, setCategoryFilter] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)

    const queryParams = useMemo(
        () => ({
            page,
            limit: pageSize,
            search: search || undefined,
            materialTypeId: typeFilter || undefined,
            materialCategoryId: categoryFilter || undefined,
            status: statusFilter || undefined,
            sortBy: 'createdAt' as const,
            sortOrder: 'desc' as const,
        }),
        [page, pageSize, search, typeFilter, categoryFilter, statusFilter],
    )

    const { data: materials, meta, loading, refresh } = useMaterials(queryParams)

    const [formOpen, setFormOpen] = useState(false)
    const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
    const [editingMaterial, setEditingMaterial] = useState<Material | null>(null)
    const [viewMaterial, setViewMaterial] = useState<Material | null>(null)
    const [deleteMaterial, setDeleteMaterial] = useState<Material | null>(null)
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
    const [bulkDeleting, setBulkDeleting] = useState(false)

    const stats = useMemo(() => {
        const total = meta.total
        const active = materials.filter((m) => m.status === 'ACTIVE').length
        const tracked = materials.filter((m) => m.batchManaged || m.serialManaged).length
        const belowReorder = materials.filter(
            (m) => m.inventoryManaged && m.reorderPoint > 0 && Number(m.safetyStock) > Number(m.reorderPoint),
        ).length
        return { total, active, belowReorder, tracked }
    }, [materials, meta.total])

    const hasActiveFilters =
        search.trim().length > 0 || typeFilter !== '' || categoryFilter !== '' || statusFilter !== ''

    const clearFilters = useCallback(() => {
        setSearch('')
        setTypeFilter('')
        setCategoryFilter('')
        setStatusFilter('')
        setPage(1)
    }, [])

    const openCreate = useCallback(() => {
        setFormMode('create')
        setEditingMaterial(null)
        setFormOpen(true)
    }, [])

    const openEdit = useCallback((material: Material) => {
        setFormMode('edit')
        setEditingMaterial(material)
        setViewMaterial(null)
        setFormOpen(true)
    }, [])

    const closeForm = useCallback(() => {
        setFormOpen(false)
        setEditingMaterial(null)
    }, [])

    const handleFormSubmit = useCallback(
        async (values: any) => {
            try {
                if (formMode === 'create') {
                    const created = await materialService.create(values)
                    pushToast('success', 'Material created', `${created.materialCode} — ${created.materialName} was added.`)
                } else if (editingMaterial) {
                    const updated = await materialService.update(editingMaterial.id, values)
                    pushToast('success', 'Material updated', `${updated.materialCode} — ${updated.materialName} was saved.`)
                }
                closeForm()
                refresh()
            } catch (err: any) {
                const msg = err?.response?.data?.message || 'An error occurred'
                pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : msg)
            }
        },
        [formMode, editingMaterial, closeForm, refresh],
    )

    const handleDelete = useCallback(async () => {
        if (!deleteMaterial) return
        try {
            await materialService.remove(deleteMaterial.id)
            pushToast('danger', 'Material deleted', `${deleteMaterial.materialCode} — ${deleteMaterial.materialName} was removed.`)
            setDeleteMaterial(null)
            refresh()
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'Failed to delete'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : msg)
        }
    }, [deleteMaterial, refresh])

    const handleCheckBoxChange = useCallback((checked: boolean, row: Material) => {
        setSelectedRows((prev) => {
            const next = new Set(prev)
            if (checked) next.add(row.id)
            else next.delete(row.id)
            return next
        })
    }, [])

    const handleSelectAllChange = useCallback((checked: boolean, rows: { original: Material }[]) => {
        setSelectedRows((prev) => {
            const next = new Set(prev)
            for (const r of rows) {
                if (checked) next.add(r.original.id)
                else next.delete(r.original.id)
            }
            return next
        })
    }, [])

    const handleBulkDelete = useCallback(async () => {
        setBulkDeleting(true)
        try {
            const ids = Array.from(selectedRows)
            await Promise.all(ids.map((id) => materialService.remove(id)))
            pushToast('success', 'Bulk delete', `${ids.length} material(s) deleted.`)
            setSelectedRows(new Set())
            setBulkDeleteOpen(false)
            refresh()
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'Some deletions failed'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : msg)
        } finally {
            setBulkDeleting(false)
        }
    }, [selectedRows, refresh])

    const columns = useMemo<ColumnDef<Material>[]>(
        () => [
            {
                header: 'Code',
                accessorKey: 'materialCode',
                size: 120,
                cell: ({ row }) => {
                    const m = row.original
                    return (
                        <div className="min-w-0">
                            <div className="truncate font-mono text-xs font-semibold text-primary">{m.materialCode}</div>
                            {m.sku ? <div className="truncate text-[11px] text-gray-500 dark:text-gray-400">{m.sku}</div> : null}
                        </div>
                    )
                },
            },
            {
                header: 'Material',
                accessorKey: 'materialName',
                size: 200,
                cell: ({ row }) => {
                    const m = row.original
                    return (
                        <div className="min-w-0">
                            <button
                                type="button"
                                onClick={() => setViewMaterial(m)}
                                className="block w-full truncate text-left text-sm font-semibold text-gray-900 hover:text-primary hover:underline dark:text-gray-100"
                            >
                                {m.materialName}
                            </button>
                            {(m.brand || m.model) ? (
                                <div className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                                    {[m.brand, m.model].filter(Boolean).join(' · ')}
                                </div>
                            ) : null}
                        </div>
                    )
                },
            },
            {
                header: 'Type',
                accessorKey: 'materialTypeId',
                size: 110,
                cell: ({ row }) => (
                    <span className="block truncate text-sm">{row.original.materialType?.name ?? '—'}</span>
                ),
            },
            {
                header: 'Category',
                accessorKey: 'materialCategoryId',
                size: 110,
                cell: ({ row }) => (
                    <span className="block truncate text-sm">{row.original.materialCategory?.name ?? '—'}</span>
                ),
            },
            {
                header: 'UOM',
                accessorKey: 'baseUomId',
                size: 70,
                cell: ({ row }) => (
                    <span className="text-sm font-medium">{row.original.baseUom?.code ?? '—'}</span>
                ),
            },
            {
                header: 'Tracking',
                id: 'tracking',
                enableSorting: false,
                size: 100,
                cell: ({ row }) => {
                    const m = row.original
                    const flags = [
                        m.batchManaged ? 'Batch' : null,
                        m.serialManaged ? 'Serial' : null,
                        m.qualityInspectionRequired ? 'QC' : null,
                        m.expiryManaged ? 'Expiry' : null,
                    ].filter(Boolean) as string[]
                    if (flags.length === 0) return <span className="text-xs text-gray-400">—</span>
                    return (
                        <div className="flex flex-wrap gap-0.5">
                            {flags.map((label) => (
                                <Tag key={label} className="text-[10px] leading-tight">{label}</Tag>
                            ))}
                        </div>
                    )
                },
            },
            {
                header: 'Planning',
                id: 'planning',
                enableSorting: false,
                size: 130,
                cell: ({ row }) => {
                    const m = row.original
                    if (!m.inventoryManaged) {
                        return <span className="text-xs text-gray-500">Non-stock</span>
                    }
                    return (
                        <div className="min-w-0 text-xs leading-snug text-gray-600 dark:text-gray-300">
                            <div className="truncate">
                                <span className="text-gray-400">ROP</span> {Number(m.reorderPoint).toLocaleString()}
                                <span className="mx-1 text-gray-300">·</span>
                                <span className="text-gray-400">Safe</span> {Number(m.safetyStock).toLocaleString()}
                            </div>
                            <div className="truncate">
                                <span className="text-gray-400">Min/Max</span> {Number(m.minimumStock).toLocaleString()}–{Number(m.maximumStock).toLocaleString()}
                                {Number(m.leadTimeDays) > 0 ? (
                                    <>
                                        <span className="mx-1 text-gray-300">·</span>
                                        {Number(m.leadTimeDays)}d
                                    </>
                                ) : null}
                            </div>
                        </div>
                    )
                },
            },
            {
                header: 'Cost',
                accessorKey: 'standardCost',
                size: 110,
                cell: ({ row }) => {
                    const m = row.original
                    const currencyCode = m.currency?.code || 'USD'
                    const formatter = new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: currencyCode,
                        maximumFractionDigits: 2,
                    })
                    return (
                        <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{formatter.format(Number(m.standardCost))}</div>
                            <div className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                                {(m.valuationMethod || '—').replace(/_/g, ' ')}
                            </div>
                        </div>
                    )
                },
            },
            {
                header: 'Status',
                accessorKey: 'status',
                size: 95,
                cell: ({ row }) => (
                    <StatusBadge tone={STATUS_TONE[row.original.status] ?? 'default'}>
                        {row.original.status}
                    </StatusBadge>
                ),
            },
            {
                id: 'actions',
                header: '',
                enableSorting: false,
                size: 48,
                cell: ({ row }) => (
                    <Dropdown renderTitle={<EllipsisButton />} placement="bottom-end">
                        <Dropdown.Item eventKey="view" onClick={() => setViewMaterial(row.original)}>
                            <HiOutlineEye className="text-base" />
                            <span>View</span>
                        </Dropdown.Item>
                        <Dropdown.Item eventKey="edit" onClick={() => openEdit(row.original)}>
                            <HiOutlinePencil className="text-base" />
                            <span>Edit</span>
                        </Dropdown.Item>
                        <Dropdown.Item eventKey="delete" onClick={() => setDeleteMaterial(row.original)}>
                            <HiOutlineTrash className="text-base text-red-500" />
                            <span className="text-red-500">Delete</span>
                        </Dropdown.Item>
                    </Dropdown>
                ),
            },
        ],
        [openEdit],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Materials / SKUs"
                description="Master data for all materials — codes, UOMs, tracking rules, reorder points, and valuation."
                actions={
                    <Button variant="solid" size="sm" icon={<HiOutlinePlus />} onClick={openCreate}>New material</Button>
                }
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Total materials" value={stats.total} icon={<HiOutlineCube className="text-lg" />} />
                <StatCard label="Active" value={stats.active} tone="success" icon={<HiOutlineCheckCircle className="text-lg" />} />
                <StatCard label="Batch / serial tracked" value={stats.tracked} tone="info" icon={<HiOutlineClipboardList className="text-lg" />} />
                <StatCard label="Reorder attention" value={stats.belowReorder} tone="warning" icon={<HiOutlineExclamation className="text-lg" />} />
            </div>

            <AdaptiveCard className="mt-6">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <Input
                        prefix={<HiOutlineSearch className="text-lg" />}
                        placeholder="Search code, name, SKU…"
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                    />
                    <Select<FilterOption>
                        placeholder="Type"
                        options={typeFilterOptions}
                        value={typeFilterOptions.find((o) => o.value === typeFilter)}
                        onChange={(opt) => { setTypeFilter(opt?.value ?? ''); setPage(1) }}
                    />
                    <Select<FilterOption>
                        placeholder="Category"
                        options={categoryFilterOptions}
                        value={categoryFilterOptions.find((o) => o.value === categoryFilter)}
                        onChange={(opt) => { setCategoryFilter(opt?.value ?? ''); setPage(1) }}
                    />
                    <Select<FilterOption>
                        placeholder="Status"
                        options={STATUS_FILTER_OPTIONS}
                        value={STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter)}
                        onChange={(opt) => { setStatusFilter(opt?.value ?? ''); setPage(1) }}
                    />
                </div>

                {selectedRows.size > 0 && (
                    <div className="mt-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 dark:border-red-500/30 dark:bg-red-500/10">
                        <span className="text-sm font-medium text-red-700 dark:text-red-300">
                            {selectedRows.size} item{selectedRows.size > 1 ? 's' : ''} selected
                        </span>
                        <div className="ml-auto flex items-center gap-2">
                            <Button size="xs" onClick={() => setSelectedRows(new Set())}>Clear selection</Button>
                            <Button size="xs" variant="solid" customColorClass={() => 'bg-red-500 hover:bg-red-600 text-white'} icon={<HiOutlineTrash />} onClick={() => setBulkDeleteOpen(true)}>
                                Delete selected
                            </Button>
                        </div>
                    </div>
                )}

                <div className="mt-4">
                    <DataTable<Material>
                        columns={columns}
                        data={materials}
                        compact
                        fit
                        loading={loading}
                        selectable
                        checkboxChecked={(row) => selectedRows.has(row.id)}
                        onCheckBoxChange={handleCheckBoxChange}
                        onIndeterminateCheckBoxChange={(checked, rows) => handleSelectAllChange(checked, rows as any)}
                        noData={!loading && materials.length === 0}
                        customNoDataIcon={
                            <EmptyState
                                hasFilters={hasActiveFilters}
                                totalMaterials={meta.total}
                                onCreate={openCreate}
                                onClearFilters={clearFilters}
                            />
                        }
                        pagingData={{ total: meta.total, pageIndex: page, pageSize }}
                        onPaginationChange={setPage}
                        onSelectChange={(size) => { setPageSize(size); setPage(1) }}
                    />
                </div>
            </AdaptiveCard>

            <MaterialFormDialog
                isOpen={formOpen}
                mode={formMode}
                material={editingMaterial}
                onClose={closeForm}
                onSubmit={handleFormSubmit}
            />

            <MaterialViewDialog
                isOpen={Boolean(viewMaterial)}
                material={viewMaterial}
                onClose={() => setViewMaterial(null)}
                onEdit={openEdit}
            />

            <ConfirmDialog
                isOpen={Boolean(deleteMaterial)}
                type="danger"
                title="Delete material?"
                confirmText="Delete"
                onRequestClose={() => setDeleteMaterial(null)}
                onCancel={() => setDeleteMaterial(null)}
                onConfirm={handleDelete}
                confirmButtonProps={{
                    customColorClass: () => 'bg-red-500 hover:bg-red-500/90 text-white',
                }}
            >
                <p>
                    Are you sure you want to delete{' '}
                    <span className="font-semibold">{deleteMaterial?.materialCode} — {deleteMaterial?.materialName}</span>?
                    This action cannot be undone.
                </p>
            </ConfirmDialog>

            <ConfirmDialog
                isOpen={bulkDeleteOpen}
                type="danger"
                title={`Delete ${selectedRows.size} material${selectedRows.size > 1 ? 's' : ''}?`}
                confirmText={`Delete ${selectedRows.size}`}
                onRequestClose={() => setBulkDeleteOpen(false)}
                onCancel={() => setBulkDeleteOpen(false)}
                onConfirm={handleBulkDelete}
                confirmButtonProps={{
                    loading: bulkDeleting,
                    customColorClass: () => 'bg-red-500 hover:bg-red-500/90 text-white',
                }}
            >
                <p>
                    Are you sure you want to delete <span className="font-semibold">{selectedRows.size}</span> selected material{selectedRows.size > 1 ? 's' : ''}?
                    This action cannot be undone.
                </p>
            </ConfirmDialog>
        </PageContainer>
    )
}

function pushToast(type: 'success' | 'danger' | 'warning' | 'info', title: string, message: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>{message}</Notification>,
        { placement: 'top-end' },
    )
}

type StatCardProps = { label: string; value: number; icon: React.ReactNode; tone?: 'default' | 'success' | 'info' | 'warning' }

const toneClasses: Record<NonNullable<StatCardProps['tone']>, { icon: string; text: string }> = {
    default: { icon: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300', text: 'text-gray-900 dark:text-gray-100' },
    success: { icon: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300', text: 'text-gray-900 dark:text-gray-100' },
    info: { icon: 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300', text: 'text-gray-900 dark:text-gray-100' },
    warning: { icon: 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300', text: 'text-gray-900 dark:text-gray-100' },
}

const StatCard = ({ label, value, icon, tone = 'default' }: StatCardProps) => (
    <AdaptiveCard>
        <div className="flex items-start justify-between gap-3">
            <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
                <p className={`mt-1 text-2xl font-bold ${toneClasses[tone].text}`}>{value.toLocaleString()}</p>
            </div>
            <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneClasses[tone].icon}`}>{icon}</span>
        </div>
    </AdaptiveCard>
)

type EmptyStateProps = { hasFilters: boolean; totalMaterials: number; onCreate: () => void; onClearFilters: () => void }

const EmptyState = ({ hasFilters, totalMaterials, onCreate, onClearFilters }: EmptyStateProps) => {
    const filteredEmpty = hasFilters && totalMaterials > 0
    return (
        <div className="flex w-full flex-col items-center gap-3 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-subtle text-primary-deep">
                <HiOutlineArchive className="text-2xl" />
            </span>
            <div>
                <p className="text-base font-semibold heading-text">
                    {filteredEmpty ? 'No materials match your filters' : 'No materials in the master yet'}
                </p>
                <p className="mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
                    {filteredEmpty
                        ? 'Try adjusting your search or filter selection to see more results.'
                        : 'Create your first material record to start managing SKUs, UOMs, barcodes, tracking rules, and reorder thresholds.'}
                </p>
            </div>
            <div className="mt-1 flex items-center gap-2">
                {filteredEmpty ? <Button size="sm" onClick={onClearFilters}>Clear filters</Button> : null}
                <Button size="sm" variant="solid" icon={<HiOutlinePlus />} onClick={onCreate}>New material</Button>
            </div>
        </div>
    )
}

export default MaterialsPage
