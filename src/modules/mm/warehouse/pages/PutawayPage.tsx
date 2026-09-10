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
import Tabs from '@/components/ui/Tabs'
import { FormItem } from '@/components/ui/Form'
import {
    HiOutlinePlus,
    HiOutlineSearch,
    HiOutlineTrash,
    HiOutlineUserAdd,
    HiOutlineCheckCircle,
    HiOutlineBan,
    HiOutlineInboxIn,
} from 'react-icons/hi'
import { putawayService } from '../services/putawayService'
import { warehouseService } from '../services/warehouseService'
import { storageBinService } from '../services/storageBinService'
import { materialService } from '../../material-master/services/materialService'
import type { PutawayTask, PutawayQueryParams, CreatePutawayPayload, Warehouse, StorageBin } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/warehouse-management/putaway'

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger'> = {
    PENDING: 'warning',
    ASSIGNED: 'default',
    IN_PROGRESS: 'success',
    COMPLETED: 'success',
    EXCEPTION: 'danger',
    CANCELLED: 'danger',
}

const PRIORITY_COLOR: Record<number, string> = {
    1: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
    2: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
    3: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
    4: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
    5: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    6: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    7: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
    8: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
    9: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    10: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
}

type FilterOption = { value: string; label: string }

const STATUS_FILTER_OPTIONS: FilterOption[] = [
    { value: '', label: 'All statuses' },
    { value: 'PENDING', label: 'Pending' },
    { value: 'ASSIGNED', label: 'Assigned' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'EXCEPTION', label: 'Exception' },
    { value: 'CANCELLED', label: 'Cancelled' },
]

const TAB_STATUS_MAP: Record<string, string> = {
    all: '',
    pending: 'PENDING',
    assigned: 'ASSIGNED',
    in_progress: 'IN_PROGRESS',
    completed: 'COMPLETED',
}

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(<Notification type={type} title={title} closable duration={3500}>{msg}</Notification>, { placement: 'top-end' })
}

const PutawayPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)

    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [warehouseFilter, setWarehouseFilter] = useState('')
    const [activeTab, setActiveTab] = useState('all')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)

    const [data, setData] = useState<PutawayTask[]>([])
    const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 0 })
    const [loading, setLoading] = useState(true)

    const [warehouses, setWarehouses] = useState<Warehouse[]>([])
    const [materials, setMaterials] = useState<{ value: string; label: string }[]>([])
    const [bins, setBins] = useState<StorageBin[]>([])

    // Dialogs
    const [createOpen, setCreateOpen] = useState(false)
    const [assignOpen, setAssignOpen] = useState(false)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [cancelTarget, setCancelTarget] = useState<PutawayTask | null>(null)
    const [actionTarget, setActionTarget] = useState<PutawayTask | null>(null)

    // Form state
    const [createForm, setCreateForm] = useState<Partial<CreatePutawayPayload>>({})
    const [assignWorker, setAssignWorker] = useState('')
    const [confirmBinId, setConfirmBinId] = useState('')
    const [confirmQty, setConfirmQty] = useState<number | ''>('')
    const [confirmScanCode, setConfirmScanCode] = useState('')

    // Selection
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
    const [bulkDeleting, setBulkDeleting] = useState(false)

    const queryParams = useMemo<PutawayQueryParams>(
        () => ({
            page,
            limit: pageSize,
            search: search || undefined,
            status: statusFilter || undefined,
            warehouseId: warehouseFilter || undefined,
            sortBy: 'createdAt',
            sortOrder: 'desc',
        }),
        [page, pageSize, search, statusFilter, warehouseFilter],
    )

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const res = await putawayService.list(queryParams)
            setData(res.data)
            setMeta(res.meta)
        } catch {
            /* leave empty */
        } finally {
            setLoading(false)
        }
    }, [queryParams])

    useEffect(() => { fetchData() }, [fetchData])

    useEffect(() => {
        warehouseService.list({ limit: 200, status: 'ACTIVE' }).then((res) => {
            setWarehouses(Array.isArray(res) ? res : (res?.data ?? []))
        }).catch(() => {})
    }, [])

    useEffect(() => {
        materialService.list({ limit: 200 }).then((res) => {
            const arr = Array.isArray(res) ? res : (res?.data ?? [])
            setMaterials(arr.map((m: any) => ({ value: m.id, label: `${m.materialCode} — ${m.materialName}` })))
        }).catch(() => {})
    }, [])

    useEffect(() => {
        storageBinService.list({ limit: 200, status: 'ACTIVE' }).then((res) => {
            setBins(Array.isArray(res) ? res : (res?.data ?? []))
        }).catch(() => {})
    }, [])

    const warehouseOptions = useMemo<FilterOption[]>(() => [
        { value: '', label: 'All warehouses' },
        ...warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })),
    ], [warehouses])

    const warehouseSelectOptions = useMemo(() =>
        warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })),
        [warehouses],
    )

    const binSelectOptions = useMemo(() =>
        bins.map((b) => ({ value: b.id, label: b.code })),
        [bins],
    )

    const handleTabChange = useCallback((val: string) => {
        setActiveTab(val)
        setStatusFilter(TAB_STATUS_MAP[val] ?? '')
        setPage(1)
    }, [])

    // ---- Create ----
    const handleCreate = useCallback(async () => {
        try {
            const task = await putawayService.create(createForm as CreatePutawayPayload)
            pushToast('success', 'Putaway created', `Task ${task.taskNumber} created successfully.`)
            setCreateOpen(false)
            setCreateForm({})
            fetchData()
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'Create failed'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : msg)
        }
    }, [createForm, fetchData])

    // ---- Assign ----
    const openAssign = useCallback((task: PutawayTask) => {
        setActionTarget(task)
        setAssignWorker(task.assignedWorker || '')
        setAssignOpen(true)
    }, [])

    const handleAssign = useCallback(async () => {
        if (!actionTarget) return
        try {
            await putawayService.assign(actionTarget.id, { assignedWorker: assignWorker })
            pushToast('success', 'Worker assigned', `${assignWorker} assigned to ${actionTarget.taskNumber}.`)
            setAssignOpen(false)
            setAssignWorker('')
            setActionTarget(null)
            fetchData()
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || 'Assign failed')
        }
    }, [actionTarget, assignWorker, fetchData])

    // ---- Confirm ----
    const openConfirm = useCallback((task: PutawayTask) => {
        setActionTarget(task)
        setConfirmBinId(task.actualBinId || task.recommendedBinId || '')
        setConfirmQty(task.quantity)
        setConfirmScanCode('')
        setConfirmOpen(true)
    }, [])

    const handleConfirm = useCallback(async () => {
        if (!actionTarget) return
        try {
            await putawayService.confirm(actionTarget.id, {
                actualBinId: confirmBinId,
                quantity: typeof confirmQty === 'number' ? confirmQty : 0,
                scannedBinCode: confirmScanCode.trim() || undefined,
            })
            pushToast('success', 'Putaway confirmed', `${actionTarget.taskNumber} confirmed.`)
            setConfirmOpen(false)
            setActionTarget(null)
            fetchData()
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || 'Confirm failed')
        }
    }, [actionTarget, confirmBinId, confirmQty, confirmScanCode, fetchData])

    // ---- Cancel ----
    const handleCancel = useCallback(async () => {
        if (!cancelTarget) return
        try {
            await putawayService.cancel(cancelTarget.id)
            pushToast('success', 'Task cancelled', `${cancelTarget.taskNumber} was cancelled.`)
            setCancelTarget(null)
            fetchData()
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || 'Cancel failed')
        }
    }, [cancelTarget, fetchData])

    // ---- Bulk delete ----
    const handleCheckBoxChange = useCallback((checked: boolean, row: PutawayTask) => {
        setSelectedRows((prev) => { const next = new Set(prev); checked ? next.add(row.id) : next.delete(row.id); return next })
    }, [])
    const handleSelectAllChange = useCallback((checked: boolean, rows: { original: PutawayTask }[]) => {
        setSelectedRows((prev) => { const next = new Set(prev); for (const r of rows) { checked ? next.add(r.original.id) : next.delete(r.original.id) } return next })
    }, [])
    const handleBulkDelete = useCallback(async () => {
        setBulkDeleting(true)
        try {
            await Promise.all(Array.from(selectedRows).map((id) => putawayService.cancel(id)))
            pushToast('success', 'Bulk cancel', `${selectedRows.size} task(s) cancelled.`)
            setSelectedRows(new Set())
            setBulkDeleteOpen(false)
            fetchData()
        } catch {
            pushToast('danger', 'Error', 'Some cancellations failed')
        } finally {
            setBulkDeleting(false)
        }
    }, [selectedRows, fetchData])

    const columns = useMemo<ColumnDef<PutawayTask>[]>(
        () => [
            {
                header: 'Task #',
                accessorKey: 'taskNumber',
                size: 130,
                minSize: 110,
                cell: ({ row }) => (
                    <span className="whitespace-nowrap font-mono text-xs font-semibold text-primary">
                        {row.original.taskNumber}
                    </span>
                ),
            },
            {
                header: 'Material',
                accessorKey: 'materialId',
                size: 220,
                minSize: 180,
                cell: ({ row }) => {
                    const m = row.original.material
                    return (
                        <span className="truncate text-sm">
                            {m ? `${m.materialCode} — ${m.materialName}` : '—'}
                        </span>
                    )
                },
            },
            {
                header: 'Quantity',
                accessorKey: 'quantity',
                size: 90,
                cell: ({ row }) => (
                    <span className="text-sm font-medium">{row.original.quantity.toLocaleString()}</span>
                ),
            },
            {
                header: 'Source Doc',
                accessorKey: 'sourceDocument',
                size: 130,
                cell: ({ row }) => (
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                        {row.original.sourceDocument || '—'}
                    </span>
                ),
            },
            {
                header: 'Recommended Bin',
                accessorKey: 'recommendedBinId',
                size: 140,
                cell: ({ row }) => (
                    <span className="text-xs font-mono">
                        {row.original.recommendedBin?.code || '—'}
                    </span>
                ),
            },
            {
                header: 'Actual Bin',
                accessorKey: 'actualBinId',
                size: 120,
                cell: ({ row }) => (
                    <span className="text-xs font-mono">
                        {row.original.actualBin?.code || '—'}
                    </span>
                ),
            },
            {
                header: 'Worker',
                accessorKey: 'assignedWorker',
                size: 130,
                cell: ({ row }) => (
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                        {row.original.assignedWorker || 'Unassigned'}
                    </span>
                ),
            },
            {
                header: 'Priority',
                accessorKey: 'priority',
                size: 80,
                cell: ({ row }) => {
                    const p = row.original.priority
                    return (
                        <Tag className={`border-0 font-semibold ${PRIORITY_COLOR[p] ?? PRIORITY_COLOR[5]}`}>
                            {p}
                        </Tag>
                    )
                },
            },
            {
                header: 'Status',
                accessorKey: 'status',
                size: 120,
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
                size: 56,
                cell: ({ row }) => (
                    <Dropdown renderTitle={<EllipsisButton />} placement="bottom-end">
                        <Dropdown.Item eventKey="assign" onClick={() => openAssign(row.original)}>
                            <HiOutlineUserAdd className="text-base" />
                            <span>Assign</span>
                        </Dropdown.Item>
                        <Dropdown.Item eventKey="confirm" onClick={() => openConfirm(row.original)}>
                            <HiOutlineCheckCircle className="text-base" />
                            <span>Confirm</span>
                        </Dropdown.Item>
                        <Dropdown.Item eventKey="cancel" onClick={() => setCancelTarget(row.original)}>
                            <HiOutlineBan className="text-base text-red-500" />
                            <span className="text-red-500">Cancel</span>
                        </Dropdown.Item>
                    </Dropdown>
                ),
            },
        ],
        [openAssign, openConfirm],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Putaway Tasks"
                description="Manage inbound putaway operations across all warehouses."
                actions={
                    <Button variant="solid" size="sm" icon={<HiOutlinePlus />} onClick={() => { setCreateForm({}); setCreateOpen(true) }}>
                        Create Putaway
                    </Button>
                }
            />

            <AdaptiveCard>
                {/* Filters */}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <Input
                        prefix={<HiOutlineSearch className="text-lg" />}
                        placeholder="Search task #, material…"
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                    />
                    <Select<FilterOption>
                        placeholder="Status"
                        options={STATUS_FILTER_OPTIONS}
                        value={STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter)}
                        onChange={(opt) => {
                            const val = opt?.value ?? ''
                            setStatusFilter(val)
                            const tabKey = Object.entries(TAB_STATUS_MAP).find(([, v]) => v === val)?.[0] ?? 'all'
                            setActiveTab(tabKey)
                            setPage(1)
                        }}
                    />
                    <Select<FilterOption>
                        placeholder="Warehouse"
                        options={warehouseOptions}
                        value={warehouseOptions.find((o) => o.value === warehouseFilter)}
                        onChange={(opt) => { setWarehouseFilter(opt?.value ?? ''); setPage(1) }}
                    />
                </div>

                {/* Tabs */}
                <div className="mt-4">
                    <Tabs value={activeTab} onChange={handleTabChange}>
                        <Tabs.TabList>
                            <Tabs.TabNav value="all">All</Tabs.TabNav>
                            <Tabs.TabNav value="pending">Pending</Tabs.TabNav>
                            <Tabs.TabNav value="assigned">Assigned</Tabs.TabNav>
                            <Tabs.TabNav value="in_progress">In Progress</Tabs.TabNav>
                            <Tabs.TabNav value="completed">Completed</Tabs.TabNav>
                        </Tabs.TabList>
                    </Tabs>
                </div>

                {/* Bulk actions */}
                {selectedRows.size > 0 && (
                    <div className="mt-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 dark:border-red-500/30 dark:bg-red-500/10">
                        <span className="text-sm font-medium text-red-700 dark:text-red-300">
                            {selectedRows.size} item{selectedRows.size > 1 ? 's' : ''} selected
                        </span>
                        <div className="ml-auto flex items-center gap-2">
                            <Button size="xs" onClick={() => setSelectedRows(new Set())}>Clear</Button>
                            <Button
                                size="xs"
                                variant="solid"
                                customColorClass={() => 'bg-red-500 hover:bg-red-600 text-white'}
                                icon={<HiOutlineTrash />}
                                onClick={() => setBulkDeleteOpen(true)}
                            >
                                Cancel selected
                            </Button>
                        </div>
                    </div>
                )}

                {/* Data table */}
                <div className="mt-4">
                    <DataTable<PutawayTask>
                        columns={columns}
                        data={data}
                        compact
                        loading={loading}
                        selectable
                        checkboxChecked={(row) => selectedRows.has(row.id)}
                        onCheckBoxChange={handleCheckBoxChange}
                        onIndeterminateCheckBoxChange={(checked, rows) => handleSelectAllChange(checked, rows as any)}
                        noData={!loading && data.length === 0}
                        pagingData={{ total: meta.total, pageIndex: page, pageSize }}
                        onPaginationChange={setPage}
                        onSelectChange={(size) => { setPageSize(size); setPage(1) }}
                    />
                </div>
            </AdaptiveCard>

            {/* Create Putaway Dialog */}
            <FormDialog
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                width={560}
                title="Create Putaway Task"
                icon={<HiOutlineInboxIn />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button
                            size="sm"
                            variant="solid"
                            onClick={handleCreate}
                            disabled={!createForm.warehouseId || !createForm.materialId || !createForm.quantity}
                        >
                            Create
                        </Button>
                    </>
                }
            >
                <FormItem label="Warehouse" asterisk>
                    <Select
                        placeholder="Select warehouse"
                        options={warehouseSelectOptions}
                        value={warehouseSelectOptions.find((o) => o.value === createForm.warehouseId)}
                        onChange={(opt) => setCreateForm({ ...createForm, warehouseId: opt?.value ?? '' })}
                    />
                </FormItem>
                <FormItem label="Material" asterisk>
                    <Select
                        placeholder="Select material"
                        options={materials}
                        value={materials.find((o) => o.value === createForm.materialId)}
                        onChange={(opt) => setCreateForm({ ...createForm, materialId: opt?.value ?? '' })}
                    />
                </FormItem>
                <FormItem label="Quantity" asterisk>
                    <Input
                        type="number"
                        placeholder="0"
                        value={createForm.quantity ?? ''}
                        onChange={(e) => setCreateForm({ ...createForm, quantity: Number(e.target.value) || 0 })}
                    />
                </FormItem>
                <FormItem label="Source Document">
                    <Input
                        placeholder="e.g. PO-000123"
                        value={createForm.sourceDocument ?? ''}
                        onChange={(e) => setCreateForm({ ...createForm, sourceDocument: e.target.value })}
                    />
                </FormItem>
                <div className="grid grid-cols-2 gap-3">
                    <FormItem label="Batch ID">
                        <Input
                            placeholder="Batch ID"
                            value={createForm.batchId ?? ''}
                            onChange={(e) => setCreateForm({ ...createForm, batchId: e.target.value })}
                        />
                    </FormItem>
                    <FormItem label="Serial ID">
                        <Input
                            placeholder="Serial ID"
                            value={createForm.serialId ?? ''}
                            onChange={(e) => setCreateForm({ ...createForm, serialId: e.target.value })}
                        />
                    </FormItem>
                </div>
                <FormItem label="Source Location">
                    <Input
                        placeholder="Source location"
                        value={createForm.sourceLocation ?? ''}
                        onChange={(e) => setCreateForm({ ...createForm, sourceLocation: e.target.value })}
                    />
                </FormItem>
                <FormItem label="Priority (1–10)">
                    <Input
                        type="number"
                        min={1}
                        max={10}
                        placeholder="5"
                        value={createForm.priority ?? ''}
                        onChange={(e) => setCreateForm({ ...createForm, priority: Number(e.target.value) || undefined })}
                    />
                </FormItem>
            </FormDialog>

            {/* Assign Worker Dialog */}
            <FormDialog
                isOpen={assignOpen}
                onClose={() => setAssignOpen(false)}
                size="sm"
                title="Assign Worker"
                description={actionTarget ? `Task: ${actionTarget.taskNumber}` : undefined}
                icon={<HiOutlineUserAdd />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setAssignOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" onClick={handleAssign} disabled={!assignWorker.trim()}>Assign</Button>
                    </>
                }
            >
                <FormItem label="Worker Name" asterisk>
                    <Input
                        placeholder="Enter worker name"
                        value={assignWorker}
                        onChange={(e) => setAssignWorker(e.target.value)}
                    />
                </FormItem>
            </FormDialog>

            {/* Confirm Putaway Dialog */}
            <FormDialog
                isOpen={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                size="sm"
                title="Confirm Putaway"
                description={actionTarget ? `Task: ${actionTarget.taskNumber}` : undefined}
                icon={<HiOutlineCheckCircle />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setConfirmOpen(false)}>Cancel</Button>
                        <Button
                            size="sm"
                            variant="solid"
                            onClick={handleConfirm}
                            disabled={!confirmBinId || !confirmQty}
                        >
                            Confirm
                        </Button>
                    </>
                }
            >
                <FormItem label="Actual Bin" asterisk>
                    <Select
                        placeholder="Select bin"
                        options={binSelectOptions}
                        value={binSelectOptions.find((o) => o.value === confirmBinId)}
                        onChange={(opt) => setConfirmBinId(opt?.value ?? '')}
                    />
                </FormItem>
                <FormItem label="Scan bin code (optional)">
                    <Input
                        placeholder="Scan or type bin code / barcode"
                        value={confirmScanCode}
                        onChange={(e) => setConfirmScanCode(e.target.value)}
                    />
                </FormItem>
                <FormItem label="Quantity" asterisk>
                    <Input
                        type="number"
                        placeholder="0"
                        value={confirmQty}
                        onChange={(e) => setConfirmQty(Number(e.target.value) || '')}
                    />
                </FormItem>
            </FormDialog>

            {/* Cancel task confirm dialog */}
            <ConfirmDialog
                isOpen={Boolean(cancelTarget)}
                type="danger"
                title="Cancel putaway task?"
                confirmText="Cancel Task"
                onRequestClose={() => setCancelTarget(null)}
                onCancel={() => setCancelTarget(null)}
                onConfirm={handleCancel}
            >
                <p>Are you sure you want to cancel <span className="font-semibold">{cancelTarget?.taskNumber}</span>?</p>
            </ConfirmDialog>

            {/* Bulk cancel confirm dialog */}
            <ConfirmDialog
                isOpen={bulkDeleteOpen}
                type="danger"
                title={`Cancel ${selectedRows.size} task(s)?`}
                confirmText={`Cancel ${selectedRows.size}`}
                onRequestClose={() => setBulkDeleteOpen(false)}
                onCancel={() => setBulkDeleteOpen(false)}
                onConfirm={handleBulkDelete}
                confirmButtonProps={{ loading: bulkDeleting, customColorClass: () => 'bg-red-500 hover:bg-red-500/90 text-white' }}
            >
                <p>Are you sure you want to cancel <span className="font-semibold">{selectedRows.size}</span> selected task{selectedRows.size > 1 ? 's' : ''}?</p>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default PutawayPage
