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
import { assignedWorkerName } from '../types'
import { pickWaveService } from '../services/pickWaveService'
import {
    useMmFilterRefs,
    useLazyBinsForWarehouse,
    useLazyMaterialEntities,
    useLazyWarehouseEntities,
} from '@/modules/mm/shared/useLazyMmRefs'
import Dialog from '@/components/ui/Dialog'
import type {
    PickingTask,
    PickingQueryParams,
    CreatePickingTaskPayload,
    CreatePickWavePayload,
    AssignableWorker,
    StorageBin,
} from '../types'
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

function pushToast(type: 'success' | 'danger' | 'warning', title: string, msg: string) {
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

    const { warehouses: warehouseFilterOpts } = useMmFilterRefs('warehouses')
    const { ensure: ensureWarehouses, rows: warehouseEntities } = useLazyWarehouseEntities()
    const { ensure: ensureMaterials, rows: materials } = useLazyMaterialEntities()
    const { loadForWarehouse, rows: bins } = useLazyBinsForWarehouse()

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
    const [assignGroupTasks, setAssignGroupTasks] = useState<PickingTask[]>([])
    const [assignUserId, setAssignUserId] = useState('')
    const [assignWorkers, setAssignWorkers] = useState<AssignableWorker[]>([])
    const [tasksListOpen, setTasksListOpen] = useState(false)
    /**
     * Live tasks shown in the modal, derived from the grouped table rows by a
     * stable group key — assign/confirm/cancel refreshes reflect instantly
     * instead of showing a stale snapshot of the dialog.
     */
    const [tasksListKey, setTasksListKey] = useState('')
    /** Multi-select inside the tasks dialog + shared worker for batch assign. */
    const [tasksSelectedIds, setTasksSelectedIds] = useState<Set<string>>(new Set())
    const [batchAssignUserId, setBatchAssignUserId] = useState('')
    const [batchConfirmOpen, setBatchConfirmOpen] = useState(false)
    const [batchConfirmLoading, setBatchConfirmLoading] = useState(false)

    /** Active workers for the assign dropdown (company-scoped by the API). */
    useEffect(() => {
        pickingService
            .assignableUsers()
            .then(setAssignWorkers)
            .catch(() => undefined)
    }, [])

    const assignWorkerOptions = useMemo(
        () =>
            assignWorkers.map((w) => ({
                value: w.id,
                label: `${w.displayName} — ${w.email}`,
            })),
        [assignWorkers],
    )

    /**
     * One aggregated row per Sales Order item: serial-managed stock creates
     * one pick task per serial (qty 1 each), so the table shows the summed
     * quantity with the Sales Order reference instead of 18 tiny rows.
     */
    /** Stable group key: same SO + material + bin = one aggregated row. */
    const groupKeyOf = (t: PickingTask | undefined) =>
        t
            ? `${t.salesOrderId ?? 'no-so'}:${t.materialId}:${t.sourceBinId}`
            : 'no-so::'

    const groupedTasks = useMemo(() => {
        const STATUS_RANK: Record<string, number> = {
            OPEN: 0,
            ASSIGNED: 1,
            IN_PROGRESS: 2,
            PARTIALLY_PICKED: 3,
            COMPLETED: 4,
            CANCELLED: 5,
        }
        const groups = new Map<
            string,
            {
                tasks: PickingTask[]
                orderNumber: string | null
                requiredQty: number
                pickedQty: number
                assignedNames: string[]
                priority: number
                status: string
            }
        >()
        for (const t of tasks) {
            const key = groupKeyOf(t)
            let g = groups.get(key)
            if (!g) {
                g = {
                    tasks: [],
                    orderNumber: t.salesOrder?.orderNumber ?? null,
                    requiredQty: 0,
                    pickedQty: 0,
                    assignedNames: [],
                    priority: t.priority ?? 5,
                    status: t.status,
                }
                groups.set(key, g)
            }
            g.tasks.push(t)
            g.requiredQty += Number(t.requiredQty ?? 0)
            g.pickedQty += Number(t.pickedQty ?? 0)
            const name = assignedWorkerName(t.assignedUser, assignWorkers)
            if (name && !g.assignedNames.includes(name)) g.assignedNames.push(name)
            g.priority = Math.min(g.priority, t.priority ?? 5)
            const rank = STATUS_RANK[t.status] ?? 99
            const current = STATUS_RANK[g.status] ?? 99
            if (rank < current) g.status = t.status
        }
        return [...groups.values()]
    }, [tasks, assignWorkers])

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

    useEffect(() => {
        fetchTasks()
    }, [fetchTasks])

    const warehouseOptions = useMemo<FilterOption[]>(
        () => [{ value: '', label: 'All warehouses' }, ...warehouseFilterOpts],
        [warehouseFilterOpts],
    )

    const warehouses = warehouseEntities

    const binOptions = useMemo<FilterOption[]>(
        () => bins.map((b) => ({ value: b.id, label: b.code })),
        [bins],
    )

    const materialOptions = useMemo<FilterOption[]>(
        () => materials.map((m) => ({ value: m.id, label: `${m.materialCode} â€” ${m.materialName}` })),
        [materials],
    )

    const loadBins = useCallback((whId: string) => {
        void loadForWarehouse(whId)
    }, [loadForWarehouse])

    const openCreate = useCallback(async () => {
        await Promise.all([ensureWarehouses(), ensureMaterials()])
        setCreateForm({})
        setCreateOpen(true)
    }, [ensureWarehouses, ensureMaterials])

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

    const openAssign = useCallback(
        (task: PickingTask, group?: PickingTask[]) => {
            setAssignTarget(task)
            setAssignGroupTasks(group && group.length > 1 ? group : [task])
            setAssignUserId('')
            setAssignOpen(true)
        },
        [],
    )

    const handleAssign = useCallback(async () => {
        if (!assignTarget) return
        const ids = assignGroupTasks.length ? assignGroupTasks.map((t) => t.id) : [assignTarget.id]
        try {
            await Promise.all(ids.map((id) => pickingService.assign(id, { userId: assignUserId })))
            const worker = assignWorkers.find((w) => w.id === assignUserId)
            pushToast(
                'success',
                'Assigned',
                `${ids.length} task(s) assigned to ${worker?.displayName ?? 'worker'}.`,
            )
            setAssignOpen(false)
            fetchTasks()
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || 'Assign failed')
        }
    }, [assignTarget, assignGroupTasks, assignUserId, assignWorkers, fetchTasks])

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

    const handleGroupCheckBoxChange = useCallback((checked: boolean, row: PickGroupRow) => {
        setSelectedRows((prev) => {
            const next = new Set(prev)
            for (const t of row.tasks) { checked ? next.add(t.id) : next.delete(t.id) }
            return next
        })
    }, [])
    const handleGroupSelectAllChange = useCallback((checked: boolean, rows: { original: PickGroupRow }[]) => {
        setSelectedRows((prev) => {
            const next = new Set(prev)
            for (const r of rows) { for (const t of r.original.tasks) { checked ? next.add(t.id) : next.delete(t.id) } }
            return next
        })
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

    type PickGroupRow = {
    key: string
    tasks: PickingTask[]
    orderNumber: string | null
    material: PickingTask['material']
    sourceBin: PickingTask['sourceBin']
    requiredQty: number
    pickedQty: number
    assignedNames: string[]
    priority: number
    status: string
}

const groupRows = useMemo<PickGroupRow[]>(
    () =>
        groupedTasks.map((g) => ({
            key: groupKeyOf(g.tasks[0]),
            tasks: g.tasks,
            orderNumber: g.orderNumber,
            material: g.tasks[0]?.material,
            sourceBin: g.tasks[0]?.sourceBin,
            requiredQty: g.requiredQty,
            pickedQty: g.pickedQty,
            assignedNames: g.assignedNames,
            priority: g.priority,
            status: g.status,
        })),
    [groupedTasks],
)

/** Live task rows for the open modal — follows table refreshes by group key. */
const tasksListGroup = useMemo(
    () => groupRows.find((g) => g.key === tasksListKey)?.tasks ?? [],
    [groupRows, tasksListKey],
)

const openTasksList = (group: PickGroupRow) => {
    setTasksListKey(group.key)
    setTasksSelectedIds(new Set())
    setBatchAssignUserId('')
    setTasksListOpen(true)
}

    /** OPEN/ASSIGNED tasks can be (re)assigned. */
    const isTaskAssignable = (t: PickingTask) =>
        t.status === 'OPEN' || t.status === 'ASSIGNED'

    /** Assign every selected task to one worker (partial failures reported). */
    const handleBatchAssign = useCallback(async () => {
        const ids = Array.from(tasksSelectedIds)
        if (!ids.length || !batchAssignUserId) return
        const results = await Promise.allSettled(
            ids.map((id) =>
                pickingService.assign(id, { userId: batchAssignUserId }),
            ),
        )
        const okIds = new Set<string>()
        results.forEach((r, i) => {
            if (r.status === 'fulfilled') okIds.add(ids[i])
        })
        const ok = okIds.size
        const failed = ids.length - ok
        const worker = assignWorkers.find((w) => w.id === batchAssignUserId)
        if (failed === 0) {
            pushToast(
                'success',
                'Assigned',
                `${ok} task(s) assigned to ${worker?.displayName ?? 'worker'}.`,
            )
        } else {
            pushToast(
                'warning',
                'Partially assigned',
                `${ok} of ${ids.length} task(s) assigned to ${
                    worker?.displayName ?? 'worker'
                }; ${failed} failed.`,
            )
        }
        // The modal list is derived from the refreshed table — the new
        // assignee/status appears immediately after fetchTasks.
        setTasksSelectedIds(new Set())
        fetchTasks()
    }, [
        tasksSelectedIds,
        batchAssignUserId,
        assignWorkers,
        fetchTasks,
        pushToast,
    ])

    const tasksAssignableIds = useMemo(
        () => tasksListGroup.filter(isTaskAssignable).map((t) => t.id),
        [tasksListGroup],
    )
    const allTasksSelected =
        tasksAssignableIds.length > 0 &&
        tasksAssignableIds.every((id) => tasksSelectedIds.has(id))

    /** Anything not yet finished can be confirmed (scan data comes from the task). */
    const isTaskConfirmable = (t: PickingTask) =>
        t.status !== 'COMPLETED' && t.status !== 'CANCELLED'

    const selectedConfirmableTasks = useMemo(
        () =>
            tasksListGroup.filter(
                (t) => tasksSelectedIds.has(t.id) && isTaskConfirmable(t),
            ),
        [tasksListGroup, tasksSelectedIds],
    )

    /**
     * Batch confirm: each selected task is confirmed with its own bin/material/
     * batch/serial (the same values the scan dialog prefills), so serial-managed
     * picks complete one-per-serial without opening 10 dialogs.
     */
    const handleBatchConfirm = useCallback(async () => {
        if (!selectedConfirmableTasks.length) return
        setBatchConfirmLoading(true)
        try {
            const results = await Promise.allSettled(
                selectedConfirmableTasks.map((t) =>
                    pickingService.confirmPick(t.id, {
                        scannedBinId: t.sourceBinId,
                        scannedMaterialId: t.materialId,
                        scannedBatchId: t.batchId || undefined,
                        scannedSerialId: t.serialId || undefined,
                        pickedQty: Math.max(
                            1,
                            (t.requiredQty || 1) - (t.pickedQty || 0),
                        ),
                        idempotencyKey: `pick-${t.id}-${Date.now()}`,
                    }),
                ),
            )
            const okIds = new Set<string>()
            let failed = 0
            results.forEach((r, i) => {
                if (r.status === 'fulfilled') okIds.add(selectedConfirmableTasks[i].id)
                else failed++
            })
            if (failed === 0 && okIds.size > 0) {
                pushToast(
                    'success',
                    'Confirmed',
                    `${okIds.size} pick(s) confirmed.`,
                )
            } else if (okIds.size > 0) {
                pushToast(
                    'warning',
                    'Partially confirmed',
                    `${okIds.size} of ${selectedConfirmableTasks.length} pick(s) confirmed; ${failed} failed.`,
                )
            } else {
                pushToast(
                    'danger',
                    'Confirm failed',
                    'No picks were confirmed — check task statuses.',
                )
            }
            setTasksSelectedIds((prev) => {
                const next = new Set(prev)
                okIds.forEach((id) => next.delete(id))
                return next
            })
            setBatchConfirmOpen(false)
            // Table refresh rebuilds the derived modal list → rows flip to
            // COMPLETED live.
            fetchTasks()
        } finally {
            setBatchConfirmLoading(false)
        }
    }, [selectedConfirmableTasks, fetchTasks, pushToast])

const columns = useMemo<ColumnDef<PickGroupRow>[]>(
    () => [
        {
            header: 'Picking Number',
            accessorKey: 'tasks',
            size: 150,
            minSize: 120,
            cell: ({ row }) => {
                const first = row.original.tasks[0]
                const count = row.original.tasks.length
                return (
                    <span className="whitespace-nowrap font-mono text-xs font-semibold text-primary">
                        {first?.taskNumber ?? '—'}
                        {count > 1 ? ` +${count - 1}` : ''}
                    </span>
                )
            },
        },
        {
            header: 'Sales Order',
            accessorKey: 'orderNumber',
            size: 130,
            minSize: 110,
            cell: ({ row }) => (
                <span className="whitespace-nowrap font-mono text-xs">
                    {row.original.orderNumber || '—'}
                </span>
            ),
        },
        {
            header: 'Bin',
            accessorKey: 'sourceBin',
            size: 120,
            minSize: 100,
            cell: ({ row }) => (
                <span className="whitespace-nowrap text-xs text-gray-500">
                    {row.original.sourceBin?.code || '—'}
                </span>
            ),
        },
        {
            header: 'Item',
            accessorKey: 'material',
            size: 240,
            minSize: 180,
            cell: ({ row }) => {
                const m = row.original.material
                return m ? (
                    <span className="truncate text-sm">
                        {m.materialCode} — {m.materialName}
                    </span>
                ) : (
                    <span className="text-sm text-gray-400">—</span>
                )
            },
        },
        {
            header: 'Qty To Pick',
            accessorKey: 'requiredQty',
            size: 110,
            minSize: 90,
            cell: ({ row }) => (
                <span className="text-sm font-medium">
                    {row.original.requiredQty.toLocaleString()}
                </span>
            ),
        },
        {
            header: 'Picked Qty',
            accessorKey: 'pickedQty',
            size: 110,
            minSize: 90,
            cell: ({ row }) => (
                <span className="text-sm font-medium">
                    {row.original.pickedQty.toLocaleString()}
                </span>
            ),
        },
        {
            header: 'Assigned User',
            accessorKey: 'assignedNames',
            size: 160,
            minSize: 110,
            cell: ({ row }) => (
                <span className="text-sm">
                    {row.original.assignedNames.length ? (
                        row.original.assignedNames.join(', ')
                    ) : (
                        <span className="text-gray-400">Unassigned</span>
                    )}
                </span>
            ),
        },
        {
            header: 'Priority',
            accessorKey: 'priority',
            size: 90,
            minSize: 80,
            cell: ({ row }) => {
                const p = row.original.priority
                const cls =
                    PRIORITY_COLOR[p] ||
                    'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                return (
                    <Tag className={cls}>
                        {p === 1 ? 'High' : p === 2 ? 'Medium' : 'Low'}
                    </Tag>
                )
            },
        },
        {
            header: 'Status',
            accessorKey: 'status',
            size: 130,
            minSize: 110,
            cell: ({ row }) => (
                <StatusBadge
                    tone={STATUS_TONE[row.original.status] ?? 'default'}
                >
                    {row.original.status.replace(/_/g, ' ')}
                </StatusBadge>
            ),
        },
        {
            id: 'actions',
            header: '',
            enableSorting: false,
            size: 64,
            cell: ({ row }) => {
                const g = row.original
                const first = g.tasks[0]
                const canAssign =
                    g.status === 'OPEN' || g.status === 'ASSIGNED'
                const canConfirm =
                    g.tasks.length === 1 &&
                    (g.status === 'ASSIGNED' ||
                        g.status === 'IN_PROGRESS' ||
                        g.status === 'PARTIALLY_PICKED')
                const canCancel =
                    g.status !== 'COMPLETED' && g.status !== 'CANCELLED'
                return (
                    <Dropdown
                        renderTitle={<EllipsisButton />}
                        placement="bottom-end"
                    >
                        {canAssign && first ? (
                            <Dropdown.Item
                                eventKey="assign"
                                onClick={() => openAssign(first, g.tasks)}
                            >
                                <HiOutlineUserAdd className="text-base" />
                                <span>Assign</span>
                            </Dropdown.Item>
                        ) : null}
                        {g.tasks.length > 1 ? (
                            <Dropdown.Item
                                eventKey="tasks"
                                onClick={() => openTasksList(g)}
                            >
                                <HiOutlineClipboardList className="text-base" />
                                <span>Tasks ({g.tasks.length})</span>
                            </Dropdown.Item>
                        ) : null}
                        {first && canConfirm ? (
                            <Dropdown.Item
                                eventKey="confirm"
                                onClick={() => openConfirm(first)}
                            >
                                <HiOutlineCheckCircle className="text-base" />
                                <span>Confirm Pick</span>
                            </Dropdown.Item>
                        ) : null}
                        {canCancel ? (
                            <Dropdown.Item
                                eventKey="cancel"
                                onClick={() => {
                                    void Promise.all(
                                        g.tasks.map((t) =>
                                            pickingService.cancel(t.id),
                                        ),
                                    )
                                        .then(() => {
                                            pushToast(
                                                'success',
                                                'Cancelled',
                                                `${g.tasks.length} task(s) cancelled.`,
                                            )
                                            fetchTasks()
                                        })
                                        .catch(() =>
                                            pushToast(
                                                'danger',
                                                'Error',
                                                'Some cancellations failed',
                                            ),
                                        )
                                }}
                            >
                                <HiOutlineXCircle className="text-base text-red-500" />
                                <span className="text-red-500">Cancel</span>
                            </Dropdown.Item>
                        ) : null}
                    </Dropdown>
                )
            },
        },
    ],
    [openAssign, openConfirm, fetchTasks, pushToast],
)

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Picking"
                description="Reservation â†’ pick task â†’ bin strategy (FIFO/FEFO/Wave/Zone/Nearest) â†’ scan confirm. Partial picks stay PARTIALLY_PICKED. Stock posts on Goods Issue."
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
                    <Input prefix={<HiOutlineSearch className="text-lg" />} placeholder="Search task #, materialâ€¦" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
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
                    <DataTable<PickGroupRow>
                        columns={columns}
                        data={groupRows}
                        compact
                        loading={loading}
                        selectable
                        checkboxChecked={(row) => row.tasks.some((t) => selectedRows.has(t.id))}
                        onCheckBoxChange={handleGroupCheckBoxChange}
                        onIndeterminateCheckBoxChange={(checked, rows) => handleGroupSelectAllChange(checked, rows as any)}
                        noData={!loading && groupRows.length === 0}
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
                        options={warehouses.map((w) => ({ value: w.id, label: `${w.code} â€” ${w.name}` }))}
                        value={warehouses.filter((w) => w.id === createForm.warehouseId).map((w) => ({ value: w.id, label: `${w.code} â€” ${w.name}` }))[0]}
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
                        options={warehouses.map((w) => ({ value: w.id, label: `${w.code} â€” ${w.name}` }))}
                        value={warehouses.filter((w) => w.id === waveForm.warehouseId).map((w) => ({ value: w.id, label: `${w.code} â€” ${w.name}` }))[0]}
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
                    {waveTasksLoading && <p className="text-sm text-gray-400">Loading tasksâ€¦</p>}
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
                        <Button size="sm" variant="solid" onClick={handleAssign} disabled={!assignUserId.trim()}>Assign</Button>
                    </>
                }
            >
                <FormItem label="Assigned User" asterisk>
                    <Select
                        isSearchable
                        placeholder="Search worker (name, email)…"
                        options={assignWorkerOptions}
                        value={
                            assignWorkerOptions.find(
                                (o) => o.value === assignUserId,
                            ) ?? null
                        }
                        onChange={(option) =>
                            setAssignUserId(option?.value ?? '')
                        }
                    />
                </FormItem>
            </FormDialog>

            {/* Group tasks dialog (serial-managed stock: one task per serial) */}
            <Dialog
                isOpen={tasksListOpen}
                width={640}
                onClose={() => setTasksListOpen(false)}
                onRequestClose={() => setTasksListOpen(false)}
            >
                <h5 className="mb-1 font-semibold text-gray-900 dark:text-gray-100">
                    Pick tasks
                </h5>
                <p className="mb-3 text-sm text-gray-500">
                    Serial-managed stock creates one picking task per serial.
                    Select multiple tasks and assign them all to one worker —
                    confirm and cancel stay per task (scan flow).
                </p>

                {/* Batch assign bar */}
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800/60">
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                        <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 accent-primary"
                            checked={allTasksSelected}
                            disabled={!tasksAssignableIds.length}
                            onChange={(e) =>
                                setTasksSelectedIds(
                                    e.target.checked
                                        ? new Set(tasksAssignableIds)
                                        : new Set(),
                                )
                            }
                        />
                        Select all
                    </label>
                    <span className="text-xs text-gray-500">
                        {tasksSelectedIds.size} selected
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                        <div className="w-60">
                            <Select
                                size="sm"
                                isSearchable
                                placeholder="Assign selected to…"
                                options={assignWorkerOptions}
                                value={
                                    assignWorkerOptions.find(
                                        (o) => o.value === batchAssignUserId,
                                    ) ?? null
                                }
                                onChange={(option) =>
                                    setBatchAssignUserId(option?.value ?? '')
                                }
                            />
                        </div>
                        <Button
                            size="sm"
                            variant="solid"
                            disabled={
                                !tasksSelectedIds.size || !batchAssignUserId
                            }
                            onClick={handleBatchAssign}
                        >
                            Assign selected
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            disabled={!selectedConfirmableTasks.length}
                            onClick={() => setBatchConfirmOpen(true)}
                        >
                            Confirm selected
                            {selectedConfirmableTasks.length
                                ? ` (${selectedConfirmableTasks.length})`
                                : ''}
                        </Button>
                    </div>
                </div>

                <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
                    {tasksListGroup.map((t) => (
                        <li
                            key={t.id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm dark:border-gray-700"
                        >
                            <span className="flex min-w-0 items-center gap-2">
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 shrink-0 rounded border-gray-300 accent-primary"
                                    checked={tasksSelectedIds.has(t.id)}
                                    disabled={!isTaskAssignable(t)}
                                    onChange={(e) =>
                                        setTasksSelectedIds((prev) => {
                                            const next = new Set(prev)
                                            if (e.target.checked) next.add(t.id)
                                            else next.delete(t.id)
                                            return next
                                        })
                                    }
                                />
                                <span className="min-w-0">
                                    <span className="font-mono text-xs font-semibold">
                                        {t.taskNumber}
                                    </span>
                                    <span className="ml-2 text-xs text-gray-500">
                                        serial{' '}
                                        {t.serialId
                                            ? `…${t.serialId.slice(-6)}`
                                            : 'n/a'}{' '}
                                        · req {t.requiredQty} ·{' '}
                                        <span
                                            className={
                                                t.status === 'COMPLETED'
                                                    ? 'font-medium text-emerald-600 dark:text-emerald-400'
                                                    : t.status === 'CANCELLED'
                                                      ? 'font-medium text-red-500'
                                                      : ''
                                            }
                                        >
                                            {t.status}
                                        </span>
                                        {t.assignedUser
                                            ? ` · ${
                                                  assignedWorkerName(
                                                      t.assignedUser,
                                                      assignWorkers,
                                                  ) ?? t.assignedUser
                                              }`
                                            : ''}
                                    </span>
                                </span>
                            </span>
                            <span className="flex shrink-0 gap-1">
                                <Button
                                    size="xs"
                                    variant="plain"
                                    disabled={!isTaskAssignable(t)}
                                    onClick={() => {
                                        // Close this dialog first — otherwise it
                                        // stacks on top of the Assign modal.
                                        setTasksListOpen(false)
                                        openAssign(t)
                                    }}
                                >
                                    Assign
                                </Button>
                                <Button
                                    size="xs"
                                    variant="plain"
                                    disabled={!isTaskConfirmable(t)}
                                    onClick={() => {
                                        setTasksListOpen(false)
                                        openConfirm(t)
                                    }}
                                >
                                    Confirm
                                </Button>
                                <Button
                                    size="xs"
                                    variant="plain"
                                    className="!text-red-500"
                                    onClick={async () => {
                                        await handleCancel(t)
                                        setTasksSelectedIds((prev) => {
                                            const next = new Set(prev)
                                            next.delete(t.id)
                                            return next
                                        })
                                    }}
                                >
                                    Cancel
                                </Button>
                            </span>
                        </li>
                    ))}
                </ul>
            </Dialog>

            {/* Batch confirm (multi-select in the tasks dialog) */}
            <ConfirmDialog
                isOpen={batchConfirmOpen}
                title={`Confirm ${selectedConfirmableTasks.length} pick(s)?`}
                confirmText="Confirm picks"
                onRequestClose={() => setBatchConfirmOpen(false)}
                onCancel={() => setBatchConfirmOpen(false)}
                onConfirm={handleBatchConfirm}
                confirmButtonProps={{ loading: batchConfirmLoading }}
            >
                <p>
                    Confirms the picked bin / material / batch / serial for{' '}
                    <span className="font-semibold">
                        {selectedConfirmableTasks.length}
                    </span>{' '}
                    selected task(s) using each task&rsquo;s remaining quantity.
                    Stock still posts only on Goods Issue.
                </p>
            </ConfirmDialog>

            {/* Confirm Pick Dialog â€” scan bin â†’ material â†’ batch/serial â†’ qty */}
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
