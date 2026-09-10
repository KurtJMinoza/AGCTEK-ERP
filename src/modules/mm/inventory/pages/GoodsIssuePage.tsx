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
import { FormItem } from '@/components/ui/Form'
import {
    HiOutlinePlus,
    HiOutlineSearch,
    HiOutlineEye,
    HiOutlineTrash,
    HiOutlineCheck,
    HiOutlineX,
    HiOutlineRewind,
    HiOutlineLogout,
} from 'react-icons/hi'
import { goodsIssueService } from '../services/goodsIssueService'
import { warehouseService } from '../../warehouse/services/warehouseService'
import { materialService } from '../../material-master/services/materialService'
import type { GoodsIssue, StockOpsQueryParams } from '../types'
import type { Warehouse } from '../../warehouse/types'
import type { Material } from '../../material-master/types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import InfoCard from '../../shared/InfoCard'
import { fmtMoney } from '../../shared/formatters'

const ROUTE = '/modules/mm/inventory-management/goods-issue'

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger'> = {
    DRAFT: 'default',
    POSTED: 'success',
    CANCELLED: 'danger',
    REVERSED: 'warning',
}

type FilterOption = { value: string; label: string }

const STATUS_FILTER_OPTIONS: FilterOption[] = [
    { value: '', label: 'All statuses' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'POSTED', label: 'Posted' },
    { value: 'CANCELLED', label: 'Cancelled' },
    { value: 'REVERSED', label: 'Reversed' },
]

const ISSUE_PURPOSE_OPTS = [
    { value: 'PRODUCTION', label: 'Production' },
    { value: 'SALES', label: 'Sales' },
    { value: 'INTERNAL', label: 'Internal' },
    { value: 'OTHER', label: 'Other' },
]

type LineInput = { materialId: string; quantity: number; uomId: string; unitCost: number }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(<Notification type={type} title={title} closable duration={3500}>{msg}</Notification>, { placement: 'top-end' })
}

function fmtDate(iso?: string) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function materialLabel(line: GoodsIssue['lines'][number]) {
    return line.material?.materialName ?? line.material?.name ?? line.material?.materialCode ?? line.material?.code ?? line.materialId
}

const GoodsIssuePage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)

    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [rows, setRows] = useState<GoodsIssue[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)

    const queryParams = useMemo<StockOpsQueryParams>(
        () => ({ page, pageSize, search: search || undefined, status: statusFilter || undefined }),
        [page, pageSize, search, statusFilter],
    )

    const fetchList = useCallback(async () => {
        setLoading(true)
        try {
            const res = await goodsIssueService.list(queryParams)
            setRows(res.data)
            setTotal(res.total)
        } catch { /* ignore */ } finally { setLoading(false) }
    }, [queryParams])

    useEffect(() => { fetchList() }, [fetchList])

    const [warehouses, setWarehouses] = useState<Warehouse[]>([])
    const [materials, setMaterials] = useState<Material[]>([])
    useEffect(() => {
        warehouseService.list({ limit: 500 }).then((r: any) => setWarehouses(Array.isArray(r) ? r : (r?.data ?? []))).catch(() => {})
        materialService.list({ limit: 500 }).then((r: any) => setMaterials(Array.isArray(r) ? r : (r?.data ?? []))).catch(() => {})
    }, [])

    const warehouseOpts = useMemo(() => warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })), [warehouses])
    const materialOpts = useMemo(() => materials.map((m) => ({ value: m.id, label: `${m.materialCode} — ${m.materialName}` })), [materials])

    /* ── Create dialog ── */
    const [createOpen, setCreateOpen] = useState(false)
    const [createForm, setCreateForm] = useState({ companyId: '', warehouseId: '', postingDate: '', documentDate: '', issuePurpose: 'INTERNAL', remarks: '' })
    const [createLines, setCreateLines] = useState<LineInput[]>([{ materialId: '', quantity: 1, uomId: '', unitCost: 0 }])
    const [creating, setCreating] = useState(false)

    const openCreate = useCallback(() => {
        setCreateForm({ companyId: '', warehouseId: '', postingDate: new Date().toISOString().slice(0, 10), documentDate: new Date().toISOString().slice(0, 10), issuePurpose: 'INTERNAL', remarks: '' })
        setCreateLines([{ materialId: '', quantity: 1, uomId: '', unitCost: 0 }])
        setCreateOpen(true)
    }, [])

    const handleCreate = useCallback(async () => {
        setCreating(true)
        try {
            const wh = warehouses.find((w) => w.id === createForm.warehouseId)
            const payload = {
                companyId: wh?.companyId || createForm.companyId,
                warehouseId: createForm.warehouseId,
                postingDate: createForm.postingDate,
                documentDate: createForm.documentDate,
                issuePurpose: createForm.issuePurpose,
                remarks: createForm.remarks || undefined,
                lines: createLines.filter((l) => l.materialId).map((l) => ({
                    materialId: l.materialId,
                    quantity: l.quantity,
                    uomId: l.uomId || materials.find((m) => m.id === l.materialId)?.baseUomId || '',
                    unitCost: l.unitCost,
                    totalCost: l.quantity * l.unitCost,
                })),
            }
            await goodsIssueService.create(payload)
            pushToast('success', 'Created', 'Goods issue created.')
            setCreateOpen(false)
            fetchList()
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'Creation failed'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : msg)
        } finally { setCreating(false) }
    }, [createForm, createLines, warehouses, materials, fetchList])

    /* ── Detail dialog ── */
    const [detailOpen, setDetailOpen] = useState(false)
    const [detail, setDetail] = useState<GoodsIssue | null>(null)

    const openDetail = useCallback(async (id: string) => {
        setDetailOpen(true)
        try { setDetail(await goodsIssueService.get(id)) } catch {
            pushToast('danger', 'Error', 'Failed to load')
            setDetailOpen(false)
        }
    }, [])

    const refreshDetail = useCallback(async () => {
        if (!detail) return
        try { setDetail(await goodsIssueService.get(detail.id)) } catch { /* ignore */ }
    }, [detail])

    const handleAction = useCallback(async (action: 'post' | 'cancel' | 'reverse') => {
        if (!detail) return
        try {
            const fn = action === 'post' ? goodsIssueService.post : action === 'cancel' ? goodsIssueService.cancel : goodsIssueService.reverse
            await fn(detail.id)
            pushToast('success', action.charAt(0).toUpperCase() + action.slice(1), `${detail.documentNumber} ${action}ed.`)
            await refreshDetail()
            fetchList()
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || `${action} failed`)
        }
    }, [detail, refreshDetail, fetchList])

    const [confirmAction, setConfirmAction] = useState<{ action: string; fn: () => void } | null>(null)

    const detailLineColumns = useMemo<ColumnDef<GoodsIssue['lines'][number]>[]>(() => [
        {
            header: 'Material',
            accessorKey: 'material.name',
            size: 180,
            cell: ({ row }) => (
                <span className="block truncate" title={materialLabel(row.original)}>
                    {materialLabel(row.original)}
                </span>
            ),
        },
        { header: 'Quantity', accessorKey: 'quantity', size: 72 },
        { header: 'UOM', accessorKey: 'uom.code', size: 64, cell: ({ row }) => row.original.uom?.code ?? '—' },
        { header: 'Unit Cost', accessorKey: 'unitCost', size: 88, cell: ({ row }) => fmtMoney(row.original.unitCost) },
        { header: 'Total Cost', accessorKey: 'totalCost', size: 88, cell: ({ row }) => fmtMoney(row.original.totalCost) },
    ], [])

    const columns: ColumnDef<GoodsIssue>[] = useMemo(() => [
        { header: 'Document #', accessorKey: 'documentNumber' },
        { header: 'Posting Date', accessorKey: 'postingDate', cell: ({ row }) => fmtDate(row.original.postingDate) },
        { header: 'Warehouse', accessorKey: 'warehouse.name', cell: ({ row }) => row.original.warehouse?.name ?? '—' },
        { header: 'Purpose', accessorKey: 'issuePurpose' },
        { header: 'Lines', accessorKey: 'lines', cell: ({ row }) => row.original.lines?.length ?? 0 },
        { header: 'Status', accessorKey: 'status', cell: ({ row }) => <StatusBadge tone={STATUS_TONE[row.original.status] ?? 'default'}>{row.original.status}</StatusBadge> },
        { header: 'Created', accessorKey: 'createdAt', cell: ({ row }) => fmtDate(row.original.createdAt) },
        { header: '', id: 'actions', cell: ({ row }) => (
            <Dropdown renderTitle={<EllipsisButton />} placement="bottom-end">
                <Dropdown.Item eventKey="view" onClick={() => openDetail(row.original.id)}><HiOutlineEye className="mr-2" /> View</Dropdown.Item>
                {row.original.status === 'DRAFT' && <Dropdown.Item eventKey="post" onClick={() => setConfirmAction({ action: 'Post', fn: async () => { await goodsIssueService.post(row.original.id); fetchList() } })}><HiOutlineCheck className="mr-2" /> Post</Dropdown.Item>}
                {row.original.status === 'DRAFT' && <Dropdown.Item eventKey="cancel" onClick={() => setConfirmAction({ action: 'Cancel', fn: async () => { await goodsIssueService.cancel(row.original.id); fetchList() } })}><HiOutlineX className="mr-2" /> Cancel</Dropdown.Item>}
            </Dropdown>
        )},
    ], [openDetail, fetchList])

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Goods Issue"
                description="Issue materials from inventory"
                actions={<Button variant="solid" icon={<HiOutlinePlus />} onClick={openCreate}>New Issue</Button>}
            />

            <AdaptiveCard>
                <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Input prefix={<HiOutlineSearch />} placeholder="Search document #..." value={search} onChange={(e: any) => { setSearch(e.target.value); setPage(1) }} />
                    <Select<FilterOption>
                        placeholder="Status"
                        options={STATUS_FILTER_OPTIONS}
                        value={STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter)}
                        onChange={(opt) => { setStatusFilter(opt?.value ?? ''); setPage(1) }}
                    />
                </div>

                <DataTable columns={columns} data={rows} loading={loading} pagingData={{ total, pageIndex: page, pageSize }} onPaginationChange={(p) => setPage(p)} onSelectChange={(s) => setPageSize(s)} />
            </AdaptiveCard>

            {/* Create Dialog */}
            <FormDialog
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                size="lg"
                title="New Goods Issue"
                icon={<HiOutlineLogout />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" loading={creating} onClick={handleCreate}>Create</Button>
                    </>
                }
            >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormItem label="Warehouse">
                        <Select options={warehouseOpts} value={warehouseOpts.find((o) => o.value === createForm.warehouseId)} onChange={(opt: any) => setCreateForm((p) => ({ ...p, warehouseId: opt?.value ?? '' }))} />
                    </FormItem>
                    <FormItem label="Issue Purpose">
                        <Select options={ISSUE_PURPOSE_OPTS} value={ISSUE_PURPOSE_OPTS.find((o) => o.value === createForm.issuePurpose)} onChange={(opt: any) => setCreateForm((p) => ({ ...p, issuePurpose: opt?.value ?? 'INTERNAL' }))} />
                    </FormItem>
                    <FormItem label="Posting Date">
                        <Input type="date" value={createForm.postingDate} onChange={(e: any) => setCreateForm((p) => ({ ...p, postingDate: e.target.value }))} />
                    </FormItem>
                    <FormItem label="Document Date">
                        <Input type="date" value={createForm.documentDate} onChange={(e: any) => setCreateForm((p) => ({ ...p, documentDate: e.target.value }))} />
                    </FormItem>
                </div>
                <FormItem label="Remarks" className="mt-2">
                    <Input textArea value={createForm.remarks} onChange={(e: any) => setCreateForm((p) => ({ ...p, remarks: e.target.value }))} />
                </FormItem>

                <h6 className="mt-4 mb-2">Lines</h6>
                {createLines.map((line, idx) => (
                    <div key={idx} className="flex items-end gap-2 mb-2">
                        <FormItem label="Material" className="flex-1">
                            <Select options={materialOpts} value={materialOpts.find((o) => o.value === line.materialId)} onChange={(opt: any) => setCreateLines((p) => p.map((l, i) => i === idx ? { ...l, materialId: opt?.value ?? '' } : l))} />
                        </FormItem>
                        <FormItem label="Qty" className="w-24">
                            <Input type="number" value={line.quantity} onChange={(e: any) => setCreateLines((p) => p.map((l, i) => i === idx ? { ...l, quantity: Number(e.target.value) } : l))} />
                        </FormItem>
                        <FormItem label="Unit Cost" className="w-28">
                            <Input type="number" value={line.unitCost} onChange={(e: any) => setCreateLines((p) => p.map((l, i) => i === idx ? { ...l, unitCost: Number(e.target.value) } : l))} />
                        </FormItem>
                        <Button size="xs" variant="plain" onClick={() => setCreateLines((p) => p.filter((_, i) => i !== idx))}><HiOutlineTrash /></Button>
                    </div>
                ))}
                <Button size="sm" variant="plain" onClick={() => setCreateLines((p) => [...p, { materialId: '', quantity: 1, uomId: '', unitCost: 0 }])}>+ Add Line</Button>
            </FormDialog>

            {/* Detail Dialog */}
            <FormDialog
                isOpen={detailOpen}
                onClose={() => setDetailOpen(false)}
                size="xl"
                title={detail?.documentNumber ?? 'Goods Issue'}
                icon={<HiOutlineLogout />}
                headerExtra={detail ? <StatusBadge tone={STATUS_TONE[detail.status] ?? 'default'}>{detail.status}</StatusBadge> : undefined}
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
                            <InfoCard label="Purpose" value={detail.issuePurpose} />
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

            <ConfirmDialog
                isOpen={!!confirmAction}
                type="warning"
                title={`${confirmAction?.action}?`}
                onClose={() => setConfirmAction(null)}
                onRequestClose={() => setConfirmAction(null)}
                onCancel={() => setConfirmAction(null)}
                onConfirm={async () => { if (confirmAction) { try { await confirmAction.fn() } catch (err: any) { pushToast('danger', 'Error', err?.response?.data?.message || 'Action failed') } setConfirmAction(null) } }}
            >
                <p>Are you sure?</p>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default GoodsIssuePage
