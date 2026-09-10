'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import FormDialog from '@/components/shared/FormDialog'
import EllipsisButton from '@/components/shared/EllipsisButton'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Dropdown from '@/components/ui/Dropdown'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Tag from '@/components/ui/Tag'
import { FormItem } from '@/components/ui/Form'
import {
    HiOutlineOfficeBuilding,
    HiOutlineCheckCircle,
    HiOutlineExclamation,
    HiOutlinePencil,
    HiOutlinePlus,
    HiOutlineSearch,
    HiOutlineTrash,
    HiOutlineEye,
} from 'react-icons/hi'
import { warehouseService } from '../services/warehouseService'
import { useWarehouses } from '../hooks/useWarehouses'
import { orgService } from '../../material-master/services/referenceService'
import type { Warehouse, CreateWarehousePayload } from '../types'
import type { MmCompany } from '../../material-master/types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    firstError,
    hasErrors,
    minLength,
    required,
    visibleError,
    type FieldErrors,
} from '@/modules/mm/shared/formValidation'

const ROUTE = '/modules/mm/warehouse-management/warehouses'

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger'> = {
    ACTIVE: 'success',
    INACTIVE: 'warning',
    BLOCKED: 'danger',
}

type FilterOption = { value: string; label: string }

const STATUS_FILTER_OPTIONS: FilterOption[] = [
    { value: '', label: 'All statuses' },
    { value: 'ACTIVE', label: 'Active' },
    { value: 'INACTIVE', label: 'Inactive' },
]

const WAREHOUSE_TYPE_OPTIONS: FilterOption[] = [
    { value: '', label: 'All types' },
    { value: 'GENERAL', label: 'General' },
    { value: 'DISTRIBUTION', label: 'Distribution' },
    { value: 'RECEIVING', label: 'Receiving' },
    { value: 'FULFILLMENT', label: 'Fulfillment' },
    { value: 'COLD_STORAGE', label: 'Cold Storage' },
    { value: 'RAW_MATERIAL', label: 'Raw Material' },
    { value: 'FINISHED_GOODS', label: 'Finished Goods' },
]

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(<Notification type={type} title={title} closable duration={3500}>{msg}</Notification>, { placement: 'top-end' })
}

const WarehousesPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)

    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)

    const queryParams = useMemo(
        () => ({
            page,
            limit: pageSize,
            search: search || undefined,
            status: statusFilter || undefined,
            sortBy: 'createdAt' as const,
            sortOrder: 'desc' as const,
        }),
        [page, pageSize, search, statusFilter],
    )

    const { data: warehouses, meta, loading, refresh } = useWarehouses(queryParams)

    const [formOpen, setFormOpen] = useState(false)
    const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
    const [editing, setEditing] = useState<Warehouse | null>(null)
    const [viewing, setViewing] = useState<Warehouse | null>(null)
    const [deleting, setDeleting] = useState<Warehouse | null>(null)
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
    const [bulkDeleting, setBulkDeleting] = useState(false)

    const [formData, setFormData] = useState<Partial<CreateWarehousePayload>>({})
    const [companies, setCompanies] = useState<MmCompany[]>([])
    const [plants, setPlants] = useState<{ id: string; code: string; name: string; companyId: string }[]>([])
    const [branches, setBranches] = useState<{ id: string; code: string; name: string; companyId: string; plantId?: string }[]>([])
    const [touched, setTouched] = useState<Record<string, boolean>>({})
    const [forceValidate, setForceValidate] = useState(false)

    const companyOptions = useMemo<FilterOption[]>(
        () => companies.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
        [companies],
    )

    const plantOptions = useMemo<FilterOption[]>(
        () =>
            plants
                .filter((p) => !formData.companyId || p.companyId === formData.companyId)
                .map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })),
        [plants, formData.companyId],
    )

    const branchOptions = useMemo<FilterOption[]>(
        () =>
            branches
                .filter((b) => {
                    if (formData.companyId && b.companyId !== formData.companyId) return false
                    if (formData.plantId && b.plantId && b.plantId !== formData.plantId) return false
                    return true
                })
                .map((b) => ({ value: b.id, label: `${b.code} — ${b.name}` })),
        [branches, formData.companyId, formData.plantId],
    )

    const fieldErrors = useMemo<FieldErrors>(() => ({
        name: firstError(required(formData.name, 'Name'), minLength(formData.name, 2, 'Name')),
        companyId: required(formData.companyId, 'Company'),
    }), [formData.name, formData.companyId])

    const err = (key: string) => visibleError(fieldErrors, touched, key, forceValidate)

    const setField = <K extends keyof CreateWarehousePayload>(key: K, value: CreateWarehousePayload[K]) => {
        setFormData((prev) => ({ ...prev, [key]: value }))
        setTouched((t) => ({ ...t, [key]: true }))
    }

    useEffect(() => {
        orgService.companies().then((list) => setCompanies(Array.isArray(list) ? list : [])).catch(() => {})
        orgService.plants().then((list) => setPlants(Array.isArray(list) ? list : [])).catch(() => {})
        orgService.branches().then((list) => setBranches(Array.isArray(list) ? list : [])).catch(() => {})
    }, [])

    const stats = useMemo(() => {
        const total = meta.total
        const active = warehouses.filter((w) => w.status === 'ACTIVE').length
        const inactive = warehouses.filter((w) => w.status === 'INACTIVE').length
        return { total, active, inactive }
    }, [warehouses, meta.total])

    const openCreate = useCallback(() => {
        setFormMode('create')
        setEditing(null)
        setFormData({
            timezone: 'UTC',
            status: 'ACTIVE',
            warehouseType: 'GENERAL',
            companyId: companies[0]?.id,
        })
        setTouched({})
        setForceValidate(false)
        setFormOpen(true)
    }, [companies])

    const openEdit = useCallback((wh: Warehouse) => {
        setFormMode('edit')
        setEditing(wh)
        setFormData({
            name: wh.name,
            companyId: wh.companyId,
            plantId: wh.plantId || '',
            branchId: wh.branchId || '',
            managerId: wh.managerId || '',
            warehouseType: wh.warehouseType || 'GENERAL',
            address: wh.address || '',
            timezone: wh.timezone || 'UTC',
            defaultReceivingArea: wh.defaultReceivingArea || '',
            defaultShippingArea: wh.defaultShippingArea || '',
        })
        setTouched({})
        setForceValidate(false)
        setFormOpen(true)
    }, [])

    const handleSave = useCallback(async () => {
        setForceValidate(true)
        if (hasErrors(fieldErrors)) {
            pushToast('danger', 'Validation', 'Fix the highlighted fields before saving.')
            return
        }
        try {
            if (formMode === 'create') {
                const created = await warehouseService.create(formData as CreateWarehousePayload)
                pushToast('success', 'Warehouse created', `${created.code} — ${created.name} was added.`)
            } else if (editing) {
                const updated = await warehouseService.update(editing.id, formData)
                pushToast('success', 'Warehouse updated', `${updated.code} — ${updated.name} was saved.`)
            }
            setFormOpen(false)
            refresh()
        } catch (e: any) {
            const msg = e?.response?.data?.message || 'An error occurred'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : msg)
        }
    }, [formMode, editing, formData, refresh, fieldErrors])

    const handleDelete = useCallback(async () => {
        if (!deleting) return
        try {
            await warehouseService.remove(deleting.id)
            pushToast('success', 'Deleted', `${deleting.code} — ${deleting.name} was removed.`)
            setDeleting(null)
            refresh()
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || 'Delete failed')
        }
    }, [deleting, refresh])

    const handleCheckBoxChange = useCallback((checked: boolean, row: Warehouse) => {
        setSelectedRows((prev) => { const next = new Set(prev); checked ? next.add(row.id) : next.delete(row.id); return next })
    }, [])
    const handleSelectAllChange = useCallback((checked: boolean, rows: { original: Warehouse }[]) => {
        setSelectedRows((prev) => { const next = new Set(prev); for (const r of rows) { checked ? next.add(r.original.id) : next.delete(r.original.id) } return next })
    }, [])
    const handleBulkDelete = useCallback(async () => {
        setBulkDeleting(true)
        try {
            await Promise.all(Array.from(selectedRows).map((id) => warehouseService.remove(id)))
            pushToast('success', 'Bulk delete', `${selectedRows.size} warehouse(s) deleted.`)
            setSelectedRows(new Set()); setBulkDeleteOpen(false); refresh()
        } catch { pushToast('danger', 'Error', 'Some deletions failed') }
        finally { setBulkDeleting(false) }
    }, [selectedRows, refresh])

    const columns = useMemo<ColumnDef<Warehouse>[]>(
        () => [
            {
                header: 'Code',
                accessorKey: 'code',
                size: 130,
                minSize: 110,
                cell: ({ row }) => (
                    <span className="whitespace-nowrap font-mono text-xs font-semibold text-primary">{row.original.code}</span>
                ),
            },
            {
                header: 'Name',
                accessorKey: 'name',
                size: 220,
                minSize: 180,
                cell: ({ row }) => (
                    <button type="button" onClick={() => setViewing(row.original)} className="truncate text-left text-sm font-semibold text-gray-900 hover:text-primary hover:underline dark:text-gray-100">
                        {row.original.name}
                    </button>
                ),
            },
            {
                header: 'Company',
                accessorKey: 'companyId',
                size: 150,
                minSize: 120,
                cell: ({ row }) => <span className="whitespace-nowrap text-sm">{row.original.company?.name ?? '—'}</span>,
            },
            {
                header: 'Plant',
                id: 'plant',
                size: 120,
                cell: ({ row }) => <span className="whitespace-nowrap text-sm">{row.original.plant?.code ?? '—'}</span>,
            },
            {
                header: 'Branch',
                id: 'branch',
                size: 120,
                cell: ({ row }) => <span className="whitespace-nowrap text-sm">{row.original.branch?.code ?? '—'}</span>,
            },
            {
                header: 'Type',
                accessorKey: 'warehouseType',
                size: 130,
                minSize: 110,
                cell: ({ row }) => <Tag className="text-xs whitespace-nowrap">{(row.original.warehouseType || 'GENERAL').replace(/_/g, ' ')}</Tag>,
            },
            {
                header: 'Timezone',
                accessorKey: 'timezone',
                size: 120,
                minSize: 100,
                cell: ({ row }) => <span className="whitespace-nowrap text-xs text-gray-500">{row.original.timezone || 'UTC'}</span>,
            },
            {
                header: 'Status',
                accessorKey: 'status',
                size: 110,
                minSize: 100,
                cell: ({ row }) => <StatusBadge tone={STATUS_TONE[row.original.status] ?? 'default'}>{row.original.status}</StatusBadge>,
            },
            {
                id: 'actions',
                header: '',
                enableSorting: false,
                size: 56,
                cell: ({ row }) => (
                    <Dropdown renderTitle={<EllipsisButton />} placement="bottom-end">
                        <Dropdown.Item eventKey="view" onClick={() => setViewing(row.original)}><HiOutlineEye className="text-base" /><span>View</span></Dropdown.Item>
                        <Dropdown.Item eventKey="edit" onClick={() => openEdit(row.original)}><HiOutlinePencil className="text-base" /><span>Edit</span></Dropdown.Item>
                        <Dropdown.Item eventKey="delete" onClick={() => setDeleting(row.original)}><HiOutlineTrash className="text-base text-red-500" /><span className="text-red-500">Delete</span></Dropdown.Item>
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
                title="Warehouses"
                description="Manage physical warehouse locations and their configuration."
                actions={<Button variant="solid" size="sm" icon={<HiOutlinePlus />} onClick={openCreate}>New warehouse</Button>}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard label="Total warehouses" value={stats.total} icon={<HiOutlineOfficeBuilding className="text-lg" />} />
                <StatCard label="Active" value={stats.active} tone="success" icon={<HiOutlineCheckCircle className="text-lg" />} />
                <StatCard label="Inactive" value={stats.inactive} tone="warning" icon={<HiOutlineExclamation className="text-lg" />} />
            </div>

            <AdaptiveCard className="mt-6">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <Input prefix={<HiOutlineSearch className="text-lg" />} placeholder="Search code, name…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
                    <Select<FilterOption> placeholder="Status" options={STATUS_FILTER_OPTIONS} value={STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter)} onChange={(opt) => { setStatusFilter(opt?.value ?? ''); setPage(1) }} />
                </div>

                {selectedRows.size > 0 && (
                    <div className="mt-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 dark:border-red-500/30 dark:bg-red-500/10">
                        <span className="text-sm font-medium text-red-700 dark:text-red-300">{selectedRows.size} item{selectedRows.size > 1 ? 's' : ''} selected</span>
                        <div className="ml-auto flex items-center gap-2">
                            <Button size="xs" onClick={() => setSelectedRows(new Set())}>Clear</Button>
                            <Button size="xs" variant="solid" customColorClass={() => 'bg-red-500 hover:bg-red-600 text-white'} icon={<HiOutlineTrash />} onClick={() => setBulkDeleteOpen(true)}>Delete selected</Button>
                        </div>
                    </div>
                )}

                <div className="mt-4">
                    <DataTable<Warehouse>
                        columns={columns}
                        data={warehouses}
                        compact
                        loading={loading}
                        selectable
                        checkboxChecked={(row) => selectedRows.has(row.id)}
                        onCheckBoxChange={handleCheckBoxChange}
                        onIndeterminateCheckBoxChange={(checked, rows) => handleSelectAllChange(checked, rows as any)}
                        noData={!loading && warehouses.length === 0}
                        pagingData={{ total: meta.total, pageIndex: page, pageSize }}
                        onPaginationChange={setPage}
                        onSelectChange={(size) => { setPageSize(size); setPage(1) }}
                    />
                </div>
            </AdaptiveCard>

            {/* Create/Edit dialog */}
            <FormDialog
                isOpen={formOpen}
                onClose={() => setFormOpen(false)}
                width={560}
                title={formMode === 'create' ? 'New warehouse' : 'Edit warehouse'}
                description={formMode === 'create' ? 'Code is auto-generated (e.g. WH-000001).' : editing ? `${editing.code} — ${editing.name}` : ''}
                icon={<HiOutlineOfficeBuilding />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setFormOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" onClick={handleSave} disabled={(forceValidate && hasErrors(fieldErrors)) || companyOptions.length === 0}>
                            {formMode === 'create' ? 'Create warehouse' : 'Save changes'}
                        </Button>
                    </>
                }
            >
                {formMode === 'edit' && editing && (
                    <FormItem label="Warehouse code">
                        <Input value={editing.code} disabled className="!bg-gray-100 dark:!bg-gray-700/50" />
                    </FormItem>
                )}
                <FormItem label="Name" asterisk invalid={Boolean(err('name'))} errorMessage={err('name')}>
                    <Input value={formData.name ?? ''} onChange={(e) => setField('name', e.target.value)} placeholder="Warehouse name" />
                </FormItem>
                <FormItem label="Company" asterisk invalid={Boolean(err('companyId'))} errorMessage={err('companyId')}>
                    {companyOptions.length === 0 ? (
                        <p className="text-sm text-amber-600 dark:text-amber-400">No companies found. Seed or create a company first.</p>
                    ) : (
                        <Select<FilterOption>
                            placeholder="Select company"
                            options={companyOptions}
                            value={companyOptions.find((o) => o.value === formData.companyId) ?? null}
                            onChange={(opt) => {
                                setFormData((prev) => ({
                                    ...prev,
                                    companyId: opt?.value ?? '',
                                    plantId: '',
                                    branchId: '',
                                }))
                                setTouched((t) => ({ ...t, companyId: true }))
                            }}
                            menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
                            menuPosition="fixed"
                            styles={{ menuPortal: (base: Record<string, unknown>) => ({ ...base, zIndex: 9999 }) }}
                        />
                    )}
                </FormItem>
                <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
                    <FormItem label="Plant">
                        <Select<FilterOption>
                            placeholder="Select plant"
                            isClearable
                            options={plantOptions}
                            value={plantOptions.find((o) => o.value === formData.plantId) ?? null}
                            onChange={(opt) => {
                                setFormData((prev) => ({
                                    ...prev,
                                    plantId: opt?.value ?? '',
                                    branchId: '',
                                }))
                            }}
                            menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
                            menuPosition="fixed"
                            styles={{ menuPortal: (base: Record<string, unknown>) => ({ ...base, zIndex: 9999 }) }}
                        />
                    </FormItem>
                    <FormItem label="Branch">
                        <Select<FilterOption>
                            placeholder="Select branch"
                            isClearable
                            options={branchOptions}
                            value={branchOptions.find((o) => o.value === formData.branchId) ?? null}
                            onChange={(opt) => setField('branchId', opt?.value ?? '')}
                            menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
                            menuPosition="fixed"
                            styles={{ menuPortal: (base: Record<string, unknown>) => ({ ...base, zIndex: 9999 }) }}
                        />
                    </FormItem>
                </div>
                <FormItem label="Manager ID">
                    <Input value={formData.managerId ?? ''} onChange={(e) => setField('managerId', e.target.value)} placeholder="Optional manager identifier" />
                </FormItem>
                <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
                    <FormItem label="Warehouse type">
                        <Select<FilterOption>
                            options={WAREHOUSE_TYPE_OPTIONS.filter((o) => o.value !== '')}
                            value={WAREHOUSE_TYPE_OPTIONS.find((o) => o.value === (formData.warehouseType || 'GENERAL'))}
                            onChange={(opt) => setField('warehouseType', opt?.value || 'GENERAL')}
                            menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
                            menuPosition="fixed"
                            styles={{ menuPortal: (base: Record<string, unknown>) => ({ ...base, zIndex: 9999 }) }}
                        />
                    </FormItem>
                    <FormItem label="Timezone">
                        <Input value={formData.timezone ?? 'UTC'} onChange={(e) => setField('timezone', e.target.value)} placeholder="UTC" />
                    </FormItem>
                </div>
                <FormItem label="Address">
                    <Input value={formData.address ?? ''} onChange={(e) => setField('address', e.target.value)} placeholder="Address" />
                </FormItem>
                <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
                    <FormItem label="Default receiving area">
                        <Input value={formData.defaultReceivingArea ?? ''} onChange={(e) => setField('defaultReceivingArea', e.target.value)} placeholder="Receiving area" />
                    </FormItem>
                    <FormItem label="Default shipping area">
                        <Input value={formData.defaultShippingArea ?? ''} onChange={(e) => setField('defaultShippingArea', e.target.value)} placeholder="Shipping area" />
                    </FormItem>
                </div>
            </FormDialog>

            {/* View dialog */}
            <FormDialog
                isOpen={Boolean(viewing)}
                onClose={() => setViewing(null)}
                size="lg"
                title={viewing ? `${viewing.code} — ${viewing.name}` : 'Warehouse'}
                description={viewing?.company?.name ?? '—'}
                icon={<HiOutlineOfficeBuilding />}
                footer={
                    viewing ? (
                        <>
                            <Button size="sm" onClick={() => { setViewing(null); openEdit(viewing) }}>Edit</Button>
                            <Button size="sm" onClick={() => setViewing(null)}>Close</Button>
                        </>
                    ) : undefined
                }
            >
                {viewing && (
                    <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                        <div><span className="text-gray-500">Status</span><p className="mt-0.5"><StatusBadge tone={STATUS_TONE[viewing.status] ?? 'default'}>{viewing.status}</StatusBadge></p></div>
                        <div><span className="text-gray-500">Type</span><p className="mt-0.5 font-medium">{(viewing.warehouseType || 'GENERAL').replace(/_/g, ' ')}</p></div>
                        <div><span className="text-gray-500">Plant</span><p className="mt-0.5 font-medium">{viewing.plant?.name ?? viewing.plantId ?? '—'}</p></div>
                        <div><span className="text-gray-500">Branch</span><p className="mt-0.5 font-medium">{viewing.branch?.name ?? viewing.branchId ?? '—'}</p></div>
                        <div><span className="text-gray-500">Manager</span><p className="mt-0.5 font-medium">{viewing.managerId || '—'}</p></div>
                        <div><span className="text-gray-500">Timezone</span><p className="mt-0.5 font-medium">{viewing.timezone || 'UTC'}</p></div>
                        <div><span className="text-gray-500">Address</span><p className="mt-0.5 font-medium">{viewing.address || '—'}</p></div>
                        <div><span className="text-gray-500">Receiving area</span><p className="mt-0.5 font-medium">{viewing.defaultReceivingArea || '—'}</p></div>
                        <div><span className="text-gray-500">Shipping area</span><p className="mt-0.5 font-medium">{viewing.defaultShippingArea || '—'}</p></div>
                    </div>
                )}
            </FormDialog>

            <ConfirmDialog isOpen={Boolean(deleting)} type="danger" title="Delete warehouse?" confirmText="Delete" onRequestClose={() => setDeleting(null)} onCancel={() => setDeleting(null)} onConfirm={handleDelete}>
                <p>Are you sure you want to delete <span className="font-semibold">{deleting?.code} — {deleting?.name}</span>?</p>
            </ConfirmDialog>
            <ConfirmDialog isOpen={bulkDeleteOpen} type="danger" title={`Delete ${selectedRows.size} warehouse(s)?`} confirmText={`Delete ${selectedRows.size}`} onRequestClose={() => setBulkDeleteOpen(false)} onCancel={() => setBulkDeleteOpen(false)} onConfirm={handleBulkDelete} confirmButtonProps={{ loading: bulkDeleting, customColorClass: () => 'bg-red-500 hover:bg-red-500/90 text-white' }}>
                <p>Are you sure you want to delete <span className="font-semibold">{selectedRows.size}</span> selected warehouse{selectedRows.size > 1 ? 's' : ''}?</p>
            </ConfirmDialog>
        </PageContainer>
    )
}

type StatCardProps = { label: string; value: number; icon: React.ReactNode; tone?: 'default' | 'success' | 'warning' }
const toneClasses: Record<string, { icon: string; text: string }> = {
    default: { icon: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300', text: 'text-gray-900 dark:text-gray-100' },
    success: { icon: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300', text: 'text-gray-900 dark:text-gray-100' },
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

export default WarehousesPage
