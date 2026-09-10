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
import { FormItem } from '@/components/ui/Form'
import {
    HiOutlinePlus,
    HiOutlineSearch,
    HiOutlineEye,
    HiOutlineTrash,
    HiOutlineCheck,
    HiOutlineX,
    HiOutlineTruck,
    HiOutlineClipboardCheck,
    HiOutlineSwitchHorizontal,
} from 'react-icons/hi'
import { transferService } from '../services/transferService'
import { warehouseService } from '../services/warehouseService'
import { storageBinService } from '../services/storageBinService'
import { materialService } from '../../material-master/services/materialService'
import type {
    WarehouseTransfer,
    WarehouseTransferLine,
    TransferQueryParams,
    CreateTransferPayload,
    Warehouse,
    StorageBin,
} from '../types'
import type { Material } from '../../material-master/types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import InfoCard from '../../shared/InfoCard'

const ROUTE = '/modules/mm/warehouse-management/warehouse-transfers'

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger'> = {
    DRAFT: 'default',
    PENDING_APPROVAL: 'warning',
    APPROVED: 'success',
    READY_TO_PICK: 'warning',
    PICKED: 'success',
    DISPATCHED: 'warning',
    IN_TRANSIT: 'warning',
    PARTIALLY_RECEIVED: 'warning',
    RECEIVED: 'success',
    PUTAWAY: 'success',
    COMPLETED: 'success',
    CANCELLED: 'danger',
}

type FilterOption = { value: string; label: string }

const TAB_OPTIONS: { value: string; label: string }[] = [
    { value: '', label: 'All' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'IN_TRANSIT', label: 'In Transit' },
    { value: 'RECEIVED', label: 'Received' },
    { value: 'COMPLETED', label: 'Completed' },
]

type NewTransferLine = { materialId: string; quantity: number; sourceBinId?: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(<Notification type={type} title={title} closable duration={3500}>{msg}</Notification>, { placement: 'top-end' })
}

function fmtDate(iso?: string) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const TransfersPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)

    /* ── list state ── */
    const [search, setSearch] = useState('')
    const [statusTab, setStatusTab] = useState('')
    const [sourceWhFilter, setSourceWhFilter] = useState('')
    const [destWhFilter, setDestWhFilter] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)

    const [transfers, setTransfers] = useState<WarehouseTransfer[]>([])
    const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 0 })
    const [loading, setLoading] = useState(true)

    const queryParams = useMemo<TransferQueryParams>(
        () => ({
            page,
            limit: pageSize,
            search: search || undefined,
            status: statusTab || undefined,
            sourceWarehouseId: sourceWhFilter || undefined,
            destinationWarehouseId: destWhFilter || undefined,
            sortBy: 'createdAt',
            sortOrder: 'desc',
        }),
        [page, pageSize, search, statusTab, sourceWhFilter, destWhFilter],
    )

    const fetchList = useCallback(async () => {
        setLoading(true)
        try {
            const res = await transferService.list(queryParams)
            setTransfers(res.data)
            setMeta(res.meta)
        } catch (err) {
            console.error('Failed to fetch transfers', err)
        } finally {
            setLoading(false)
        }
    }, [queryParams])

    useEffect(() => { fetchList() }, [fetchList])

    /* ── warehouses for filters / selects ── */
    const [warehouses, setWarehouses] = useState<Warehouse[]>([])
    useEffect(() => {
        warehouseService.list({ limit: 500 }).then((r) => setWarehouses(Array.isArray(r) ? r : (r?.data ?? []))).catch(() => {})
    }, [])

    const warehouseOpts = useMemo<FilterOption[]>(
        () => [{ value: '', label: 'All warehouses' }, ...warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }))],
        [warehouses],
    )
    const warehouseSelectOpts = useMemo<FilterOption[]>(
        () => warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })),
        [warehouses],
    )

    /* ── materials / bins for create dialog ── */
    const [materials, setMaterials] = useState<Material[]>([])
    const [bins, setBins] = useState<StorageBin[]>([])
    useEffect(() => {
        materialService.list({ limit: 500 }).then((r) => setMaterials(Array.isArray(r) ? r : (r?.data ?? []))).catch(() => {})
        storageBinService.list({ limit: 500 }).then((r) => setBins(Array.isArray(r) ? r : (r?.data ?? []))).catch(() => {})
    }, [])

    const materialOpts = useMemo<FilterOption[]>(
        () => materials.map((m) => ({ value: m.id, label: `${m.materialCode} — ${m.materialName}` })),
        [materials],
    )
    const binOpts = useMemo<FilterOption[]>(
        () => [{ value: '', label: 'None' }, ...bins.map((b) => ({ value: b.id, label: b.code }))],
        [bins],
    )

    /* ── selection ── */
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
    const [bulkCancelOpen, setBulkCancelOpen] = useState(false)
    const [bulkCancelling, setBulkCancelling] = useState(false)

    const handleCheckBoxChange = useCallback((checked: boolean, row: WarehouseTransfer) => {
        setSelectedRows((prev) => { const next = new Set(prev); checked ? next.add(row.id) : next.delete(row.id); return next })
    }, [])
    const handleSelectAllChange = useCallback((checked: boolean, rows: { original: WarehouseTransfer }[]) => {
        setSelectedRows((prev) => { const next = new Set(prev); for (const r of rows) { checked ? next.add(r.original.id) : next.delete(r.original.id) } return next })
    }, [])

    const draftSelectedCount = useMemo(
        () => transfers.filter((t) => selectedRows.has(t.id) && t.status === 'DRAFT').length,
        [transfers, selectedRows],
    )

    const handleBulkCancel = useCallback(async () => {
        setBulkCancelling(true)
        try {
            const draftIds = transfers.filter((t) => selectedRows.has(t.id) && t.status === 'DRAFT').map((t) => t.id)
            await Promise.all(draftIds.map((id) => transferService.cancel(id)))
            pushToast('success', 'Bulk cancel', `${draftIds.length} transfer(s) cancelled.`)
            setSelectedRows(new Set())
            setBulkCancelOpen(false)
            fetchList()
        } catch { pushToast('danger', 'Error', 'Some cancellations failed') }
        finally { setBulkCancelling(false) }
    }, [transfers, selectedRows, fetchList])

    /* ── create dialog ── */
    const [createOpen, setCreateOpen] = useState(false)
    const [createForm, setCreateForm] = useState<{ sourceWarehouseId: string; destinationWarehouseId: string; requestedBy: string; notes: string }>({ sourceWarehouseId: '', destinationWarehouseId: '', requestedBy: '', notes: '' })
    const [createLines, setCreateLines] = useState<NewTransferLine[]>([{ materialId: '', quantity: 1, sourceBinId: '' }])
    const [creating, setCreating] = useState(false)

    const openCreate = useCallback(() => {
        setCreateForm({ sourceWarehouseId: '', destinationWarehouseId: '', requestedBy: '', notes: '' })
        setCreateLines([{ materialId: '', quantity: 1, sourceBinId: '' }])
        setCreateOpen(true)
    }, [])

    const updateLine = useCallback((idx: number, patch: Partial<NewTransferLine>) => {
        setCreateLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
    }, [])

    const removeLine = useCallback((idx: number) => {
        setCreateLines((prev) => prev.filter((_, i) => i !== idx))
    }, [])

    const handleCreate = useCallback(async () => {
        if (createForm.sourceWarehouseId === createForm.destinationWarehouseId) {
            pushToast('danger', 'Validation', 'Source and destination warehouses must be different.')
            return
        }
        setCreating(true)
        try {
            const payload: CreateTransferPayload = {
                sourceWarehouseId: createForm.sourceWarehouseId,
                destinationWarehouseId: createForm.destinationWarehouseId,
                requestedBy: createForm.requestedBy || undefined,
                notes: createForm.notes || undefined,
                lines: createLines.filter((l) => l.materialId && l.quantity > 0).map((l) => ({
                    materialId: l.materialId,
                    quantity: l.quantity,
                    sourceBinId: l.sourceBinId || undefined,
                })),
            }
            const created = await transferService.create(payload)
            pushToast('success', 'Transfer created', `${created.transferNumber} was created.`)
            setCreateOpen(false)
            fetchList()
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'An error occurred'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : msg)
        } finally {
            setCreating(false)
        }
    }, [createForm, createLines, fetchList])

    /* ── detail modal ── */
    const [detailOpen, setDetailOpen] = useState(false)
    const [detail, setDetail] = useState<WarehouseTransfer | null>(null)
    const [detailLoading, setDetailLoading] = useState(false)

    const openDetail = useCallback(async (id: string) => {
        setDetailOpen(true)
        setDetailLoading(true)
        try {
            const t = await transferService.get(id)
            setDetail(t)
        } catch {
            pushToast('danger', 'Error', 'Failed to load transfer details')
            setDetailOpen(false)
        } finally {
            setDetailLoading(false)
        }
    }, [])

    const refreshDetail = useCallback(async () => {
        if (!detail) return
        try {
            const t = await transferService.get(detail.id)
            setDetail(t)
        } catch {
            pushToast('danger', 'Error', 'Failed to refresh transfer')
        }
    }, [detail])

    const handleApprove = useCallback(async () => {
        if (!detail) return
        try {
            await transferService.approve(detail.id)
            pushToast('success', 'Approved', `${detail.transferNumber} approved.`)
            await refreshDetail()
            fetchList()
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || 'Approve failed')
        }
    }, [detail, refreshDetail, fetchList])

    const handleDispatch = useCallback(async () => {
        if (!detail) return
        try {
            await transferService.dispatch(detail.id)
            pushToast('success', 'Dispatched', `${detail.transferNumber} dispatched.`)
            await refreshDetail()
            fetchList()
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || 'Dispatch failed')
        }
    }, [detail, refreshDetail, fetchList])

    const handleComplete = useCallback(async () => {
        if (!detail) return
        try {
            await transferService.complete(detail.id)
            pushToast('success', 'Completed', `${detail.transferNumber} completed.`)
            await refreshDetail()
            fetchList()
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || 'Complete failed')
        }
    }, [detail, refreshDetail, fetchList])

    const handleCancelSingle = useCallback(async () => {
        if (!detail) return
        try {
            await transferService.cancel(detail.id)
            pushToast('success', 'Cancelled', `${detail.transferNumber} cancelled.`)
            await refreshDetail()
            fetchList()
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || 'Cancel failed')
        }
    }, [detail, refreshDetail, fetchList])

    /* ── line pick dialog ── */
    const [pickDialogOpen, setPickDialogOpen] = useState(false)
    const [pickLine, setPickLine] = useState<WarehouseTransferLine | null>(null)
    const [pickQty, setPickQty] = useState(0)

    const openPickDialog = useCallback((line: WarehouseTransferLine) => {
        setPickLine(line)
        setPickQty(line.quantity - line.pickedQty)
        setPickDialogOpen(true)
    }, [])

    const handlePick = useCallback(async () => {
        if (!detail || !pickLine) return
        try {
            await transferService.pick(detail.id, { lineId: pickLine.id, pickedQty: pickQty })
            pushToast('success', 'Picked', `Line picked (${pickQty} units).`)
            setPickDialogOpen(false)
            await refreshDetail()
            fetchList()
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || 'Pick failed')
        }
    }, [detail, pickLine, pickQty, refreshDetail, fetchList])

    /* ── line receive dialog ── */
    const [receiveDialogOpen, setReceiveDialogOpen] = useState(false)
    const [receiveLine, setReceiveLine] = useState<WarehouseTransferLine | null>(null)
    const [receiveQty, setReceiveQty] = useState(0)

    const openReceiveDialog = useCallback((line: WarehouseTransferLine) => {
        setReceiveLine(line)
        setReceiveQty(line.quantity - line.receivedQty)
        setReceiveDialogOpen(true)
    }, [])

    const handleReceive = useCallback(async () => {
        if (!detail || !receiveLine) return
        try {
            await transferService.receive(detail.id, { lineId: receiveLine.id, receivedQty: receiveQty })
            pushToast('success', 'Received', `Line received (${receiveQty} units).`)
            setReceiveDialogOpen(false)
            await refreshDetail()
            fetchList()
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || 'Receive failed')
        }
    }, [detail, receiveLine, receiveQty, refreshDetail, fetchList])

    /* ── table columns ── */
    const columns = useMemo<ColumnDef<WarehouseTransfer>[]>(
        () => [
            {
                header: 'Transfer #',
                accessorKey: 'transferNumber',
                size: 150,
                minSize: 120,
                cell: ({ row }) => (
                    <button type="button" onClick={() => openDetail(row.original.id)} className="whitespace-nowrap font-mono text-xs font-semibold text-primary hover:underline">
                        {row.original.transferNumber}
                    </button>
                ),
            },
            {
                header: 'Source WH',
                accessorKey: 'sourceWarehouseId',
                size: 180,
                minSize: 140,
                cell: ({ row }) => <span className="whitespace-nowrap text-sm">{row.original.sourceWarehouse?.name ?? '—'}</span>,
            },
            {
                header: 'Dest WH',
                accessorKey: 'destinationWarehouseId',
                size: 180,
                minSize: 140,
                cell: ({ row }) => <span className="whitespace-nowrap text-sm">{row.original.destinationWarehouse?.name ?? '—'}</span>,
            },
            {
                header: 'Lines',
                id: 'lineCount',
                size: 80,
                minSize: 60,
                cell: ({ row }) => <span className="text-sm">{row.original.lines?.length ?? 0} lines</span>,
            },
            {
                header: 'Status',
                accessorKey: 'status',
                size: 130,
                minSize: 110,
                cell: ({ row }) => <StatusBadge tone={STATUS_TONE[row.original.status] ?? 'default'}>{row.original.status.replace(/_/g, ' ')}</StatusBadge>,
            },
            {
                header: 'Requested By',
                accessorKey: 'requestedBy',
                size: 140,
                minSize: 100,
                cell: ({ row }) => <span className="text-sm">{row.original.requestedBy || '—'}</span>,
            },
            {
                header: 'Created',
                accessorKey: 'createdAt',
                size: 130,
                minSize: 110,
                cell: ({ row }) => <span className="whitespace-nowrap text-xs text-gray-500">{fmtDate(row.original.createdAt)}</span>,
            },
            {
                id: 'actions',
                header: '',
                enableSorting: false,
                size: 56,
                cell: ({ row }) => {
                    const t = row.original
                    return (
                        <Dropdown renderTitle={<EllipsisButton />} placement="bottom-end">
                            <Dropdown.Item eventKey="view" onClick={() => openDetail(t.id)}>
                                <HiOutlineEye className="text-base" /><span>View</span>
                            </Dropdown.Item>
                            {t.status === 'DRAFT' && (
                                <Dropdown.Item eventKey="cancel" onClick={() => { setDetail(t); handleCancelSingle() }}>
                                    <HiOutlineX className="text-base text-red-500" /><span className="text-red-500">Cancel</span>
                                </Dropdown.Item>
                            )}
                        </Dropdown>
                    )
                },
            },
        ],
        [openDetail, handleCancelSingle],
    )

    /* ── detail line columns ── */
    const detailLineColumns = useMemo<ColumnDef<WarehouseTransferLine>[]>(
        () => [
            {
                header: 'Material',
                accessorKey: 'materialId',
                size: 200,
                cell: ({ row }) => <span className="text-sm">{row.original.material ? `${row.original.material.materialCode} — ${row.original.material.materialName}` : '—'}</span>,
            },
            { header: 'Qty', accessorKey: 'quantity', size: 70, cell: ({ row }) => <span className="text-sm font-medium">{row.original.quantity}</span> },
            { header: 'Source Bin', size: 110, cell: ({ row }) => <span className="text-xs">{row.original.sourceBin?.code ?? '—'}</span> },
            { header: 'Dest Bin', size: 110, cell: ({ row }) => <span className="text-xs">{row.original.destinationBin?.code ?? '—'}</span> },
            { header: 'Picked', accessorKey: 'pickedQty', size: 80, cell: ({ row }) => <span className="text-sm">{row.original.pickedQty}</span> },
            { header: 'Received', accessorKey: 'receivedQty', size: 90, cell: ({ row }) => <span className="text-sm">{row.original.receivedQty}</span> },
            {
                header: 'Status',
                accessorKey: 'status',
                size: 110,
                cell: ({ row }) => <StatusBadge tone={STATUS_TONE[row.original.status] ?? 'default'}>{row.original.status.replace(/_/g, ' ')}</StatusBadge>,
            },
            {
                id: 'lineActions',
                header: '',
                size: 100,
                cell: ({ row }) => {
                    const line = row.original
                    const s = detail?.status
                    if (s === 'APPROVED' && line.pickedQty < line.quantity) {
                        return <Button size="xs" variant="solid" onClick={() => openPickDialog(line)}>Pick</Button>
                    }
                    if ((s === 'IN_TRANSIT' || s === 'DISPATCHED') && line.receivedQty < line.quantity) {
                        return <Button size="xs" variant="solid" onClick={() => openReceiveDialog(line)}>Receive</Button>
                    }
                    return null
                },
            },
        ],
        [detail, openPickDialog, openReceiveDialog],
    )

    const createCanSubmit = createForm.sourceWarehouseId && createForm.destinationWarehouseId && createForm.sourceWarehouseId !== createForm.destinationWarehouseId && createLines.some((l) => l.materialId && l.quantity > 0)

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Warehouse Transfers"
                description="Request → Approve → Pick → Dispatch (in transit) → Receive → Close. Dispatch requires pick."
                actions={<Button variant="solid" size="sm" icon={<HiOutlinePlus />} onClick={openCreate}>Create Transfer</Button>}
            />

            {/* ── Tabs ── */}
            <AdaptiveCard className="mt-4">
                <Tabs value={statusTab} onChange={(v) => { setStatusTab(v); setPage(1) }}>
                    <Tabs.TabList>
                        {TAB_OPTIONS.map((t) => (
                            <Tabs.TabNav key={t.value} value={t.value}>{t.label}</Tabs.TabNav>
                        ))}
                    </Tabs.TabList>
                </Tabs>
            </AdaptiveCard>

            {/* ── Filters + Table ── */}
            <AdaptiveCard className="mt-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <Input prefix={<HiOutlineSearch className="text-lg" />} placeholder="Search transfer #…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
                    <Select<FilterOption> placeholder="Source warehouse" options={warehouseOpts} value={warehouseOpts.find((o) => o.value === sourceWhFilter)} onChange={(opt) => { setSourceWhFilter(opt?.value ?? ''); setPage(1) }} />
                    <Select<FilterOption> placeholder="Dest warehouse" options={warehouseOpts} value={warehouseOpts.find((o) => o.value === destWhFilter)} onChange={(opt) => { setDestWhFilter(opt?.value ?? ''); setPage(1) }} />
                </div>

                {selectedRows.size > 0 && (
                    <div className="mt-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 dark:border-red-500/30 dark:bg-red-500/10">
                        <span className="text-sm font-medium text-red-700 dark:text-red-300">{selectedRows.size} item{selectedRows.size > 1 ? 's' : ''} selected</span>
                        <div className="ml-auto flex items-center gap-2">
                            <Button size="xs" onClick={() => setSelectedRows(new Set())}>Clear</Button>
                            {draftSelectedCount > 0 && (
                                <Button size="xs" variant="solid" customColorClass={() => 'bg-red-500 hover:bg-red-600 text-white'} icon={<HiOutlineX />} onClick={() => setBulkCancelOpen(true)}>
                                    Cancel {draftSelectedCount} draft{draftSelectedCount > 1 ? 's' : ''}
                                </Button>
                            )}
                        </div>
                    </div>
                )}

                <div className="mt-4">
                    <DataTable<WarehouseTransfer>
                        columns={columns}
                        data={transfers}
                        compact
                        loading={loading}
                        selectable
                        checkboxChecked={(row) => selectedRows.has(row.id)}
                        onCheckBoxChange={handleCheckBoxChange}
                        onIndeterminateCheckBoxChange={(checked, rows) => handleSelectAllChange(checked, rows as any)}
                        noData={!loading && transfers.length === 0}
                        pagingData={{ total: meta.total, pageIndex: page, pageSize }}
                        onPaginationChange={setPage}
                        onSelectChange={(size) => { setPageSize(size); setPage(1) }}
                    />
                </div>
            </AdaptiveCard>

            {/* ══════ Create Transfer Dialog ══════ */}
            <FormDialog
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                size="lg"
                title="New Transfer"
                icon={<HiOutlineSwitchHorizontal />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" loading={creating} disabled={!createCanSubmit} onClick={handleCreate}>Create</Button>
                    </>
                }
            >
                <div className="grid grid-cols-2 gap-3">
                    <FormItem label="Source warehouse" asterisk>
                        <Select<FilterOption>
                            placeholder="Select source…"
                            options={warehouseSelectOpts}
                            value={warehouseSelectOpts.find((o) => o.value === createForm.sourceWarehouseId)}
                            onChange={(opt) => setCreateForm({ ...createForm, sourceWarehouseId: opt?.value ?? '' })}
                        />
                    </FormItem>
                    <FormItem label="Destination warehouse" asterisk>
                        <Select<FilterOption>
                            placeholder="Select destination…"
                            options={warehouseSelectOpts.filter((o) => o.value !== createForm.sourceWarehouseId)}
                            value={warehouseSelectOpts.find((o) => o.value === createForm.destinationWarehouseId)}
                            onChange={(opt) => setCreateForm({ ...createForm, destinationWarehouseId: opt?.value ?? '' })}
                        />
                    </FormItem>
                </div>
                <FormItem label="Requested by">
                    <Input value={createForm.requestedBy} onChange={(e) => setCreateForm({ ...createForm, requestedBy: e.target.value })} placeholder="Requester name" />
                </FormItem>
                <FormItem label="Notes">
                    <Input textArea value={createForm.notes} onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })} placeholder="Optional notes…" />
                </FormItem>

                <div className="mt-2 mb-2 flex items-center justify-between">
                    <h6 className="text-sm font-semibold heading-text">Lines</h6>
                    <Button size="xs" icon={<HiOutlinePlus />} onClick={() => setCreateLines([...createLines, { materialId: '', quantity: 1, sourceBinId: '' }])}>Add Line</Button>
                </div>

                <div className="max-h-60 space-y-3 overflow-y-auto">
                    {createLines.map((line, idx) => (
                        <div key={idx} className="flex items-end gap-2 rounded-lg border p-2 dark:border-gray-600">
                            <FormItem label="Material" className="flex-1">
                                <Select<FilterOption>
                                    size="sm"
                                    placeholder="Select material"
                                    options={materialOpts}
                                    value={materialOpts.find((o) => o.value === line.materialId)}
                                    onChange={(opt) => updateLine(idx, { materialId: opt?.value ?? '' })}
                                />
                            </FormItem>
                            <FormItem label="Qty" className="w-20">
                                <Input size="sm" type="number" min={1} value={String(line.quantity)} onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) || 1 })} />
                            </FormItem>
                            <FormItem label="Source bin" className="w-36">
                                <Select<FilterOption>
                                    size="sm"
                                    placeholder="Optional"
                                    options={binOpts}
                                    value={binOpts.find((o) => o.value === (line.sourceBinId ?? ''))}
                                    onChange={(opt) => updateLine(idx, { sourceBinId: opt?.value ?? '' })}
                                />
                            </FormItem>
                            <Button size="xs" shape="circle" variant="plain" icon={<HiOutlineTrash className="text-red-500" />} onClick={() => removeLine(idx)} />
                        </div>
                    ))}
                </div>
            </FormDialog>

            {/* ══════ Transfer Detail Modal ══════ */}
            <FormDialog
                isOpen={detailOpen}
                onClose={() => { setDetailOpen(false); setDetail(null) }}
                size="xl"
                title={detail?.transferNumber ?? 'Transfer detail'}
                icon={<HiOutlineSwitchHorizontal />}
                headerExtra={detail ? <StatusBadge tone={STATUS_TONE[detail.status] ?? 'default'}>{detail.status.replace(/_/g, ' ')}</StatusBadge> : undefined}
                bodyClassName="overflow-x-hidden"
                footerClassName="!justify-between"
                footer={
                    !detailLoading && detail ? (
                        <>
                            <div className="flex flex-wrap items-center gap-2">
                                {detail.status === 'DRAFT' && (
                                    <>
                                        <Button size="sm" variant="solid" customColorClass={() => 'bg-red-500 hover:bg-red-600 text-white'} icon={<HiOutlineX />} onClick={handleCancelSingle}>Cancel</Button>
                                        <Button size="sm" variant="solid" icon={<HiOutlineCheck />} onClick={handleApprove}>Approve</Button>
                                    </>
                                )}
                                {detail.status === 'PICKED' && (
                                    <Button size="sm" variant="solid" icon={<HiOutlineTruck />} onClick={handleDispatch}>Dispatch</Button>
                                )}
                                {detail.status === 'RECEIVED' && (
                                    <Button size="sm" variant="solid" icon={<HiOutlineClipboardCheck />} onClick={handleComplete}>Complete</Button>
                                )}
                            </div>
                            <Button size="sm" onClick={() => { setDetailOpen(false); setDetail(null) }}>Close</Button>
                        </>
                    ) : (
                        <Button size="sm" onClick={() => { setDetailOpen(false); setDetail(null) }}>Close</Button>
                    )
                }
            >
                {detailLoading && <div className="flex h-40 items-center justify-center"><span className="text-sm text-gray-400">Loading…</span></div>}
                {!detailLoading && detail && (
                    <div className="space-y-5">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <InfoCard label="Source" value={detail.sourceWarehouse?.name} />
                            <InfoCard label="Destination" value={detail.destinationWarehouse?.name} />
                            <InfoCard label="Requested by" value={detail.requestedBy} />
                            <InfoCard label="Approved by" value={detail.approvedBy} />
                            <InfoCard label="Created" value={fmtDate(detail.createdAt)} />
                            <InfoCard label="Updated" value={fmtDate(detail.updatedAt)} />
                        </div>
                        {detail.notes ? (
                            <AdaptiveCard className="!p-3">
                                <p className="text-xs text-gray-500">Notes</p>
                                <p className="mt-0.5 text-sm">{detail.notes}</p>
                            </AdaptiveCard>
                        ) : null}
                        <div>
                            <h6 className="mb-3 text-sm font-semibold heading-text">Transfer lines</h6>
                            <DataTable<WarehouseTransferLine>
                                columns={detailLineColumns}
                                data={detail.lines ?? []}
                                compact
                                fit
                                hidePagination
                                noData={(detail.lines ?? []).length === 0}
                            />
                        </div>
                    </div>
                )}
            </FormDialog>

            {/* ══════ Line Pick Dialog ══════ */}
            <FormDialog
                isOpen={pickDialogOpen}
                onClose={() => setPickDialogOpen(false)}
                size="sm"
                title="Pick Line"
                icon={<HiOutlineClipboardCheck />}
                footer={
                    pickLine ? (
                        <>
                            <Button size="sm" onClick={() => setPickDialogOpen(false)}>Cancel</Button>
                            <Button size="sm" variant="solid" disabled={pickQty <= 0} onClick={handlePick}>Confirm Pick</Button>
                        </>
                    ) : undefined
                }
            >
                {pickLine && (
                    <>
                        <p className="mb-2 text-sm text-gray-500">
                            Material: <span className="font-medium text-gray-800 dark:text-gray-200">{pickLine.material?.materialCode} — {pickLine.material?.materialName}</span>
                        </p>
                        <p className="mb-3 text-sm text-gray-500">
                            Required: <span className="font-medium">{pickLine.quantity}</span> · Already picked: <span className="font-medium">{pickLine.pickedQty}</span>
                        </p>
                        <FormItem label="Pick quantity" asterisk>
                            <Input type="number" min={1} max={pickLine.quantity - pickLine.pickedQty} value={String(pickQty)} onChange={(e) => setPickQty(Math.min(Number(e.target.value) || 0, pickLine.quantity - pickLine.pickedQty))} />
                        </FormItem>
                    </>
                )}
            </FormDialog>

            {/* ══════ Line Receive Dialog ══════ */}
            <FormDialog
                isOpen={receiveDialogOpen}
                onClose={() => setReceiveDialogOpen(false)}
                size="sm"
                title="Receive Line"
                icon={<HiOutlineTruck />}
                footer={
                    receiveLine ? (
                        <>
                            <Button size="sm" onClick={() => setReceiveDialogOpen(false)}>Cancel</Button>
                            <Button size="sm" variant="solid" disabled={receiveQty <= 0} onClick={handleReceive}>Confirm Receive</Button>
                        </>
                    ) : undefined
                }
            >
                {receiveLine && (
                    <>
                        <p className="mb-2 text-sm text-gray-500">
                            Material: <span className="font-medium text-gray-800 dark:text-gray-200">{receiveLine.material?.materialCode} — {receiveLine.material?.materialName}</span>
                        </p>
                        <p className="mb-3 text-sm text-gray-500">
                            Required: <span className="font-medium">{receiveLine.quantity}</span> · Already received: <span className="font-medium">{receiveLine.receivedQty}</span>
                        </p>
                        <FormItem label="Receive quantity" asterisk>
                            <Input type="number" min={1} max={receiveLine.quantity - receiveLine.receivedQty} value={String(receiveQty)} onChange={(e) => setReceiveQty(Math.min(Number(e.target.value) || 0, receiveLine.quantity - receiveLine.receivedQty))} />
                        </FormItem>
                    </>
                )}
            </FormDialog>

            {/* ══════ Bulk cancel confirm ══════ */}
            <ConfirmDialog isOpen={bulkCancelOpen} type="danger" title={`Cancel ${draftSelectedCount} transfer(s)?`} confirmText={`Cancel ${draftSelectedCount}`} onRequestClose={() => setBulkCancelOpen(false)} onCancel={() => setBulkCancelOpen(false)} onConfirm={handleBulkCancel} confirmButtonProps={{ loading: bulkCancelling, customColorClass: () => 'bg-red-500 hover:bg-red-500/90 text-white' }}>
                <p>Only <span className="font-semibold">{draftSelectedCount}</span> draft transfer{draftSelectedCount > 1 ? 's' : ''} will be cancelled. Transfers in other statuses will be skipped.</p>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default TransfersPage
