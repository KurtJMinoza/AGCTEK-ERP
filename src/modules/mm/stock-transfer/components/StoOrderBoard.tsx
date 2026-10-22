'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import FormDialog from '@/components/shared/FormDialog'
import EllipsisButton from '@/components/shared/EllipsisButton'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Dropdown from '@/components/ui/Dropdown'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { HiOutlineEye, HiOutlineSearch } from 'react-icons/hi'
import { stockTransferOrderService } from '../services/stockTransferOrderService'
import type { StockTransferOrder, StoQueryParams, StoStatus } from '../types'
import { errMsg, fmtStoDate, STO_STATUS_TONE } from './StoStatusTone'
import InfoCard from '../../shared/InfoCard'
import {
    StoCreatedCell,
    StoFulfillmentCell,
    StoOrderIdentityCell,
    StoRouteCell,
    StoStatusCell,
    stoTableRowEnterClass,
} from './StoTableCells'

type FilterOption = { value: string; label: string }

export type StoAction =
    | 'submit'
    | 'approve'
    | 'allocate'
    | 'dispatch'
    | 'receive'
    | 'cancel'

type Props = {
    title?: string
    fixedStatuses?: StoStatus[]
    statusFilterOptions?: FilterOption[]
    allowedActions?: StoAction[]
    showSummary?: boolean
    emptyMessage?: string
}

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

export default function StoOrderBoard({
    fixedStatuses,
    statusFilterOptions,
    allowedActions = ['submit', 'approve', 'allocate', 'dispatch', 'receive', 'cancel'],
    showSummary = true,
    emptyMessage = 'No stock transfer orders found.',
}: Props) {
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [rows, setRows] = useState<StockTransferOrder[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [actionBusy, setActionBusy] = useState<string | null>(null)

    const [detailOpen, setDetailOpen] = useState(false)
    const [detail, setDetail] = useState<StockTransferOrder | null>(null)
    const [detailLoading, setDetailLoading] = useState(false)

    const queryParams = useMemo<StoQueryParams>(() => {
        const params: StoQueryParams = {
            page,
            pageSize,
            search: search || undefined,
        }
        if (fixedStatuses?.length === 1) {
            params.status = fixedStatuses[0]
        } else if (statusFilter) {
            params.status = statusFilter
        }
        return params
    }, [page, pageSize, search, statusFilter, fixedStatuses])

    const fetchList = useCallback(async () => {
        setLoading(true)
        try {
            if (fixedStatuses && fixedStatuses.length > 1 && !statusFilter) {
                const results = await Promise.all(
                    fixedStatuses.map((status) =>
                        stockTransferOrderService.list({
                            ...queryParams,
                            status,
                            page: 1,
                            pageSize: 100,
                        }),
                    ),
                )
                const merged = results
                    .flatMap((r) => r.data)
                    .sort(
                        (a, b) =>
                            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
                    )
                const start = (page - 1) * pageSize
                setRows(merged.slice(start, start + pageSize))
                setTotal(merged.length)
            } else {
                const res = await stockTransferOrderService.list(queryParams)
                setRows(res.data)
                setTotal(res.total)
            }
        } catch (err) {
            console.error(err)
            pushToast('danger', 'Error', errMsg(err))
        } finally {
            setLoading(false)
        }
    }, [queryParams, fixedStatuses, statusFilter, page, pageSize])

    useEffect(() => {
        fetchList()
    }, [fetchList])

    const summary = useMemo(() => {
        const by = (s: string) => rows.filter((r) => r.status === s).length
        return {
            total,
            pending: by('PENDING_APPROVAL') + by('DRAFT') + by('SUBMITTED'),
            queue: by('APPROVED') + by('ALLOCATED') + by('PICKING'),
            transit: by('DISPATCHED') + by('IN_TRANSIT') + by('PARTIALLY_RECEIVED'),
        }
    }, [rows, total])

    const runAction = useCallback(
        async (id: string, action: StoAction) => {
            setActionBusy(`${id}:${action}`)
            try {
                if (action === 'submit') await stockTransferOrderService.submit(id)
                if (action === 'approve') await stockTransferOrderService.approve(id)
                if (action === 'allocate') await stockTransferOrderService.allocate(id)
                if (action === 'dispatch') await stockTransferOrderService.dispatch(id)
                if (action === 'receive') {
                    const order = await stockTransferOrderService.get(id)
                    const lines = order.lines
                        .map((l) => {
                            const open =
                                Number(l.dispatchedQty) - Number(l.receivedQty)
                            return open > 0
                                ? {
                                      orderLineId: l.id,
                                      quantity: open,
                                      destinationBinId: l.destinationBinId ?? undefined,
                                  }
                                : null
                        })
                        .filter(Boolean) as Array<{
                        orderLineId: string
                        quantity: number
                        destinationBinId?: string
                    }>
                    if (!lines.length) {
                        pushToast('danger', 'Receive', 'Nothing left to receive')
                        return
                    }
                    await stockTransferOrderService.receive(id, { lines })
                }
                if (action === 'cancel') await stockTransferOrderService.cancel(id)
                pushToast('success', 'Updated', `Order ${action} completed.`)
                fetchList()
                if (detailOpen && detail?.id === id) {
                    setDetail(await stockTransferOrderService.get(id))
                }
            } catch (err) {
                pushToast('danger', 'Error', errMsg(err))
            } finally {
                setActionBusy(null)
            }
        },
        [fetchList, detailOpen, detail?.id],
    )

    const openDetail = useCallback(async (id: string) => {
        setDetailOpen(true)
        setDetailLoading(true)
        try {
            setDetail(await stockTransferOrderService.get(id))
        } catch (err) {
            pushToast('danger', 'Error', errMsg(err))
            setDetailOpen(false)
        } finally {
            setDetailLoading(false)
        }
    }, [])

    const can = useCallback(
        (action: StoAction, status: string) => {
            if (!allowedActions.includes(action)) return false
            if (action === 'submit') return status === 'DRAFT'
            if (action === 'approve')
                return status === 'PENDING_APPROVAL' || status === 'SUBMITTED' || status === 'DRAFT'
            if (action === 'allocate') return status === 'APPROVED'
            if (action === 'dispatch') return status === 'ALLOCATED' || status === 'PICKING'
            if (action === 'receive')
                return (
                    status === 'DISPATCHED' ||
                    status === 'IN_TRANSIT' ||
                    status === 'PARTIALLY_RECEIVED'
                )
            if (action === 'cancel')
                return [
                    'DRAFT',
                    'SUBMITTED',
                    'PENDING_APPROVAL',
                    'APPROVED',
                    'ALLOCATED',
                    'PICKING',
                ].includes(status)
            return false
        },
        [allowedActions],
    )

    const columns = useMemo<ColumnDef<StockTransferOrder>[]>(
        () => [
            {
                header: 'Order',
                accessorKey: 'orderNumber',
                size: 168,
                minSize: 140,
                cell: ({ row }) => (
                    <StoOrderIdentityCell
                        orderNumber={row.original.orderNumber}
                        transferType={row.original.transferType}
                        onOpen={() => openDetail(row.original.id)}
                    />
                ),
            },
            {
                header: 'Route',
                id: 'route',
                size: 200,
                minSize: 160,
                cell: ({ row }) => (
                    <StoRouteCell
                        sourceCode={row.original.sourceWarehouse?.code}
                        sourceName={row.original.sourceWarehouse?.name}
                        destCode={row.original.destinationWarehouse?.code}
                        destName={row.original.destinationWarehouse?.name}
                    />
                ),
            },
            {
                header: 'Fulfillment',
                id: 'fulfillment',
                size: 130,
                minSize: 110,
                meta: { className: 'hidden md:table-cell' },
                cell: ({ row }) => (
                    <StoFulfillmentCell order={row.original} />
                ),
            },
            {
                header: 'Status',
                accessorKey: 'status',
                size: 130,
                minSize: 110,
                cell: ({ row }) => (
                    <StoStatusCell status={row.original.status} />
                ),
            },
            {
                header: 'Created',
                accessorKey: 'createdAt',
                size: 110,
                minSize: 96,
                meta: { className: 'hidden lg:table-cell' },
                cell: ({ row }) => (
                    <StoCreatedCell createdAt={row.original.createdAt} />
                ),
            },
            {
                header: '',
                id: 'actions',
                size: 52,
                minSize: 48,
                cell: ({ row }) => {
                    const o = row.original
                    const busy = actionBusy?.startsWith(o.id)
                    return (
                        <Dropdown renderTitle={<EllipsisButton />}>
                            <Dropdown.Item
                                eventKey="view"
                                onClick={() => openDetail(o.id)}
                            >
                                <HiOutlineEye className="text-lg" />
                                <span>View</span>
                            </Dropdown.Item>
                            {can('submit', o.status) && (
                                <Dropdown.Item
                                    eventKey="submit"
                                    disabled={!!busy}
                                    onClick={() => runAction(o.id, 'submit')}
                                >
                                    Submit
                                </Dropdown.Item>
                            )}
                            {can('approve', o.status) && (
                                <Dropdown.Item
                                    eventKey="approve"
                                    disabled={!!busy}
                                    onClick={() => runAction(o.id, 'approve')}
                                >
                                    Approve
                                </Dropdown.Item>
                            )}
                            {can('allocate', o.status) && (
                                <Dropdown.Item
                                    eventKey="allocate"
                                    disabled={!!busy}
                                    onClick={() => runAction(o.id, 'allocate')}
                                >
                                    Allocate
                                </Dropdown.Item>
                            )}
                            {can('dispatch', o.status) && (
                                <Dropdown.Item
                                    eventKey="dispatch"
                                    disabled={!!busy}
                                    onClick={() => runAction(o.id, 'dispatch')}
                                >
                                    Dispatch
                                </Dropdown.Item>
                            )}
                            {can('receive', o.status) && (
                                <Dropdown.Item
                                    eventKey="receive"
                                    disabled={!!busy}
                                    onClick={() => runAction(o.id, 'receive')}
                                >
                                    Receive
                                </Dropdown.Item>
                            )}
                            {can('cancel', o.status) && (
                                <Dropdown.Item
                                    eventKey="cancel"
                                    disabled={!!busy}
                                    onClick={() => runAction(o.id, 'cancel')}
                                >
                                    Cancel
                                </Dropdown.Item>
                            )}
                        </Dropdown>
                    )
                },
            },
        ],
        [actionBusy, can, openDetail, runAction],
    )

    return (
        <>
            {showSummary && (
                <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <InfoCard label="Total" value={String(summary.total)} />
                    <InfoCard label="Pending approval" value={String(summary.pending)} />
                    <InfoCard label="Ready / picking" value={String(summary.queue)} />
                    <InfoCard label="In transit" value={String(summary.transit)} />
                </div>
            )}

            <AdaptiveCard>
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_auto]">
                    <Input
                        prefix={<HiOutlineSearch className="text-lg" />}
                        placeholder="Search order #…"
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value)
                            setPage(1)
                        }}
                    />
                    {statusFilterOptions ? (
                        <Select
                            placeholder="Status"
                            options={statusFilterOptions}
                            value={
                                statusFilterOptions.find(
                                    (o) => o.value === statusFilter,
                                ) ?? statusFilterOptions[0]
                            }
                            onChange={(opt) => {
                                setStatusFilter(opt?.value ?? '')
                                setPage(1)
                            }}
                        />
                    ) : (
                        <div />
                    )}
                    <Button
                        className="sm:justify-self-end"
                        size="sm"
                        onClick={() => fetchList()}
                    >
                        Refresh
                    </Button>
                </div>

                {!loading && total > 0 ? (
                    <p className="mb-3 text-xs text-gray-500">
                        {rows.length} on this page · {total} total matching
                    </p>
                ) : null}

                <DataTable<StockTransferOrder>
                    columns={columns}
                    data={rows}
                    compact
                    fit
                    loading={loading}
                    getRowId={(row) => row.id}
                    rowClassName={(_, index) => stoTableRowEnterClass(index)}
                    noData={!loading && rows.length === 0}
                    pagingData={{
                        total,
                        pageIndex: page,
                        pageSize,
                    }}
                    onPaginationChange={(p) => setPage(p)}
                    onSelectChange={(size) => {
                        setPageSize(size)
                        setPage(1)
                    }}
                />
                {!loading && rows.length === 0 && (
                    <p className="mt-2 text-center text-sm text-gray-500">{emptyMessage}</p>
                )}
            </AdaptiveCard>

            <FormDialog
                isOpen={detailOpen}
                onClose={() => setDetailOpen(false)}
                title={detail?.orderNumber ?? 'Transfer order'}
                size="xl"
            >
                {detailLoading || !detail ? (
                    <p className="text-sm text-gray-500">Loading…</p>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                                <p className="text-gray-500">Status</p>
                                <StatusBadge tone={STO_STATUS_TONE[detail.status] ?? 'default'}>
                                    {detail.status}
                                </StatusBadge>
                            </div>
                            <div>
                                <p className="text-gray-500">Type</p>
                                <p>{detail.transferType.replaceAll('_', ' ')}</p>
                            </div>
                            <div>
                                <p className="text-gray-500">Source</p>
                                <p>
                                    {detail.sourceWarehouse?.code} —{' '}
                                    {detail.sourceWarehouse?.name}
                                </p>
                            </div>
                            <div>
                                <p className="text-gray-500">Destination</p>
                                <p>
                                    {detail.destinationWarehouse?.code} —{' '}
                                    {detail.destinationWarehouse?.name}
                                </p>
                            </div>
                        </div>
                        <div>
                            <h6 className="mb-2 text-sm font-semibold">Lines</h6>
                            <div className="space-y-2">
                                {detail.lines.map((l) => (
                                    <div
                                        key={l.id}
                                        className="rounded border border-gray-200 p-2 text-sm dark:border-gray-700"
                                    >
                                        <div className="font-medium">
                                            {l.material
                                                ? `${l.material.materialCode} — ${l.material.materialName}`
                                                : l.materialId}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            Qty {Number(l.quantity)} · Alloc{' '}
                                            {Number(l.allocatedQty)} · Disp{' '}
                                            {Number(l.dispatchedQty)} · Recv{' '}
                                            {Number(l.receivedQty)} · {l.status}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {(detail.shipments?.length ?? 0) > 0 && (
                            <div>
                                <h6 className="mb-2 text-sm font-semibold">Shipments</h6>
                                {detail.shipments!.map((s) => (
                                    <p key={s.id} className="text-sm">
                                        {s.shipmentNumber} — {s.status} (
                                        {fmtStoDate(s.dispatchedAt)})
                                    </p>
                                ))}
                            </div>
                        )}
                        {(detail.receipts?.length ?? 0) > 0 && (
                            <div>
                                <h6 className="mb-2 text-sm font-semibold">Receipts</h6>
                                {detail.receipts!.map((r) => (
                                    <p key={r.id} className="text-sm">
                                        {r.receiptNumber} — {r.status} (
                                        {fmtStoDate(r.receivedAt)})
                                    </p>
                                ))}
                            </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                            {can('submit', detail.status) && (
                                <Button
                                    size="sm"
                                    variant="solid"
                                    loading={actionBusy === `${detail.id}:submit`}
                                    onClick={() => runAction(detail.id, 'submit')}
                                >
                                    Submit
                                </Button>
                            )}
                            {can('approve', detail.status) && (
                                <Button
                                    size="sm"
                                    variant="solid"
                                    loading={actionBusy === `${detail.id}:approve`}
                                    onClick={() => runAction(detail.id, 'approve')}
                                >
                                    Approve
                                </Button>
                            )}
                            {can('allocate', detail.status) && (
                                <Button
                                    size="sm"
                                    variant="solid"
                                    loading={actionBusy === `${detail.id}:allocate`}
                                    onClick={() => runAction(detail.id, 'allocate')}
                                >
                                    Allocate
                                </Button>
                            )}
                            {can('dispatch', detail.status) && (
                                <Button
                                    size="sm"
                                    variant="solid"
                                    loading={actionBusy === `${detail.id}:dispatch`}
                                    onClick={() => runAction(detail.id, 'dispatch')}
                                >
                                    Dispatch
                                </Button>
                            )}
                            {can('receive', detail.status) && (
                                <Button
                                    size="sm"
                                    variant="solid"
                                    loading={actionBusy === `${detail.id}:receive`}
                                    onClick={() => runAction(detail.id, 'receive')}
                                >
                                    Receive all open
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </FormDialog>
        </>
    )
}
