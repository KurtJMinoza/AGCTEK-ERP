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
    HiOutlineRewind,
    HiOutlineTruck,
    HiOutlineSwitchHorizontal,
} from 'react-icons/hi'
import { binTransferService } from '../services/binTransferService'
import { warehouseTransferOrderService } from '../services/warehouseTransferOrderService'
import {
    useLazyBinsForWarehouse,
    useLazyMaterialEntities,
    useLazyWarehouseEntities,
} from '@/modules/mm/shared/useLazyMmRefs'
import type { BinTransfer, BinTransferLine, WarehouseTransferOrder, WtoLine, StockOpsQueryParams } from '../types'
import type { Warehouse, StorageBin } from '../../warehouse/types'
import type { Material } from '../../material-master/types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import classNames from '@/utils/classNames'
import InfoCard from '../../shared/InfoCard'

type StatusFilterOption = { value: string; label: string }

function TransferListToolbar({
    search,
    onSearchChange,
    statusTab,
    onStatusChange,
    statusOptions,
    createLabel,
    onCreate,
}: {
    search: string
    onSearchChange: (value: string) => void
    statusTab: string
    onStatusChange: (value: string) => void
    statusOptions: StatusFilterOption[]
    createLabel: string
    onCreate: () => void
}) {
    return (
        <div className="mb-4 space-y-3 border-b border-gray-200 pb-4 dark:border-gray-600">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Input
                    prefix={<HiOutlineSearch className="text-lg" />}
                    placeholder="Search document #, warehouse…"
                    value={search}
                    onChange={(e: { target: { value: string } }) => onSearchChange(e.target.value)}
                    className="w-full min-w-0 sm:flex-1"
                />
                <Button
                    variant="solid"
                    size="sm"
                    icon={<HiOutlinePlus />}
                    className="w-full shrink-0 sm:w-auto"
                    onClick={onCreate}
                >
                    {createLabel}
                </Button>
            </div>
            <div className="-mx-1 overflow-x-auto px-1 pb-0.5">
                <div
                    className="inline-flex min-w-full gap-1 rounded-lg bg-gray-100 p-1 sm:min-w-0 dark:bg-gray-800/70"
                    role="tablist"
                    aria-label="Filter by status"
                >
                    {statusOptions.map((t) => {
                        const selected = statusTab === t.value
                        return (
                            <button
                                key={t.value || 'all'}
                                type="button"
                                role="tab"
                                aria-selected={selected}
                                className={classNames(
                                    'whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors',
                                    selected
                                        ? 'bg-white text-primary shadow-sm dark:bg-gray-900 dark:text-primary'
                                        : 'text-gray-600 hover:bg-white/60 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900/40 dark:hover:text-gray-100',
                                )}
                                onClick={() => onStatusChange(t.value)}
                            >
                                {t.label}
                            </button>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

const BIN_STATUS_FILTERS: StatusFilterOption[] = [
    { value: '', label: 'All' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'POSTED', label: 'Posted' },
    { value: 'CANCELLED', label: 'Cancelled' },
]

const WTO_STATUS_FILTERS: StatusFilterOption[] = [
    { value: '', label: 'All' },
    { value: 'DRAFT', label: 'Request' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'PICKED', label: 'Picked' },
    { value: 'IN_TRANSIT', label: 'In Transit' },
    { value: 'COMPLETED', label: 'Closed' },
]

function BinTransferLineEditor({
    line,
    idx,
    materialOpts,
    binOpts,
    onChange,
    onRemove,
}: {
    line: { materialId: string; quantity: number; sourceBinId: string; destinationBinId: string }
    idx: number
    materialOpts: { value: string; label: string }[]
    binOpts: { value: string; label: string }[]
    onChange: (patch: Partial<{ materialId: string; quantity: number; sourceBinId: string; destinationBinId: string }>) => void
    onRemove: () => void
}) {
    return (
        <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-600">
            <div className="mb-2 flex items-center justify-between sm:hidden">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Line {idx + 1}</span>
                <Button size="xs" variant="plain" icon={<HiOutlineTrash className="text-red-500" />} onClick={onRemove} aria-label={`Remove line ${idx + 1}`} />
            </div>
            <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 sm:grid-cols-12 sm:items-end">
                <FormItem label="Material" className="min-[520px]:col-span-2 sm:col-span-4">
                    <Select
                        options={materialOpts}
                        value={materialOpts.find((o) => o.value === line.materialId) ?? null}
                        onChange={(opt: { value?: string } | null) => onChange({ materialId: opt?.value ?? '' })}
                    />
                </FormItem>
                <FormItem label="From bin" className="sm:col-span-2">
                    <Select
                        options={binOpts}
                        value={binOpts.find((o) => o.value === line.sourceBinId) ?? null}
                        onChange={(opt: { value?: string } | null) => onChange({ sourceBinId: opt?.value ?? '' })}
                    />
                </FormItem>
                <FormItem label="To bin" className="sm:col-span-2">
                    <Select
                        options={binOpts}
                        value={binOpts.find((o) => o.value === line.destinationBinId) ?? null}
                        onChange={(opt: { value?: string } | null) => onChange({ destinationBinId: opt?.value ?? '' })}
                    />
                </FormItem>
                <FormItem label="Qty" className="sm:col-span-2">
                    <Input
                        type="number"
                        className="w-full min-w-0"
                        min={1}
                        value={line.quantity}
                        onChange={(e: { target: { value: string } }) => onChange({ quantity: Number(e.target.value) || 1 })}
                    />
                </FormItem>
                <div className="hidden sm:flex sm:col-span-2 sm:items-end sm:justify-end sm:pb-1">
                    <Button size="xs" variant="plain" icon={<HiOutlineTrash className="text-red-500" />} onClick={onRemove} aria-label={`Remove line ${idx + 1}`} />
                </div>
            </div>
        </div>
    )
}

function WhTransferLineEditor({
    line,
    idx,
    materialOpts,
    onChange,
    onRemove,
}: {
    line: { materialId: string; quantity: number }
    idx: number
    materialOpts: { value: string; label: string }[]
    onChange: (patch: Partial<{ materialId: string; quantity: number }>) => void
    onRemove: () => void
}) {
    return (
        <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-600">
            <div className="mb-2 flex items-center justify-between sm:hidden">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Line {idx + 1}</span>
                <Button size="xs" variant="plain" icon={<HiOutlineTrash className="text-red-500" />} onClick={onRemove} aria-label={`Remove line ${idx + 1}`} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 sm:items-end">
                <FormItem label="Material" className="sm:col-span-9">
                    <Select
                        options={materialOpts}
                        value={materialOpts.find((o) => o.value === line.materialId) ?? null}
                        onChange={(opt: { value?: string } | null) => onChange({ materialId: opt?.value ?? '' })}
                    />
                </FormItem>
                <FormItem label="Qty" className="sm:col-span-2">
                    <Input
                        type="number"
                        className="w-full min-w-0"
                        min={1}
                        value={line.quantity}
                        onChange={(e: { target: { value: string } }) => onChange({ quantity: Number(e.target.value) || 1 })}
                    />
                </FormItem>
                <div className="hidden sm:flex sm:col-span-1 sm:items-end sm:justify-end sm:pb-1">
                    <Button size="xs" variant="plain" icon={<HiOutlineTrash className="text-red-500" />} onClick={onRemove} aria-label={`Remove line ${idx + 1}`} />
                </div>
            </div>
        </div>
    )
}

const ROUTE = '/modules/mm/inventory-management/stock-transfers'

const BIN_STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger'> = {
    DRAFT: 'default', POSTED: 'success', CANCELLED: 'danger', REVERSED: 'warning',
}
const WTO_STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger'> = {
    DRAFT: 'default',
    APPROVED: 'success',
    PICKED: 'warning',
    DISPATCHED: 'warning',
    IN_TRANSIT: 'warning',
    COMPLETED: 'success',
    CANCELLED: 'danger',
}

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(<Notification type={type} title={title} closable duration={3500}>{msg}</Notification>, { placement: 'top-end' })
}

function fmtDate(iso?: string) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function binMaterialLabel(line: BinTransferLine) {
    return line.material?.name ?? line.material?.code ?? line.materialId
}

function wtoMaterialLabel(line: WtoLine) {
    return line.material?.name ?? line.material?.code ?? line.materialId
}

/* ─────────── Bin Transfer Tab ─────────── */
function BinTransferTab() {
    const [search, setSearch] = useState('')
    const [statusTab, setStatusTab] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [rows, setRows] = useState<BinTransfer[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)

    const fetchList = useCallback(async () => {
        setLoading(true)
        try {
            const res = await binTransferService.list({ page, pageSize, search: search || undefined, status: statusTab || undefined })
            setRows(res.data); setTotal(res.total)
        } catch { /* ignore */ } finally { setLoading(false) }
    }, [page, pageSize, search, statusTab])

    useEffect(() => { fetchList() }, [fetchList])

    const { ensure: ensureWh, rows: warehouses, loading: whLoading } = useLazyWarehouseEntities()
    const { ensure: ensureMat, rows: materials, loading: matLoading } = useLazyMaterialEntities()
    const { loadForWarehouse, rows: bins, loading: binsLoading } = useLazyBinsForWarehouse()

    const warehouseOpts = useMemo(() => warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })), [warehouses])
    const materialOpts = useMemo(() => materials.map((m) => ({ value: m.id, label: `${m.materialCode} — ${m.materialName}` })), [materials])
    const binOpts = useMemo(() => bins.map((b) => ({ value: b.id, label: b.code })), [bins])

    type BtLineInput = { materialId: string; quantity: number; sourceBinId: string; destinationBinId: string }

    const [createOpen, setCreateOpen] = useState(false)
    const [createForm, setCreateForm] = useState({ warehouseId: '', postingDate: '', remarks: '' })
    const [createLines, setCreateLines] = useState<BtLineInput[]>([{ materialId: '', quantity: 1, sourceBinId: '', destinationBinId: '' }])
    const [creating, setCreating] = useState(false)

    const openCreate = useCallback(async () => {
        await Promise.all([ensureWh(), ensureMat()])
        setCreateForm({ warehouseId: '', postingDate: new Date().toISOString().slice(0, 10), remarks: '' })
        setCreateLines([{ materialId: '', quantity: 1, sourceBinId: '', destinationBinId: '' }])
        setCreateOpen(true)
    }, [ensureWh, ensureMat])

    useEffect(() => {
        if (createForm.warehouseId) void loadForWarehouse(createForm.warehouseId)
    }, [createForm.warehouseId, loadForWarehouse])

    const handleCreate = useCallback(async () => {
        setCreating(true)
        try {
            const wh = warehouses.find((w) => w.id === createForm.warehouseId)
            await binTransferService.create({
                companyId: wh?.companyId || '',
                warehouseId: createForm.warehouseId,
                postingDate: createForm.postingDate,
                remarks: createForm.remarks || undefined,
                lines: createLines.filter((l) => l.materialId && l.sourceBinId && l.destinationBinId).map((l) => ({
                    materialId: l.materialId,
                    quantity: l.quantity,
                    uomId: materials.find((m) => m.id === l.materialId)?.baseUomId || '',
                    sourceBinId: l.sourceBinId,
                    destinationBinId: l.destinationBinId,
                })),
            })
            pushToast('success', 'Created', 'Bin transfer created.')
            setCreateOpen(false); fetchList()
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'Failed'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : msg)
        } finally { setCreating(false) }
    }, [createForm, createLines, warehouses, materials, fetchList])

    const [detailOpen, setDetailOpen] = useState(false)
    const [detail, setDetail] = useState<BinTransfer | null>(null)

    const openDetail = useCallback(async (id: string) => {
        setDetailOpen(true)
        try { setDetail(await binTransferService.get(id)) } catch { pushToast('danger', 'Error', 'Failed to load'); setDetailOpen(false) }
    }, [])

    const refreshDetail = useCallback(async () => {
        if (!detail) return
        try { setDetail(await binTransferService.get(detail.id)) } catch { /* ignore */ }
    }, [detail])

    const handleAction = useCallback(async (action: 'post' | 'cancel' | 'reverse') => {
        if (!detail) return
        try {
            const fn = action === 'post' ? binTransferService.post : action === 'cancel' ? binTransferService.cancel : binTransferService.reverse
            await fn(detail.id)
            pushToast('success', action.charAt(0).toUpperCase() + action.slice(1), `${detail.documentNumber} ${action}ed.`)
            await refreshDetail(); fetchList()
        } catch (err: any) { pushToast('danger', 'Error', err?.response?.data?.message || `${action} failed`) }
    }, [detail, refreshDetail, fetchList])

    const [confirmAction, setConfirmAction] = useState<{ action: string; fn: () => void } | null>(null)

    const binDetailLineColumns = useMemo<ColumnDef<BinTransferLine>[]>(() => [
        {
            header: 'Material',
            accessorKey: 'material.name',
            size: 160,
            cell: ({ row }) => (
                <span className="block truncate" title={binMaterialLabel(row.original)}>
                    {binMaterialLabel(row.original)}
                </span>
            ),
        },
        { header: 'Qty', accessorKey: 'quantity', size: 64 },
        { header: 'Source Bin', accessorKey: 'sourceBin.code', size: 96, cell: ({ row }) => row.original.sourceBin?.code ?? '—' },
        { header: 'Dest Bin', accessorKey: 'destinationBin.code', size: 96, cell: ({ row }) => row.original.destinationBin?.code ?? '—' },
    ], [])

    const columns: ColumnDef<BinTransfer>[] = useMemo(() => [
        { header: 'Document #', accessorKey: 'documentNumber' },
        { header: 'Posting Date', accessorKey: 'postingDate', cell: ({ row }) => fmtDate(row.original.postingDate) },
        { header: 'Warehouse', accessorKey: 'warehouse.name', cell: ({ row }) => row.original.warehouse?.name ?? '—' },
        { header: 'Lines', accessorKey: 'lines', cell: ({ row }) => row.original.lines?.length ?? 0 },
        { header: 'Status', accessorKey: 'status', cell: ({ row }) => <StatusBadge tone={BIN_STATUS_TONE[row.original.status] ?? 'default'}>{row.original.status}</StatusBadge> },
        { header: '', id: 'actions', cell: ({ row }) => (
            <Dropdown renderTitle={<EllipsisButton />} placement="bottom-end">
                <Dropdown.Item eventKey="view" onClick={() => openDetail(row.original.id)}><HiOutlineEye className="mr-2" /> View</Dropdown.Item>
                {row.original.status === 'DRAFT' && <Dropdown.Item eventKey="post" onClick={() => setConfirmAction({ action: 'Post', fn: async () => { await binTransferService.post(row.original.id); fetchList() } })}><HiOutlineCheck className="mr-2" /> Post</Dropdown.Item>}
                {row.original.status === 'DRAFT' && <Dropdown.Item eventKey="cancel" onClick={() => setConfirmAction({ action: 'Cancel', fn: async () => { await binTransferService.cancel(row.original.id); fetchList() } })}><HiOutlineX className="mr-2" /> Cancel</Dropdown.Item>}
            </Dropdown>
        )},
    ], [openDetail, fetchList])

    return (
        <>
            <TransferListToolbar
                search={search}
                onSearchChange={(v) => { setSearch(v); setPage(1) }}
                statusTab={statusTab}
                onStatusChange={(v) => { setStatusTab(v); setPage(1) }}
                statusOptions={BIN_STATUS_FILTERS}
                createLabel="New Bin Transfer"
                onCreate={openCreate}
            />

            <div className="overflow-x-auto">
                <DataTable columns={columns} data={rows} loading={loading} pagingData={{ total, pageIndex: page, pageSize }} onPaginationChange={(p) => setPage(p)} onSelectChange={(s) => setPageSize(s)} />
            </div>

            <FormDialog
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                size="lg"
                title="New Bin Transfer"
                icon={<HiOutlineSwitchHorizontal />}
                bodyClassName="overflow-x-hidden"
                footer={
                    <>
                        <Button size="sm" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" loading={creating} onClick={handleCreate}>Create</Button>
                    </>
                }
            >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormItem label="Warehouse"><Select options={warehouseOpts} value={warehouseOpts.find((o) => o.value === createForm.warehouseId)} onChange={(opt: any) => setCreateForm((p) => ({ ...p, warehouseId: opt?.value ?? '' }))} /></FormItem>
                    <FormItem label="Posting Date"><Input type="date" value={createForm.postingDate} onChange={(e: any) => setCreateForm((p) => ({ ...p, postingDate: e.target.value }))} /></FormItem>
                </div>
                <div className="mt-4 flex items-center justify-between gap-2">
                    <h6 className="text-sm font-semibold heading-text">Lines</h6>
                    <Button
                        size="xs"
                        icon={<HiOutlinePlus />}
                        onClick={() => setCreateLines((p) => [...p, { materialId: '', quantity: 1, sourceBinId: '', destinationBinId: '' }])}
                    >
                        Add line
                    </Button>
                </div>
                <div className="mt-3 max-h-72 space-y-3 overflow-y-auto overflow-x-hidden">
                    {createLines.map((line, idx) => (
                        <BinTransferLineEditor
                            key={idx}
                            line={line}
                            idx={idx}
                            materialOpts={materialOpts}
                            binOpts={binOpts}
                            onChange={(patch) => setCreateLines((p) => p.map((l, i) => (i === idx ? { ...l, ...patch } : l)))}
                            onRemove={() => setCreateLines((p) => p.filter((_, i) => i !== idx))}
                        />
                    ))}
                </div>
            </FormDialog>

            <FormDialog
                isOpen={detailOpen}
                onClose={() => setDetailOpen(false)}
                size="xl"
                title={detail?.documentNumber ?? 'Bin Transfer'}
                icon={<HiOutlineSwitchHorizontal />}
                headerExtra={detail ? <StatusBadge tone={BIN_STATUS_TONE[detail.status] ?? 'default'}>{detail.status}</StatusBadge> : undefined}
                bodyClassName="overflow-x-hidden"
                footerClassName="!justify-between"
                footer={
                    detail ? (
                        <>
                            <div className="flex flex-wrap items-center gap-2">
                                {detail.status === 'DRAFT' && <Button variant="solid" size="sm" onClick={() => handleAction('post')}>Post</Button>}
                                {detail.status === 'DRAFT' && <Button size="sm" onClick={() => handleAction('cancel')}>Cancel</Button>}
                                {detail.status === 'POSTED' && (
                                    <Button size="sm" variant="plain" onClick={() => handleAction('reverse')}>
                                        <HiOutlineRewind className="mr-1" /> Reverse
                                    </Button>
                                )}
                            </div>
                            <Button size="sm" onClick={() => setDetailOpen(false)}>Close</Button>
                        </>
                    ) : (
                        <Button size="sm" onClick={() => setDetailOpen(false)}>Close</Button>
                    )
                }
            >
                {detail && (
                    <div className="space-y-5">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <InfoCard label="Warehouse" value={detail.warehouse?.name} />
                            <InfoCard label="Posting Date" value={fmtDate(detail.postingDate)} />
                            <InfoCard label="Created" value={fmtDate(detail.createdAt)} />
                        </div>
                        {detail.remarks ? (
                            <AdaptiveCard className="!p-3">
                                <p className="text-xs text-gray-500">Remarks</p>
                                <p className="mt-0.5 text-sm">{detail.remarks}</p>
                            </AdaptiveCard>
                        ) : null}
                        <div>
                            <h6 className="mb-3 text-sm font-semibold heading-text">Line items</h6>
                            <DataTable
                                columns={binDetailLineColumns}
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

            <ConfirmDialog isOpen={!!confirmAction} type="warning" title={`${confirmAction?.action}?`} onClose={() => setConfirmAction(null)} onRequestClose={() => setConfirmAction(null)} onCancel={() => setConfirmAction(null)} onConfirm={async () => { if (confirmAction) { try { await confirmAction.fn() } catch (err: any) { pushToast('danger', 'Error', err?.response?.data?.message || 'Failed') } setConfirmAction(null) } }}><p>Are you sure?</p></ConfirmDialog>
        </>
    )
}

/* ─────────── Warehouse Transfer Tab ─────────── */
function WarehouseTransferTab() {
    const [search, setSearch] = useState('')
    const [statusTab, setStatusTab] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [rows, setRows] = useState<WarehouseTransferOrder[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)

    const fetchList = useCallback(async () => {
        setLoading(true)
        try {
            const res = await warehouseTransferOrderService.list({ page, pageSize, search: search || undefined, status: statusTab || undefined })
            setRows(res.data); setTotal(res.total)
        } catch { /* ignore */ } finally { setLoading(false) }
    }, [page, pageSize, search, statusTab])

    useEffect(() => { fetchList() }, [fetchList])

    const { ensure: ensureWh, rows: warehouses, loading: whLoading } = useLazyWarehouseEntities()
    const { ensure: ensureMat, rows: materials, loading: matLoading } = useLazyMaterialEntities()

    const warehouseOpts = useMemo(() => warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })), [warehouses])
    const materialOpts = useMemo(() => materials.map((m) => ({ value: m.id, label: `${m.materialCode} — ${m.materialName}` })), [materials])

    type WtoLineInput = { materialId: string; quantity: number }

    const [createOpen, setCreateOpen] = useState(false)
    const [createForm, setCreateForm] = useState({ sourceWarehouseId: '', destinationWarehouseId: '', postingDate: '', notes: '' })
    const [createLines, setCreateLines] = useState<WtoLineInput[]>([{ materialId: '', quantity: 1 }])
    const [creating, setCreating] = useState(false)

    const openCreate = useCallback(async () => {
        await Promise.all([ensureWh(), ensureMat()])
        setCreateForm({ sourceWarehouseId: '', destinationWarehouseId: '', postingDate: new Date().toISOString().slice(0, 10), notes: '' })
        setCreateLines([{ materialId: '', quantity: 1 }])
        setCreateOpen(true)
    }, [ensureWh, ensureMat])

    const handleCreate = useCallback(async () => {
        if (createForm.sourceWarehouseId === createForm.destinationWarehouseId) {
            pushToast('danger', 'Validation', 'Source and destination must differ.'); return
        }
        setCreating(true)
        try {
            const wh = warehouses.find((w) => w.id === createForm.sourceWarehouseId)
            await warehouseTransferOrderService.create({
                companyId: wh?.companyId || '',
                sourceWarehouseId: createForm.sourceWarehouseId,
                destinationWarehouseId: createForm.destinationWarehouseId,
                postingDate: createForm.postingDate,
                notes: createForm.notes || undefined,
                lines: createLines.filter((l) => l.materialId).map((l) => ({
                    materialId: l.materialId,
                    quantity: l.quantity,
                    uomId: materials.find((m) => m.id === l.materialId)?.baseUomId || '',
                })),
            })
            pushToast('success', 'Created', 'Warehouse transfer order created.')
            setCreateOpen(false); fetchList()
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'Failed'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : msg)
        } finally { setCreating(false) }
    }, [createForm, createLines, warehouses, materials, fetchList])

    const [detailOpen, setDetailOpen] = useState(false)
    const [detail, setDetail] = useState<WarehouseTransferOrder | null>(null)

    const openDetail = useCallback(async (id: string) => {
        setDetailOpen(true)
        try { setDetail(await warehouseTransferOrderService.get(id)) } catch { pushToast('danger', 'Error', 'Failed'); setDetailOpen(false) }
    }, [])

    const refreshDetail = useCallback(async () => {
        if (!detail) return
        try { setDetail(await warehouseTransferOrderService.get(detail.id)) } catch { /* ignore */ }
    }, [detail])

    const doAction = useCallback(async (label: string, fn: () => Promise<any>) => {
        try {
            await fn()
            pushToast('success', label, `${detail?.documentNumber} — ${label}.`)
            await refreshDetail(); fetchList()
        } catch (err: any) { pushToast('danger', 'Error', err?.response?.data?.message || `${label} failed`) }
    }, [detail, refreshDetail, fetchList])

    const [confirmAction, setConfirmAction] = useState<{ action: string; fn: () => void } | null>(null)

    const wtoDetailLineColumns = useMemo<ColumnDef<WtoLine>[]>(() => [
        {
            header: 'Material',
            accessorKey: 'material.name',
            size: 160,
            cell: ({ row }) => (
                <span className="block truncate" title={wtoMaterialLabel(row.original)}>
                    {wtoMaterialLabel(row.original)}
                </span>
            ),
        },
        { header: 'Qty', accessorKey: 'quantity', size: 64 },
        { header: 'Dispatched', accessorKey: 'dispatchedQty', size: 88 },
        { header: 'Received', accessorKey: 'receivedQty', size: 88 },
        {
            header: 'Status',
            accessorKey: 'status',
            size: 100,
            cell: ({ row }) => <StatusBadge tone={WTO_STATUS_TONE[row.original.status] ?? 'default'}>{row.original.status}</StatusBadge>,
        },
    ], [])

    const columns: ColumnDef<WarehouseTransferOrder>[] = useMemo(() => [
        { header: 'Document #', accessorKey: 'documentNumber' },
        { header: 'Posting Date', accessorKey: 'postingDate', cell: ({ row }) => fmtDate(row.original.postingDate) },
        { header: 'Source WH', accessorKey: 'sourceWarehouse.name', cell: ({ row }) => row.original.sourceWarehouse?.name ?? '—' },
        { header: 'Dest WH', accessorKey: 'destinationWarehouse.name', cell: ({ row }) => row.original.destinationWarehouse?.name ?? '—' },
        { header: 'Lines', accessorKey: 'lines', cell: ({ row }) => row.original.lines?.length ?? 0 },
        { header: 'Status', accessorKey: 'status', cell: ({ row }) => <StatusBadge tone={WTO_STATUS_TONE[row.original.status] ?? 'default'}>{row.original.status}</StatusBadge> },
        { header: '', id: 'actions', cell: ({ row }) => (
            <Dropdown renderTitle={<EllipsisButton />} placement="bottom-end">
                <Dropdown.Item eventKey="view" onClick={() => openDetail(row.original.id)}><HiOutlineEye className="mr-2" /> View</Dropdown.Item>
                {row.original.status === 'DRAFT' && <Dropdown.Item eventKey="approve" onClick={() => setConfirmAction({ action: 'Approve', fn: async () => { await warehouseTransferOrderService.approve(row.original.id); fetchList() } })}><HiOutlineCheck className="mr-2" /> Approve</Dropdown.Item>}
                {row.original.status === 'APPROVED' && <Dropdown.Item eventKey="pick" onClick={() => setConfirmAction({ action: 'Pick', fn: async () => { await warehouseTransferOrderService.pick(row.original.id); fetchList() } })}><HiOutlineCheck className="mr-2" /> Pick</Dropdown.Item>}
                {row.original.status === 'PICKED' && <Dropdown.Item eventKey="dispatch" onClick={() => setConfirmAction({ action: 'Dispatch', fn: async () => { await warehouseTransferOrderService.dispatch(row.original.id); fetchList() } })}><HiOutlineTruck className="mr-2" /> Dispatch</Dropdown.Item>}
                {(row.original.status === 'DRAFT' || row.original.status === 'APPROVED') && <Dropdown.Item eventKey="cancel" onClick={() => setConfirmAction({ action: 'Cancel', fn: async () => { await warehouseTransferOrderService.cancel(row.original.id); fetchList() } })}><HiOutlineX className="mr-2" /> Cancel</Dropdown.Item>}
            </Dropdown>
        )},
    ], [openDetail, fetchList])

    return (
        <>
            <TransferListToolbar
                search={search}
                onSearchChange={(v) => { setSearch(v); setPage(1) }}
                statusTab={statusTab}
                onStatusChange={(v) => { setStatusTab(v); setPage(1) }}
                statusOptions={WTO_STATUS_FILTERS}
                createLabel="New WH Transfer"
                onCreate={openCreate}
            />

            <div className="overflow-x-auto">
                <DataTable columns={columns} data={rows} loading={loading} pagingData={{ total, pageIndex: page, pageSize }} onPaginationChange={(p) => setPage(p)} onSelectChange={(s) => setPageSize(s)} />
            </div>

            <FormDialog
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                size="lg"
                title="New Warehouse Transfer Order"
                icon={<HiOutlineTruck />}
                bodyClassName="overflow-x-hidden"
                footer={
                    <>
                        <Button size="sm" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" loading={creating} onClick={handleCreate}>Create</Button>
                    </>
                }
            >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormItem label="Source Warehouse"><Select options={warehouseOpts} value={warehouseOpts.find((o) => o.value === createForm.sourceWarehouseId)} onChange={(opt: any) => setCreateForm((p) => ({ ...p, sourceWarehouseId: opt?.value ?? '' }))} /></FormItem>
                    <FormItem label="Destination Warehouse"><Select options={warehouseOpts} value={warehouseOpts.find((o) => o.value === createForm.destinationWarehouseId)} onChange={(opt: any) => setCreateForm((p) => ({ ...p, destinationWarehouseId: opt?.value ?? '' }))} /></FormItem>
                    <FormItem label="Posting Date"><Input type="date" value={createForm.postingDate} onChange={(e: any) => setCreateForm((p) => ({ ...p, postingDate: e.target.value }))} /></FormItem>
                </div>
                <div className="mt-4 flex items-center justify-between gap-2">
                    <h6 className="text-sm font-semibold heading-text">Lines</h6>
                    <Button size="xs" icon={<HiOutlinePlus />} onClick={() => setCreateLines((p) => [...p, { materialId: '', quantity: 1 }])}>
                        Add line
                    </Button>
                </div>
                <div className="mt-3 max-h-72 space-y-3 overflow-y-auto overflow-x-hidden">
                    {createLines.map((line, idx) => (
                        <WhTransferLineEditor
                            key={idx}
                            line={line}
                            idx={idx}
                            materialOpts={materialOpts}
                            onChange={(patch) => setCreateLines((p) => p.map((l, i) => (i === idx ? { ...l, ...patch } : l)))}
                            onRemove={() => setCreateLines((p) => p.filter((_, i) => i !== idx))}
                        />
                    ))}
                </div>
            </FormDialog>

            <FormDialog
                isOpen={detailOpen}
                onClose={() => setDetailOpen(false)}
                size="xl"
                title={detail?.documentNumber ?? 'Warehouse Transfer'}
                icon={<HiOutlineTruck />}
                headerExtra={detail ? <StatusBadge tone={WTO_STATUS_TONE[detail.status] ?? 'default'}>{detail.status}</StatusBadge> : undefined}
                bodyClassName="overflow-x-hidden"
                footerClassName="!justify-between"
                footer={
                    detail ? (
                        <>
                            <div className="flex flex-wrap items-center gap-2">
                                {detail.status === 'DRAFT' && <Button variant="solid" size="sm" onClick={() => doAction('Approved', () => warehouseTransferOrderService.approve(detail.id))}>Approve</Button>}
                                {detail.status === 'APPROVED' && <Button variant="solid" size="sm" onClick={() => doAction('Picked', () => warehouseTransferOrderService.pick(detail.id))}>Pick</Button>}
                                {detail.status === 'PICKED' && <Button variant="solid" size="sm" onClick={() => doAction('Dispatched', () => warehouseTransferOrderService.dispatch(detail.id))}><HiOutlineTruck className="mr-1" /> Dispatch</Button>}
                                {(detail.status === 'DISPATCHED' || detail.status === 'IN_TRANSIT') && <Button variant="solid" size="sm" onClick={() => doAction('Completed', () => warehouseTransferOrderService.complete(detail.id))}>Complete</Button>}
                                {(detail.status === 'DRAFT' || detail.status === 'APPROVED') && <Button size="sm" onClick={() => doAction('Cancelled', () => warehouseTransferOrderService.cancel(detail.id))}>Cancel</Button>}
                            </div>
                            <Button size="sm" onClick={() => setDetailOpen(false)}>Close</Button>
                        </>
                    ) : (
                        <Button size="sm" onClick={() => setDetailOpen(false)}>Close</Button>
                    )
                }
            >
                {detail && (
                    <div className="space-y-5">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <InfoCard label="Source" value={detail.sourceWarehouse?.name} />
                            <InfoCard label="Destination" value={detail.destinationWarehouse?.name} />
                            <InfoCard label="Posting Date" value={fmtDate(detail.postingDate)} />
                        </div>
                        <div>
                            <h6 className="mb-3 text-sm font-semibold heading-text">Line items</h6>
                            <DataTable
                                columns={wtoDetailLineColumns}
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

            <ConfirmDialog isOpen={!!confirmAction} type="warning" title={`${confirmAction?.action}?`} onClose={() => setConfirmAction(null)} onRequestClose={() => setConfirmAction(null)} onCancel={() => setConfirmAction(null)} onConfirm={async () => { if (confirmAction) { try { await confirmAction.fn() } catch (err: any) { pushToast('danger', 'Error', err?.response?.data?.message || 'Failed') } setConfirmAction(null) } }}><p>Are you sure?</p></ConfirmDialog>
        </>
    )
}

/* ─────────── Main Page ─────────── */
const StockTransferPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [tab, setTab] = useState('bin')

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader title="Stock Transfers" description="Request → Approve → Pick → Dispatch (in transit) → Receive → Close. Same ledger as warehouse transfers." />
            <AdaptiveCard className="!p-0 sm:!p-5">
                <Tabs value={tab} onChange={(val) => setTab(val as string)}>
                    <Tabs.TabList className="border-b border-gray-200 px-4 pt-4 dark:border-gray-600 sm:px-0 sm:pt-0">
                        <Tabs.TabNav value="bin">Bin Transfer</Tabs.TabNav>
                        <Tabs.TabNav value="warehouse">Warehouse Transfer</Tabs.TabNav>
                    </Tabs.TabList>
                    <Tabs.TabContent value="bin" className="px-4 pb-4 pt-4 sm:px-0 sm:pb-0">
                        <BinTransferTab />
                    </Tabs.TabContent>
                    <Tabs.TabContent value="warehouse" className="px-4 pb-4 pt-4 sm:px-0 sm:pb-0">
                        <WarehouseTransferTab />
                    </Tabs.TabContent>
                </Tabs>
            </AdaptiveCard>
        </PageContainer>
    )
}

export default StockTransferPage
