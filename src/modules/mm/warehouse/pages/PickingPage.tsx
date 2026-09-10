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
import Tabs from '@/components/ui/Tabs'
import Tag from '@/components/ui/Tag'
import Checkbox from '@/components/ui/Checkbox'
import { FormItem } from '@/components/ui/Form'
import {
    HiOutlineClipboardList,
    HiOutlineSearch,
    HiOutlinePlus,
    HiOutlineUserAdd,
    HiOutlineCheckCircle,
    HiOutlineXCircle,
    HiOutlineCollection,
} from 'react-icons/hi'
import { pickingService } from '../services/pickingService'
import { pickWaveService } from '../services/pickWaveService'
import { warehouseService } from '../services/warehouseService'
import { storageBinService } from '../services/storageBinService'
import { materialService } from '../../material-master/services/materialService'
import type {
    PickingTask,
    PickingQueryParams,
    CreatePickingTaskPayload,
    CreatePickWavePayload,
    Warehouse,
    StorageBin,
} from '../types'
import type { Material } from '../../material-master/types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/warehouse-management/picking'

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger'> = {
    OPEN: 'default',
    ASSIGNED: 'warning',
    IN_PROGRESS: 'success',
    PARTIALLY_PICKED: 'warning',
    COMPLETED: 'success',
    CANCELLED: 'danger',
}

const PRIORITY_COLOR: Record<number, string> = {
    1: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
    2: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    3: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
}

type FilterOption = { value: string; label: string }

const STATUS_TABS = ['All', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'PARTIALLY_PICKED', 'COMPLETED'] as const

const STRATEGY_OPTIONS: FilterOption[] = [
    { value: 'FIFO', label: 'FIFO' },
    { value: 'FEFO', label: 'FEFO' },
    { value: 'NEAREST_BIN', label: 'Nearest' },
    { value: 'ZONE', label: 'Zone' },
    { value: 'WAVE', label: 'Wave (bin walk)' },
    { value: 'PRIORITY', label: 'Priority' },
]

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(<Notification type={type} title={title} closable duration={3500}>{msg}</Notification>, { placement: 'top-end' })
}

const PickingPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)

    const [search, setSearch] = useState('')
    const [warehouseFilter, setWarehouseFilter] = useState('')
    const [statusTab, setStatusTab] = useState('All')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)

    const [tasks, setTasks] = useState<PickingTask[]>([])
    const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 0 })
    const [loading, setLoading] = useState(true)

    const [warehouses, setWarehouses] = useState<Warehouse[]>([])
    const [bins, setBins] = useState<StorageBin[]>([])
    const [materials, setMaterials] = useState<Material[]>([])

    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
    const [bulkCancelOpen, setBulkCancelOpen] = useState(false)
    const [bulkCancelling, setBulkCancelling] = useState(false)

    const [createOpen, setCreateOpen] = useState(false)
    const [createForm, setCreateForm] = useState<Partial<CreatePickingTaskPayload>>({})

    const [waveOpen, setWaveOpen] = useState(false)
    const [waveForm, setWaveForm] = useState<Partial<CreatePickWavePayload>>({ taskIds: [] })
    const [waveTasks, setWaveTasks] = useState<PickingTask[]>([])
    const [waveTasksLoading, setWaveTasksLoading] = useState(false)

    const [assignOpen, setAssignOpen] = useState(false)
    const [assignTarget, setAssignTarget] = useState<PickingTask | null>(null)
    const [assignUser, setAssignUser] = useState('')

    const [confirmOpen, setConfirmOpen] = useState(false)
    const [confirmTarget, setConfirmTarget] = useState<PickingTask | null>(null)
    const [pickedQty, setPickedQty] = useState(0)
    const [scanBinId, setScanBinId] = useState('')
    const [scanMaterialId, setScanMaterialId] = useState('')
    const [scanBatchId, setScanBatchId] = useState('')
    const [scanSerialId, setScanSerialId] = useState('')

    const queryParams = useMemo<PickingQueryParams>(
        () => ({
            page,
            limit: pageSize,
            search: search || undefined,
            warehouseId: warehouseFilter || undefined,
            status: statusTab === 'All' ? undefined : statusTab,
            sortBy: 'createdAt',
            sortOrder: 'desc',
        }),
        [page, pageSize, search, warehouseFilter, statusTab],
    )

    const fetchTasks = useCallback(async () => {
        setLoading(true)
        try {
            const res = await pickingService.list(queryParams)
            setTasks(res.data)
            setMeta(res.meta)
        } catch {
            pushToast('danger', 'Error', 'Failed to load picking tasks')
        } finally {
            setLoading(false)
        }
    }, [queryParams])

    useEffect(() => { fetchTasks() }, [fetchTasks])

    useEffect(() => {
        warehouseService.list({ limit: 200 }).then((r) => setWarehouses(Array.isArray(r) ? r : (r?.data ?? []))).catch(() => {})
        materialService.list({ limit: 200 }).then((r) => setMaterials(Array.isArray(r) ? r : (r?.data ?? []))).catch(() => {})
    }, [])

    const warehouseOptions = useMemo<FilterOption[]>(
        () => [{ value: '', label: 'All warehouses' }, ...warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }))],
        [warehouses],
    )

    const binOptions = useMemo<FilterOption[]>(
        () => bins.map((b) => ({ value: b.id, label: b.code })),
        [bins],
    )

    const materialOptions = useMemo<FilterOption[]>(
        () => materials.map((m) => ({ value: m.id, label: `${m.materialCode} — ${m.materialName}` })),
        [materials],
    )

    const loadBins = useCallback((whId: string) => {
        if (!whId) { setBins([]); return }
        storageBinService.list({ limit: 500 }).then((r) => setBins(Array.isArray(r) ? r : (r?.data ?? []))).catch(() => {})
    }, [])

    const openCreate = useCallback(() => {
        setCreateForm({})
        setCreateOpen(true)
    }, [])

    const handleCreateSave = useCallback(async () => {
        try {
            const task = await pickingService.create(createForm as CreatePickingTaskPayload)
            pushToast('success', 'Task created', `Pick task ${task.taskNumber} created.`)
            setCreateOpen(false)
            fetchTasks()
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'An error occurred'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : msg)
        }
    }, [createForm, fetchTasks])

    const openWaveDialog = useCallback(() => {
        setWaveForm({ taskIds: [] })
        setWaveTasks([])
        setWaveOpen(true)
    }, [])

    const loadWaveTasks = useCallback(async (whId: string) => {
        if (!whId) { setWaveTasks([]); return }
        setWaveTasksLoading(true)
        try {
            const res = await pickingService.list({ warehouseId: whId, status: 'OPEN', limit: 200 })
            const assigned = await pickingService.list({ warehouseId: whId, status: 'ASSIGNED', limit: 200 })
            setWaveTasks([...res.data, ...assigned.data])
        } catch {
            pushToast('danger', 'Error', 'Failed to load tasks for wave')
        } finally {
            setWaveTasksLoading(false)
        }
    }, [])

    const handleWaveSave = useCallback(async () => {
        try {
            const wave = await pickWaveService.create(waveForm as CreatePickWavePayload)
            pushToast('success', 'Wave created', `Pick wave ${wave.waveNumber} created with ${wave.taskCount} tasks.`)
            setWaveOpen(false)
            fetchTasks()
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'An error occurred'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : msg)
        }
    }, [waveForm, fetchTasks])

    const openAssign = useCallback((task: PickingTask) => {
        setAssignTarget(task)
        setAssignUser(task.assignedUser || '')
        setAssignOpen(true)
    }, [])

    const handleAssign = useCallback(async () => {
        if (!assignTarget) return
        try {
            await pickingService.assign(assignTarget.id, { assignedUser: assignUser })
            pushToast('success', 'Assigned', `Task ${assignTarget.taskNumber} assigned to ${assignUser}.`)
            setAssignOpen(false)
            fetchTasks()
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || 'Assign failed')
        }
    }, [assignTarget, assignUser, fetchTasks])

    const openConfirm = useCallback((task: PickingTask) => {
        setConfirmTarget(task)
        const remaining = Math.max(0, (task.requiredQty || 0) - (task.pickedQty || 0))
        setPickedQty(remaining || 1)
        setScanBinId(task.sourceBinId || '')
        setScanMaterialId(task.materialId || '')
        setScanBatchId(task.batchId || '')
        setScanSerialId(task.serialId || '')
        setConfirmOpen(true)
    }, [])

    const handleConfirmPick = useCallback(async () => {
        if (!confirmTarget) return
        try {
            await pickingService.confirmPick(confirmTarget.id, {
                scannedBinId: scanBinId,
                scannedMaterialId: scanMaterialId,
                scannedBatchId: scanBatchId || undefined,
                scannedSerialId: scanSerialId || undefined,
                pickedQty,
                idempotencyKey: `pick-${confirmTarget.id}-${Date.now()}`,
            })
            pushToast('success', 'Confirmed', `Pick confirmed for task ${confirmTarget.taskNumber}.`)
            setConfirmOpen(false)
            fetchTasks()
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || 'Confirm failed')
        }
    }, [confirmTarget, pickedQty, scanBinId, scanMaterialId, scanBatchId, scanSerialId, fetchTasks])

    const handleCancel = useCallback(async (task: PickingTask) => {
        try {
            await pickingService.cancel(task.id)
            pushToast('success', 'Cancelled', `Task ${task.taskNumber} cancelled.`)
            fetchTasks()
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || 'Cancel failed')
        }
    }, [fetchTasks])

    const handleCheckBoxChange = useCallback((checked: boolean, row: PickingTask) => {
        setSelectedRows((prev) => { const next = new Set(prev); checked ? next.add(row.id) : next.delete(row.id); return next })
    }, [])
    const handleSelectAllChange = useCallback((checked: boolean, rows: { original: PickingTask }[]) => {
        setSelectedRows((prev) => { const next = new Set(prev); for (const r of rows) { checked ? next.add(r.original.id) : next.delete(r.original.id) } return next })
    }, [])
    const handleBulkCancel = useCallback(async () => {
        setBulkCancelling(true)
        try {
            await Promise.all(Array.from(selectedRows).map((id) => pickingService.cancel(id)))
            pushToast('success', 'Bulk cancel', `${selectedRows.size} task(s) cancelled.`)
            setSelectedRows(new Set()); setBulkCancelOpen(false); fetchTasks()
        } catch { pushToast('danger', 'Error', 'Some cancellations failed') }
        finally { setBulkCancelling(false) }
    }, [selectedRows, fetchTasks])

    const toggleWaveTask = useCallback((taskId: string, checked: boolean) => {
        setWaveForm((prev) => {
            const ids = new Set(prev.taskIds || [])
            checked ? ids.add(taskId) : ids.delete(taskId)
            return { ...prev, taskIds: Array.from(ids) }
        })
    }, [])

    const columns = useMemo<ColumnDef<PickingTask>[]>(
        () => [
            {
                header: 'Task #',
                accessorKey: 'taskNumber',
                size: 130,
                minSize: 110,
                cell: ({ row }) => (
                    <span className="whitespace-nowrap font-mono text-xs font-semibold text-primary">{row.original.taskNumber}</span>
                ),
            },
            {
                header: 'Wave',
                accessorKey: 'waveId',
                size: 120,
                minSize: 100,
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-sm">{row.original.wave?.waveNumber || '—'}</span>
                ),
            },
            {
                header: 'Source Bin',
                accessorKey: 'sourceBinId',
                size: 120,
                minSize: 100,
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-xs text-gray-500">{row.original.sourceBin?.code || '—'}</span>
                ),
            },
            {
                header: 'Material',
                accessorKey: 'materialId',
                size: 240,
                minSize: 180,
                cell: ({ row }) => {
                    const m = row.original.material
                    return m ? (
                        <span className="truncate text-sm">{m.materialCode} — {m.materialName}</span>
                    ) : <span className="text-sm text-gray-400">—</span>
                },
            },
            {
                header: 'Required Qty',
                accessorKey: 'requiredQty',
                size: 110,
                minSize: 90,
                cell: ({ row }) => <span className="text-sm font-medium">{row.original.requiredQty.toLocaleString()}</span>,
            },
            {
                header: 'Picked Qty',
                accessorKey: 'pickedQty',
                size: 110,
                minSize: 90,
                cell: ({ row }) => <span className="text-sm font-medium">{row.original.pickedQty.toLocaleString()}</span>,
            },
            {
                header: 'Worker',
                accessorKey: 'assignedUser',
                size: 140,
                minSize: 110,
                cell: ({ row }) => (
                    <span className="text-sm">{row.original.assignedUser || <span className="text-gray-400">Unassigned</span>}</span>
                ),
            },
            {
                header: 'Priority',
                accessorKey: 'priority',
                size: 90,
                minSize: 80,
                cell: ({ row }) => {
                    const p = row.original.priority
                    const cls = PRIORITY_COLOR[p] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                    return <Tag className={cls}>{p === 1 ? 'High' : p === 2 ? 'Medium' : 'Low'}</Tag>
                },
            },
            {
                header: 'Status',
                accessorKey: 'status',
                size: 130,
                minSize: 110,
                cell: ({ row }) => <StatusBadge tone={STATUS_TONE[row.original.status] ?? 'default'}>{row.original.status.replace(/_/g, ' ')}</StatusBadge>,
            },
            {
                id: 'actions',
                header: '',
                enableSorting: false,
                size: 56,
                cell: ({ row }) => {
                    const t = row.original
                    const canAssign = t.status === 'OPEN' || t.status === 'ASSIGNED'
                    const canConfirm = t.status === 'ASSIGNED' || t.status === 'IN_PROGRESS' || t.status === 'PARTIALLY_PICKED'
                    const canCancel = t.status !== 'COMPLETED' && t.status !== 'CANCELLED'
                    return (
                        <Dropdown renderTitle={<EllipsisButton />} placement="bottom-end">
                            {canAssign && <Dropdown.Item eventKey="assign" onClick={() => openAssign(t)}><HiOutlineUserAdd className="text-base" /><span>Assign</span></Dropdown.Item>}
                            {canConfirm && <Dropdown.Item eventKey="confirm" onClick={() => openConfirm(t)}><HiOutlineCheckCircle className="text-base" /><span>Confirm Pick</span></Dropdown.Item>}
                            {canCancel && <Dropdown.Item eventKey="cancel" onClick={() => handleCancel(t)}><HiOutlineXCircle className="text-base text-red-500" /><span className="text-red-500">Cancel</span></Dropdown.Item>}
                        </Dropdown>
                    )
                },
            },
        ],
        [openAssign, openConfirm, handleCancel],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Picking"
                description="Reservation → pick task → bin strategy (FIFO/FEFO/Wave/Zone/Nearest) → scan confirm. Partial picks stay PARTIALLY_PICKED. Stock posts on Goods Issue."
                actions={
                    <div className="flex gap-2">
                        <Button variant="solid" size="sm" icon={<HiOutlinePlus />} onClick={openCreate}>Create Pick Task</Button>
                        <Button variant="solid" size="sm" icon={<HiOutlineCollection />} onClick={openWaveDialog}>Create Wave</Button>
                    </div>
                }
            />

            <AdaptiveCard className="mt-4">
                <Tabs value={statusTab} onChange={(val) => { setStatusTab(val as string); setPage(1) }}>
                    <Tabs.TabList>
                        {STATUS_TABS.map((t) => (
                            <Tabs.TabNav key={t} value={t}>{t === 'All' ? 'All' : t.replace(/_/g, ' ')}</Tabs.TabNav>
                        ))}
                    </Tabs.TabList>
                </Tabs>
            </AdaptiveCard>

            <AdaptiveCard className="mt-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <Input prefix={<HiOutlineSearch className="text-lg" />} placeholder="Search task #, material…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
                    <Select<FilterOption> placeholder="Warehouse" options={warehouseOptions} value={warehouseOptions.find((o) => o.value === warehouseFilter)} onChange={(opt) => { setWarehouseFilter(opt?.value ?? ''); setPage(1) }} />
                </div>

                {selectedRows.size > 0 && (
                    <div className="mt-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 dark:border-red-500/30 dark:bg-red-500/10">
                        <span className="text-sm font-medium text-red-700 dark:text-red-300">{selectedRows.size} item{selectedRows.size > 1 ? 's' : ''} selected</span>
                        <div className="ml-auto flex items-center gap-2">
                            <Button size="xs" onClick={() => setSelectedRows(new Set())}>Clear</Button>
                            <Button size="xs" variant="solid" customColorClass={() => 'bg-red-500 hover:bg-red-600 text-white'} icon={<HiOutlineXCircle />} onClick={() => setBulkCancelOpen(true)}>Cancel selected</Button>
                        </div>
                    </div>
                )}

                <div className="mt-4">
                    <DataTable<PickingTask>
                        columns={columns}
                        data={tasks}
                        compact
                        loading={loading}
                        selectable
                        checkboxChecked={(row) => selectedRows.has(row.id)}
                        onCheckBoxChange={handleCheckBoxChange}
                        onIndeterminateCheckBoxChange={(checked, rows) => handleSelectAllChange(checked, rows as any)}
                        noData={!loading && tasks.length === 0}
                        pagingData={{ total: meta.total, pageIndex: page, pageSize }}
                        onPaginationChange={setPage}
                        onSelectChange={(size) => { setPageSize(size); setPage(1) }}
                    />
                </div>
            </AdaptiveCard>

            {/* Create Pick Task Dialog */}
            <FormDialog
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                size="md"
                title="New Pick Task"
                icon={<HiOutlineClipboardList />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" onClick={handleCreateSave} disabled={!createForm.warehouseId || !createForm.sourceBinId || !createForm.materialId || !createForm.requiredQty}>Create</Button>
                    </>
                }
            >
                <FormItem label="Warehouse" asterisk>
                    <Select<FilterOption>
                        placeholder="Select warehouse"
                        options={warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }))}
                        value={warehouses.filter((w) => w.id === createForm.warehouseId).map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }))[0]}
                        onChange={(opt) => { setCreateForm({ ...createForm, warehouseId: opt?.value ?? '' }); loadBins(opt?.value ?? '') }}
                    />
                </FormItem>
                <FormItem label="Source Bin" asterisk>
                    <Select<FilterOption>
                        placeholder="Select bin"
                        options={binOptions}
                        value={binOptions.find((o) => o.value === createForm.sourceBinId)}
                        onChange={(opt) => setCreateForm({ ...createForm, sourceBinId: opt?.value ?? '' })}
                    />
                </FormItem>
                <FormItem label="Material" asterisk>
                    <Select<FilterOption>
                        placeholder="Select material"
                        options={materialOptions}
                        value={materialOptions.find((o) => o.value === createForm.materialId)}
                        onChange={(opt) => setCreateForm({ ...createForm, materialId: opt?.value ?? '' })}
                    />
                </FormItem>
                <div className="grid grid-cols-2 gap-3">
                    <FormItem label="Required Qty" asterisk>
                        <Input type="number" min={1} value={createForm.requiredQty ?? ''} onChange={(e) => setCreateForm({ ...createForm, requiredQty: Number(e.target.value) })} placeholder="0" />
                    </FormItem>
                    <FormItem label="Priority">
                        <Select<FilterOption>
                            placeholder="Priority"
                            options={[{ value: '1', label: 'High' }, { value: '2', label: 'Medium' }, { value: '3', label: 'Low' }]}
                            value={createForm.priority ? { value: String(createForm.priority), label: createForm.priority === 1 ? 'High' : createForm.priority === 2 ? 'Medium' : 'Low' } : undefined}
                            onChange={(opt) => setCreateForm({ ...createForm, priority: opt ? Number(opt.value) : undefined })}
                        />
                    </FormItem>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <FormItem label="Batch ID"><Input value={createForm.batchId ?? ''} onChange={(e) => setCreateForm({ ...createForm, batchId: e.target.value || undefined })} placeholder="Optional" /></FormItem>
                    <FormItem label="Serial ID"><Input value={createForm.serialId ?? ''} onChange={(e) => setCreateForm({ ...createForm, serialId: e.target.value || undefined })} placeholder="Optional" /></FormItem>
                </div>
            </FormDialog>

            {/* Create Wave Dialog */}
            <FormDialog
                isOpen={waveOpen}
                onClose={() => setWaveOpen(false)}
                size="lg"
                title="New Pick Wave"
                icon={<HiOutlineCollection />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setWaveOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" onClick={handleWaveSave} disabled={!waveForm.warehouseId || !waveForm.taskIds?.length}>Create Wave</Button>
                    </>
                }
            >
                <FormItem label="Warehouse" asterisk>
                    <Select<FilterOption>
                        placeholder="Select warehouse"
                        options={warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }))}
                        value={warehouses.filter((w) => w.id === waveForm.warehouseId).map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }))[0]}
                        onChange={(opt) => { setWaveForm({ ...waveForm, warehouseId: opt?.value ?? '', taskIds: [] }); loadWaveTasks(opt?.value ?? '') }}
                    />
                </FormItem>
                <FormItem label="Strategy">
                    <Select<FilterOption>
                        placeholder="Pick strategy"
                        options={STRATEGY_OPTIONS}
                        value={STRATEGY_OPTIONS.find((o) => o.value === waveForm.strategy)}
                        onChange={(opt) => setWaveForm({ ...waveForm, strategy: opt?.value ?? '' })}
                    />
                </FormItem>
                <div className="mt-3">
                    <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                        Select tasks to include ({waveForm.taskIds?.length || 0} selected)
                    </p>
                    {waveTasksLoading && <p className="text-sm text-gray-400">Loading tasks…</p>}
                    {!waveTasksLoading && waveTasks.length === 0 && waveForm.warehouseId && (
                        <p className="text-sm text-gray-400">No open or assigned tasks found for this warehouse.</p>
                    )}
                    {!waveTasksLoading && waveTasks.length > 0 && (
                        <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2 dark:border-gray-600">
                            {waveTasks.map((t) => (
                                <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <Checkbox
                                        checked={waveForm.taskIds?.includes(t.id) || false}
                                        onChange={(checked) => toggleWaveTask(t.id, checked as boolean)}
                                    />
                                    <span className="font-mono text-xs">{t.taskNumber}</span>
                                    <span className="text-xs text-gray-500">{t.material?.materialCode}</span>
                                    <span className="ml-auto text-xs text-gray-400">{t.status}</span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>
            </FormDialog>

            {/* Assign Dialog */}
            <FormDialog
                isOpen={assignOpen}
                onClose={() => setAssignOpen(false)}
                size="sm"
                title="Assign Task"
                description={assignTarget ? `Assign task ${assignTarget.taskNumber} to a worker.` : undefined}
                icon={<HiOutlineUserAdd />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setAssignOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" onClick={handleAssign} disabled={!assignUser.trim()}>Assign</Button>
                    </>
                }
            >
                <FormItem label="Assigned User" asterisk>
                    <Input value={assignUser} onChange={(e) => setAssignUser(e.target.value)} placeholder="Enter username or worker ID" />
                </FormItem>
            </FormDialog>

            {/* Confirm Pick Dialog — scan bin → material → batch/serial → qty */}
            <FormDialog
                isOpen={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                size="md"
                title="Confirm Pick (Scan)"
                icon={<HiOutlineCheckCircle />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setConfirmOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" onClick={handleConfirmPick} disabled={pickedQty <= 0 || !scanBinId || !scanMaterialId}>Confirm</Button>
                    </>
                }
            >
                {confirmTarget && (
                    <div className="mb-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
                        <p className="text-sm"><span className="text-gray-500">Task:</span> <span className="font-mono font-semibold">{confirmTarget.taskNumber}</span></p>
                        <p className="text-sm"><span className="text-gray-500">Required Qty:</span> <span className="font-semibold">{confirmTarget.requiredQty}</span></p>
                        <p className="text-sm"><span className="text-gray-500">Already Picked:</span> <span className="font-semibold">{confirmTarget.pickedQty}</span></p>
                    </div>
                )}
                <div className="space-y-3">
                    <FormItem label="Scan Source Bin" asterisk>
                        <Input value={scanBinId} onChange={(e) => setScanBinId(e.target.value)} placeholder="Bin ID / barcode" />
                    </FormItem>
                    <FormItem label="Scan Material" asterisk>
                        <Input value={scanMaterialId} onChange={(e) => setScanMaterialId(e.target.value)} placeholder="Material ID / barcode" />
                    </FormItem>
                    <FormItem label="Scan Batch (if required)">
                        <Input value={scanBatchId} onChange={(e) => setScanBatchId(e.target.value)} placeholder="Batch ID" />
                    </FormItem>
                    <FormItem label="Scan Serial (if required)">
                        <Input value={scanSerialId} onChange={(e) => setScanSerialId(e.target.value)} placeholder="Serial ID" />
                    </FormItem>
                    <FormItem label="Picked Qty" asterisk>
                        <Input type="number" min={0} value={pickedQty} onChange={(e) => setPickedQty(Number(e.target.value))} />
                    </FormItem>
                </div>
            </FormDialog>

            {/* Bulk cancel confirm */}
            <ConfirmDialog isOpen={bulkCancelOpen} type="danger" title={`Cancel ${selectedRows.size} task(s)?`} confirmText={`Cancel ${selectedRows.size}`} onRequestClose={() => setBulkCancelOpen(false)} onCancel={() => setBulkCancelOpen(false)} onConfirm={handleBulkCancel} confirmButtonProps={{ loading: bulkCancelling, customColorClass: () => 'bg-red-500 hover:bg-red-500/90 text-white' }}>
                <p>Are you sure you want to cancel <span className="font-semibold">{selectedRows.size}</span> selected picking task{selectedRows.size > 1 ? 's' : ''}?</p>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default PickingPage
