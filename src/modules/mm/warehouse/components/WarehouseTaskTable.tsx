'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
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
    HiOutlineCheckCircle,
    HiOutlineExclamation,
    HiOutlinePlay,
    HiOutlineRefresh,
    HiOutlineSearch,
    HiOutlineUserAdd,
} from 'react-icons/hi'
import { warehouseTaskService } from '../services/warehouseTaskService'
import WarehouseAssignWorkerDialog from './WarehouseAssignWorkerDialog'
import { useMmFilterRefs } from '@/modules/mm/shared/useLazyMmRefs'
import type {
    WarehouseTask,
    WarehouseTaskQueryParams,
    WarehouseTaskStatus,
    WarehouseTaskType,
} from '../types'
import {
    WmAnimatedStatus,
    WmAssigneeCell,
    WmProductLineCell,
    WmProgressQtyCell,
    WmTaskLocationHint,
    WmWarehouseTaskCell,
    wmTableRowEnterClass,
} from './WarehouseTableCells'

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger'> =
    {
        PENDING: 'warning',
        ASSIGNED: 'default',
        IN_PROGRESS: 'success',
        PARTIALLY_COMPLETED: 'warning',
        COMPLETED: 'success',
        CANCELLED: 'danger',
        EXCEPTION: 'danger',
    }

const TASK_TYPES: WarehouseTaskType[] = [
    'PICK',
    'TRANSFER',
    'REPLENISHMENT',
    'RELOCATION',
    'COUNT',
]
const OPEN_STATUSES: WarehouseTaskStatus[] = [
    'PENDING',
    'ASSIGNED',
    'IN_PROGRESS',
    'PARTIALLY_COMPLETED',
    'EXCEPTION',
]

function taskHasAssignee(task: WarehouseTask) {
    return Boolean(task.assignedUserId?.trim())
}

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

type Props = {
    mode: 'queue' | 'my' | 'exceptions'
    title?: string
}

export default function WarehouseTaskTable({ mode }: Props) {
    const [tasks, setTasks] = useState<WarehouseTask[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [search, setSearch] = useState('')
    const [taskType, setTaskType] = useState('')
    const [status, setStatus] = useState(mode === 'exceptions' ? 'EXCEPTION' : '')
    const [warehouseId, setWarehouseId] = useState('')
    const { warehouses: warehouseFilterOpts } = useMmFilterRefs('warehouses')

    const [assignOpen, setAssignOpen] = useState(false)
    const [assignInitialUserId, setAssignInitialUserId] = useState('')
    const [activeTask, setActiveTask] = useState<WarehouseTask | null>(null)
    const [completeOpen, setCompleteOpen] = useState(false)
    const [completeQty, setCompleteQty] = useState('')
    const [completeBinId, setCompleteBinId] = useState('')
    const [exceptionOpen, setExceptionOpen] = useState(false)
    const [exceptionCode, setExceptionCode] = useState('WRONG_BIN')
    const [exceptionDetails, setExceptionDetails] = useState('')
    const [actionLoading, setActionLoading] = useState(false)

    const fetchTasks = useCallback(async () => {
        setLoading(true)
        try {
            const params: WarehouseTaskQueryParams = {
                page,
                pageSize,
                search: search || undefined,
                taskType: (taskType as WarehouseTaskType) || undefined,
                warehouseId: warehouseId || undefined,
            }
            if (mode === 'exceptions') {
                params.status = 'EXCEPTION'
            } else if (status) {
                params.status = status as WarehouseTaskStatus
            } else if (mode === 'my') {
                params.status = undefined
            } else {
                params.status = undefined
            }

            const res =
                mode === 'my'
                    ? await warehouseTaskService.myTasks(params)
                    : await warehouseTaskService.list({
                          ...params,
                          status:
                              mode === 'exceptions'
                                  ? 'EXCEPTION'
                                  : params.status,
                      })

            const filtered =
                mode === 'my' && !status
                    ? res.data.filter((t) => OPEN_STATUSES.includes(t.status))
                    : res.data

            setTasks(filtered)
            setTotal(mode === 'my' && !status ? filtered.length : res.total)
        } catch {
            pushToast('danger', 'Load failed', 'Could not load warehouse tasks')
        } finally {
            setLoading(false)
        }
    }, [mode, page, pageSize, search, taskType, status, warehouseId])

    useEffect(() => {
        fetchTasks()
    }, [fetchTasks])

    const runAction = useCallback(
        async (fn: () => Promise<unknown>, success: string) => {
            setActionLoading(true)
            try {
                await fn()
                pushToast('success', 'Success', success)
                setAssignOpen(false)
                setCompleteOpen(false)
                setExceptionOpen(false)
                setActiveTask(null)
                await fetchTasks()
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Action failed'
                pushToast('danger', 'Error', msg)
            } finally {
                setActionLoading(false)
            }
        },
        [fetchTasks],
    )

    const openAssign = useCallback((t: WarehouseTask) => {
        setActiveTask(t)
        setAssignInitialUserId(t.assignedUserId ?? '')
        setAssignOpen(true)
    }, [])

    const openComplete = useCallback((t: WarehouseTask) => {
        if (!taskHasAssignee(t)) {
            pushToast(
                'danger',
                'Worker required',
                'Assign a worker before completing this task.',
            )
            return
        }
        setActiveTask(t)
        const remaining = Number(t.quantity) - Number(t.completedQuantity)
        setCompleteQty(String(Math.max(0, remaining)))
        setCompleteBinId(t.destinationBinId ?? t.sourceBinId ?? '')
        setCompleteOpen(true)
    }, [])

    const openException = useCallback((t: WarehouseTask) => {
        setActiveTask(t)
        setExceptionOpen(true)
    }, [])

    const columns = useMemo<ColumnDef<WarehouseTask>[]>(
        () => [
            {
                header: 'Task',
                accessorKey: 'taskNumber',
                size: 200,
                minSize: 160,
                cell: ({ row }) => (
                    <WmWarehouseTaskCell
                        taskNumber={row.original.taskNumber}
                        taskType={row.original.taskType}
                        warehouse={row.original.warehouse}
                        priority={row.original.priority}
                    />
                ),
            },
            {
                header: 'Work',
                id: 'work',
                size: 200,
                minSize: 140,
                cell: ({ row }) => {
                    const m = row.original.material
                    const name = m?.materialName ?? '—'
                    const code = m?.materialCode ?? null
                    return (
                        <div className="min-w-0">
                            <WmProductLineCell name={name} code={code} />
                            <WmTaskLocationHint
                                sourceBinId={row.original.sourceBinId}
                                destinationBinId={row.original.destinationBinId}
                            />
                        </div>
                    )
                },
            },
            {
                header: 'Progress',
                id: 'progress',
                size: 120,
                minSize: 100,
                cell: ({ row }) => (
                    <WmProgressQtyCell
                        done={Number(row.original.completedQuantity)}
                        total={Number(row.original.quantity)}
                        label="Done"
                        tone="pick"
                    />
                ),
            },
            {
                header: 'Assignee',
                accessorKey: 'assignedUserId',
                size: 140,
                minSize: 120,
                meta: { className: 'hidden lg:table-cell' },
                cell: ({ row }) => (
                    <WmAssigneeCell
                        assignedUserId={row.original.assignedUserId}
                    />
                ),
            },
            {
                header: 'Status',
                accessorKey: 'status',
                size: 130,
                minSize: 110,
                cell: ({ row }) => (
                    <WmAnimatedStatus
                        status={row.original.status}
                        tone={STATUS_TONE[row.original.status] ?? 'default'}
                    />
                ),
            },
            {
                header: '',
                id: 'actions',
                size: 52,
                minSize: 48,
                enableSorting: false,
                cell: ({ row }) => {
                    const t = row.original
                    const hasAssignee = taskHasAssignee(t)
                    const showStart = [
                        'PENDING',
                        'ASSIGNED',
                        'PARTIALLY_COMPLETED',
                    ].includes(t.status)
                    const showComplete = [
                        'IN_PROGRESS',
                        'PARTIALLY_COMPLETED',
                        'ASSIGNED',
                    ].includes(t.status)
                    const canAssign =
                        t.status === 'PENDING' || t.status === 'ASSIGNED'
                    const canException = !['COMPLETED', 'CANCELLED'].includes(
                        t.status,
                    )
                    const assigneeHint = 'Assign a worker first'
                    return (
                        <Dropdown
                            renderTitle={<EllipsisButton />}
                            placement="bottom-end"
                        >
                            {canAssign ? (
                                <Dropdown.Item
                                    eventKey="assign"
                                    onClick={() => openAssign(t)}
                                >
                                    <HiOutlineUserAdd className="text-base" />
                                    <span>Assign</span>
                                </Dropdown.Item>
                            ) : null}
                            {showStart ? (
                                <Dropdown.Item
                                    eventKey="start"
                                    disabled={!hasAssignee}
                                    onClick={() => {
                                        void runAction(
                                            () =>
                                                warehouseTaskService.start(
                                                    t.id,
                                                ),
                                            'Task started',
                                        )
                                    }}
                                >
                                    <HiOutlinePlay className="text-base" />
                                    <span className="flex min-w-0 flex-col">
                                        <span>Start</span>
                                        {!hasAssignee ? (
                                            <span className="text-xs font-normal text-gray-400">
                                                {assigneeHint}
                                            </span>
                                        ) : null}
                                    </span>
                                </Dropdown.Item>
                            ) : null}
                            {showComplete ? (
                                <Dropdown.Item
                                    eventKey="complete"
                                    disabled={!hasAssignee}
                                    onClick={() => openComplete(t)}
                                >
                                    <HiOutlineCheckCircle className="text-base" />
                                    <span className="flex min-w-0 flex-col">
                                        <span>Complete</span>
                                        {!hasAssignee ? (
                                            <span className="text-xs font-normal text-gray-400">
                                                {assigneeHint}
                                            </span>
                                        ) : null}
                                    </span>
                                </Dropdown.Item>
                            ) : null}
                            {canException ? (
                                <Dropdown.Item
                                    eventKey="exception"
                                    onClick={() => openException(t)}
                                >
                                    <HiOutlineExclamation className="text-base text-amber-500" />
                                    <span>Report exception</span>
                                </Dropdown.Item>
                            ) : null}
                            {t.status === 'EXCEPTION' ? (
                                <Dropdown.Item
                                    eventKey="release"
                                    onClick={() =>
                                        void runAction(
                                            () =>
                                                warehouseTaskService.releaseException(
                                                    t.id,
                                                ),
                                            'Exception released',
                                        )
                                    }
                                >
                                    <HiOutlineRefresh className="text-base" />
                                    <span>Release exception</span>
                                </Dropdown.Item>
                            ) : null}
                        </Dropdown>
                    )
                },
            },
        ],
        [openAssign, openComplete, openException, runAction],
    )

    const warehouseOptions = [
        { value: '', label: 'All warehouses' },
        ...warehouseFilterOpts,
    ]
    const typeOptions = [
        { value: '', label: 'All types' },
        ...TASK_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, ' ') })),
    ]
    const statusOptions = [
        { value: '', label: 'All open' },
        ...OPEN_STATUSES.map((s) => ({
            value: s,
            label: s.replace(/_/g, ' '),
        })),
    ]

    const openCount = useMemo(
        () => tasks.filter((t) => OPEN_STATUSES.includes(t.status)).length,
        [tasks],
    )

    return (
        <>
            <AdaptiveCard>
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Input
                        className="sm:col-span-2 xl:col-span-1"
                        prefix={<HiOutlineSearch className="text-lg" />}
                        value={search}
                        placeholder="Task # or reference…"
                        onChange={(e) => {
                            setSearch(e.target.value)
                            setPage(1)
                        }}
                    />
                    <Select
                        placeholder="Warehouse"
                        options={warehouseOptions}
                        value={warehouseOptions.find(
                            (o) => o.value === warehouseId,
                        )}
                        onChange={(o) => {
                            setWarehouseId((o as { value: string })?.value ?? '')
                            setPage(1)
                        }}
                    />
                    <Select
                        placeholder="Task type"
                        options={typeOptions}
                        value={typeOptions.find((o) => o.value === taskType)}
                        onChange={(o) => {
                            setTaskType((o as { value: string })?.value ?? '')
                            setPage(1)
                        }}
                    />
                    {mode !== 'exceptions' ? (
                        <Select
                            placeholder="Status"
                            options={statusOptions}
                            value={statusOptions.find((o) => o.value === status)}
                            onChange={(o) => {
                                setStatus((o as { value: string })?.value ?? '')
                                setPage(1)
                            }}
                        />
                    ) : (
                        <div className="flex items-center justify-end">
                            <Button
                                size="sm"
                                icon={<HiOutlineRefresh />}
                                onClick={() => {
                                    setPage(1)
                                    void fetchTasks()
                                }}
                            >
                                Refresh
                            </Button>
                        </div>
                    )}
                </div>

                {!loading && tasks.length > 0 ? (
                    <p className="mb-3 text-xs text-gray-500">
                        {openCount} open on this page · {total} total matching
                    </p>
                ) : null}

                <DataTable
                    columns={columns}
                    data={tasks}
                    compact
                    fit
                    loading={loading}
                    getRowId={(row) => row.id}
                    rowClassName={(_, index) => wmTableRowEnterClass(index)}
                    noData={!loading && tasks.length === 0}
                    pagingData={{ total, pageIndex: page - 1, pageSize }}
                    onPaginationChange={(p) => setPage(p + 1)}
                    onSelectChange={(size) => {
                        setPageSize(size)
                        setPage(1)
                    }}
                />
            </AdaptiveCard>

            <WarehouseAssignWorkerDialog
                isOpen={assignOpen}
                taskNumber={activeTask?.taskNumber}
                companyId={activeTask?.companyId}
                warehouseId={activeTask?.warehouseId}
                initialUserId={assignInitialUserId}
                confirmLoading={actionLoading}
                onClose={() => setAssignOpen(false)}
                onConfirm={(userId) => {
                    if (!activeTask) return
                    return runAction(
                        () => warehouseTaskService.assign(activeTask.id, userId),
                        'Task assigned',
                    )
                }}
            />

            <FormDialog
                isOpen={completeOpen}
                title="Complete Task"
                onClose={() => setCompleteOpen(false)}
                onSubmit={() => {
                    if (!activeTask) return
                    return runAction(
                        () =>
                            warehouseTaskService.complete(activeTask.id, {
                                quantity: Number(completeQty),
                                destinationBinId:
                                    activeTask.taskType === 'RELOCATION'
                                        ? completeBinId
                                        : undefined,
                                sourceBinId:
                                    activeTask.taskType === 'PICK'
                                        ? completeBinId
                                        : undefined,
                                scannedBinId: completeBinId || undefined,
                            }),
                        'Task completed',
                    )
                }}
                confirmLoading={actionLoading}
            >
                <FormItem label="Quantity">
                    <Input
                        type="number"
                        value={completeQty}
                        onChange={(e) => setCompleteQty(e.target.value)}
                    />
                </FormItem>
                {(activeTask?.taskType === 'PICK' ||
                    activeTask?.taskType === 'RELOCATION') && (
                    <FormItem label="Bin ID">
                        <Input
                            value={completeBinId}
                            onChange={(e) => setCompleteBinId(e.target.value)}
                            placeholder="Storage bin ID"
                        />
                    </FormItem>
                )}
            </FormDialog>

            <FormDialog
                isOpen={exceptionOpen}
                title="Report Exception"
                onClose={() => setExceptionOpen(false)}
                onSubmit={() => {
                    if (!activeTask) return
                    return runAction(
                        () =>
                            warehouseTaskService.reportException(
                                activeTask.id,
                                {
                                    exceptionCode,
                                    details: exceptionDetails,
                                },
                            ),
                        'Exception reported',
                    )
                }}
                confirmLoading={actionLoading}
            >
                <FormItem label="Code">
                    <Select
                        options={[
                            'WRONG_BIN',
                            'WRONG_MATERIAL',
                            'WRONG_BATCH',
                            'WRONG_SERIAL',
                            'QUANTITY_MISMATCH',
                            'INSUFFICIENT_STOCK',
                            'DAMAGED_STOCK',
                            'BLOCKED_LOCATION',
                        ].map((c) => ({ value: c, label: c.replace(/_/g, ' ') }))}
                        value={{
                            value: exceptionCode,
                            label: exceptionCode.replace(/_/g, ' '),
                        }}
                        onChange={(o) =>
                            setExceptionCode(
                                (o as { value: string })?.value ?? 'WRONG_BIN',
                            )
                        }
                    />
                </FormItem>
                <FormItem label="Details">
                    <Input
                        value={exceptionDetails}
                        onChange={(e) => setExceptionDetails(e.target.value)}
                    />
                </FormItem>
            </FormDialog>
        </>
    )
}
