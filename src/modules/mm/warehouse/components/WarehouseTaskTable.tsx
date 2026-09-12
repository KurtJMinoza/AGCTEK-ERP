'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlinePlay, HiOutlineUserAdd, HiOutlineCheckCircle, HiOutlineExclamation } from 'react-icons/hi'
import { warehouseTaskService } from '../services/warehouseTaskService'
import { warehouseService } from '../services/warehouseService'
import type { Warehouse, WarehouseTask, WarehouseTaskQueryParams, WarehouseTaskStatus, WarehouseTaskType } from '../types'

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger'> = {
    PENDING: 'warning',
    ASSIGNED: 'default',
    IN_PROGRESS: 'success',
    PARTIALLY_COMPLETED: 'warning',
    COMPLETED: 'success',
    CANCELLED: 'danger',
    EXCEPTION: 'danger',
}

const TASK_TYPES: WarehouseTaskType[] = ['PUTAWAY', 'PICK', 'TRANSFER', 'REPLENISHMENT', 'RELOCATION', 'COUNT']
const OPEN_STATUSES: WarehouseTaskStatus[] = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'PARTIALLY_COMPLETED', 'EXCEPTION']

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(<Notification type={type} title={title} closable duration={3500}>{msg}</Notification>, { placement: 'top-end' })
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
    const [warehouses, setWarehouses] = useState<Warehouse[]>([])

    const [assignOpen, setAssignOpen] = useState(false)
    const [assignUserId, setAssignUserId] = useState('')
    const [activeTask, setActiveTask] = useState<WarehouseTask | null>(null)
    const [completeOpen, setCompleteOpen] = useState(false)
    const [completeQty, setCompleteQty] = useState('')
    const [completeBinId, setCompleteBinId] = useState('')
    const [exceptionOpen, setExceptionOpen] = useState(false)
    const [exceptionCode, setExceptionCode] = useState('WRONG_BIN')
    const [exceptionDetails, setExceptionDetails] = useState('')
    const [actionLoading, setActionLoading] = useState(false)

    useEffect(() => {
        warehouseService.list({ status: 'ACTIVE', limit: 100 }).then((r) => setWarehouses(r.data)).catch(() => {})
    }, [])

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
                          status: mode === 'exceptions' ? 'EXCEPTION' : params.status,
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

    const runAction = async (fn: () => Promise<unknown>, success: string) => {
        setActionLoading(true)
        try {
            await fn()
            pushToast('success', 'Success', success)
            setAssignOpen(false)
            setCompleteOpen(false)
            setExceptionOpen(false)
            setActiveTask(null)
            fetchTasks()
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Action failed'
            pushToast('danger', 'Error', msg)
        } finally {
            setActionLoading(false)
        }
    }

    const columns = useMemo<ColumnDef<WarehouseTask>[]>(
        () => [
            {
                header: 'Task #',
                accessorKey: 'taskNumber',
                size: 140,
                cell: ({ row }) => (
                    <span className="font-mono text-xs font-semibold text-primary">{row.original.taskNumber}</span>
                ),
            },
            {
                header: 'Type',
                accessorKey: 'taskType',
                size: 100,
                cell: ({ row }) => <span className="text-sm">{row.original.taskType}</span>,
            },
            {
                header: 'Material',
                accessorKey: 'materialId',
                size: 200,
                cell: ({ row }) => {
                    const m = row.original.material
                    return <span className="truncate text-sm">{m ? `${m.materialCode} — ${m.materialName}` : '—'}</span>
                },
            },
            {
                header: 'Progress',
                size: 120,
                cell: ({ row }) => (
                    <span className="text-sm">
                        {Number(row.original.completedQuantity).toLocaleString()} / {Number(row.original.quantity).toLocaleString()}
                    </span>
                ),
            },
            {
                header: 'Assignee',
                accessorKey: 'assignedUserId',
                size: 120,
                cell: ({ row }) => (
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                        {row.original.assignedUserId || 'Unassigned'}
                    </span>
                ),
            },
            {
                header: 'Status',
                accessorKey: 'status',
                size: 130,
                cell: ({ row }) => (
                    <StatusBadge tone={STATUS_TONE[row.original.status] ?? 'default'}>{row.original.status}</StatusBadge>
                ),
            },
            {
                header: 'Actions',
                size: 220,
                cell: ({ row }) => {
                    const t = row.original
                    const canStart = ['PENDING', 'ASSIGNED', 'PARTIALLY_COMPLETED'].includes(t.status)
                    const canComplete = ['IN_PROGRESS', 'PARTIALLY_COMPLETED', 'ASSIGNED'].includes(t.status)
                    const canAssign = t.status === 'PENDING' || t.status === 'ASSIGNED'
                    const canException = !['COMPLETED', 'CANCELLED'].includes(t.status)
                    return (
                        <div className="flex flex-wrap gap-1">
                            {canAssign && (
                                <Button
                                    size="xs"
                                    icon={<HiOutlineUserAdd />}
                                    onClick={() => {
                                        setActiveTask(t)
                                        setAssignUserId(t.assignedUserId ?? '')
                                        setAssignOpen(true)
                                    }}
                                >
                                    Assign
                                </Button>
                            )}
                            {canStart && (
                                <Button
                                    size="xs"
                                    icon={<HiOutlinePlay />}
                                    onClick={() => runAction(() => warehouseTaskService.start(t.id), 'Task started')}
                                >
                                    Start
                                </Button>
                            )}
                            {canComplete && (
                                <Button
                                    size="xs"
                                    icon={<HiOutlineCheckCircle />}
                                    onClick={() => {
                                        setActiveTask(t)
                                        const remaining = Number(t.quantity) - Number(t.completedQuantity)
                                        setCompleteQty(String(remaining))
                                        setCompleteBinId(t.destinationBinId ?? t.sourceBinId ?? '')
                                        setCompleteOpen(true)
                                    }}
                                >
                                    Complete
                                </Button>
                            )}
                            {canException && (
                                <Button
                                    size="xs"
                                    variant="plain"
                                    icon={<HiOutlineExclamation />}
                                    onClick={() => {
                                        setActiveTask(t)
                                        setExceptionOpen(true)
                                    }}
                                >
                                    Exception
                                </Button>
                            )}
                            {t.status === 'EXCEPTION' && (
                                <Button
                                    size="xs"
                                    onClick={() =>
                                        runAction(() => warehouseTaskService.releaseException(t.id), 'Exception released')
                                    }
                                >
                                    Release
                                </Button>
                            )}
                        </div>
                    )
                },
            },
        ],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    )

    const warehouseOptions = [{ value: '', label: 'All warehouses' }, ...warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }))]
    const typeOptions = [{ value: '', label: 'All types' }, ...TASK_TYPES.map((t) => ({ value: t, label: t }))]
    const statusOptions = [{ value: '', label: 'All open' }, ...OPEN_STATUSES.map((s) => ({ value: s, label: s }))]

    return (
        <>
            <AdaptiveCard>
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end">
                    <FormItem label="Search" className="mb-0 flex-1">
                        <Input value={search} placeholder="Task # or reference…" onChange={(e) => setSearch(e.target.value)} />
                    </FormItem>
                    <FormItem label="Warehouse" className="mb-0 w-full lg:w-48">
                        <Select options={warehouseOptions} value={warehouseOptions.find((o) => o.value === warehouseId)} onChange={(o) => setWarehouseId((o as { value: string })?.value ?? '')} />
                    </FormItem>
                    <FormItem label="Type" className="mb-0 w-full lg:w-40">
                        <Select options={typeOptions} value={typeOptions.find((o) => o.value === taskType)} onChange={(o) => setTaskType((o as { value: string })?.value ?? '')} />
                    </FormItem>
                    {mode !== 'exceptions' && (
                        <FormItem label="Status" className="mb-0 w-full lg:w-44">
                            <Select options={statusOptions} value={statusOptions.find((o) => o.value === status)} onChange={(o) => setStatus((o as { value: string })?.value ?? '')} />
                        </FormItem>
                    )}
                    <Button className="lg:mb-0.5" onClick={() => { setPage(1); fetchTasks() }}>Refresh</Button>
                </div>

                <DataTable
                    columns={columns}
                    data={tasks}
                    loading={loading}
                    noData={!loading && tasks.length === 0}
                    pagingData={{ total, pageIndex: page - 1, pageSize }}
                    onPaginationChange={(p) => setPage(p + 1)}
                    onSelectChange={(size) => { setPageSize(size); setPage(1) }}
                />
            </AdaptiveCard>

            <FormDialog isOpen={assignOpen} title="Assign Task" onClose={() => setAssignOpen(false)} onSubmit={() => activeTask && runAction(() => warehouseTaskService.assign(activeTask.id, assignUserId), 'Task assigned')} confirmLoading={actionLoading}>
                <FormItem label="User ID">
                    <Input value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)} placeholder="Worker user ID" />
                </FormItem>
            </FormDialog>

            <FormDialog isOpen={completeOpen} title="Complete Task" onClose={() => setCompleteOpen(false)} onSubmit={() => activeTask && runAction(() => warehouseTaskService.complete(activeTask.id, {
                quantity: Number(completeQty),
                destinationBinId: activeTask.taskType === 'PUTAWAY' || activeTask.taskType === 'RELOCATION' ? completeBinId : undefined,
                sourceBinId: activeTask.taskType === 'PICK' ? completeBinId : undefined,
                scannedBinId: completeBinId || undefined,
            }), 'Task completed')} confirmLoading={actionLoading}>
                <FormItem label="Quantity">
                    <Input type="number" value={completeQty} onChange={(e) => setCompleteQty(e.target.value)} />
                </FormItem>
                {(activeTask?.taskType === 'PUTAWAY' || activeTask?.taskType === 'PICK' || activeTask?.taskType === 'RELOCATION') && (
                    <FormItem label="Bin ID">
                        <Input value={completeBinId} onChange={(e) => setCompleteBinId(e.target.value)} placeholder="Storage bin ID" />
                    </FormItem>
                )}
            </FormDialog>

            <FormDialog isOpen={exceptionOpen} title="Report Exception" onClose={() => setExceptionOpen(false)} onSubmit={() => activeTask && runAction(() => warehouseTaskService.reportException(activeTask.id, { exceptionCode, details: exceptionDetails }), 'Exception reported')} confirmLoading={actionLoading}>
                <FormItem label="Code">
                    <Select
                        options={['WRONG_BIN', 'WRONG_MATERIAL', 'WRONG_BATCH', 'WRONG_SERIAL', 'QUANTITY_MISMATCH', 'INSUFFICIENT_STOCK', 'DAMAGED_STOCK', 'BLOCKED_LOCATION'].map((c) => ({ value: c, label: c }))}
                        value={{ value: exceptionCode, label: exceptionCode }}
                        onChange={(o) => setExceptionCode((o as { value: string })?.value ?? 'WRONG_BIN')}
                    />
                </FormItem>
                <FormItem label="Details">
                    <Input value={exceptionDetails} onChange={(e) => setExceptionDetails(e.target.value)} />
                </FormItem>
            </FormDialog>
        </>
    )
}
