'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import ReturnsResponsiveTable, { type ColumnDef as ListColumnDef } from '../components/ReturnsResponsiveTable'
import {
    RD_DISPOSAL_STATUS,
    RdAnimatedStatus,
    RdDateCell,
    RdDocNumberCell,
    RdMoneyCell,
    RdPartyCell,
    RdPlainCell,
    RdQtyCell,
    rdStatusTone,
} from '../components/returnsTableUi'
import { returnsParentBreadcrumbs } from '../utils/returnsPageUi'
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
} from 'react-icons/hi'
import { returnsDisposalService } from '../services/returnsDisposalService'
import {
    useLazyMaterialEntities,
    useLazyWarehouseEntities,
} from '@/modules/mm/shared/useLazyMmRefs'
import type { Disposal } from '../types'
import InfoCard from '../../shared/InfoCard'
import { fmtMoney } from '../../shared/formatters'
import type { DisposalLine, AuditEntry } from '../types'

const ROUTE = '/modules/mm/returns-disposal/scrap'
const DISPOSAL_TYPE = 'SCRAP'

const TAB_OPTIONS = [
    { value: '', label: 'All' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'PENDING_APPROVAL', label: 'Pending' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'POSTED', label: 'Posted' },
]

const REASON_OPTS = [
    { value: 'DAMAGE', label: 'Damage' },
    { value: 'EXPIRY', label: 'Expiry' },
    { value: 'RECALL', label: 'Recall' },
    { value: 'OBSOLETE', label: 'Obsolete' },
    { value: 'SHRINKAGE', label: 'Shrinkage' },
    { value: 'QUALITY_FAILURE', label: 'Quality Failure' },
]

type LineInput = {
    materialId: string
    uomId: string
    quantity: number
    unitCost: number
    reason: string
    stockStatus: string
}

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

function fmtDate(iso?: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const ScrapPage = () => {
    const parentBreadcrumbs = returnsParentBreadcrumbs(ROUTE)

    const [search, setSearch] = useState('')
    const [statusTab, setStatusTab] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [rows, setRows] = useState<Disposal[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)

    const fetchList = useCallback(async () => {
        setLoading(true)
        try {
            const res = await returnsDisposalService.listDisposals({
                page, pageSize,
                disposalType: DISPOSAL_TYPE,
                search: search || undefined,
                status: statusTab || undefined,
            })
            setRows(res.data)
            setTotal(res.total)
        } catch { /* ignore */ } finally { setLoading(false) }
    }, [page, pageSize, search, statusTab])

    useEffect(() => { fetchList() }, [fetchList])

    const { ensure: ensureWarehouses, rows: warehouses } = useLazyWarehouseEntities()
    const { ensure: ensureMaterials, rows: materials } = useLazyMaterialEntities()

    const warehouseOpts = useMemo(() => warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })), [warehouses])
    const materialOpts = useMemo(() => materials.map((m) => ({ value: m.id, label: `${m.materialCode} — ${m.materialName}` })), [materials])

    /* ── Create ── */
    const [createOpen, setCreateOpen] = useState(false)
    const [createForm, setCreateForm] = useState({ warehouseId: '', reason: 'DAMAGE', remarks: '' })
    const [createLines, setCreateLines] = useState<LineInput[]>([
        { materialId: '', uomId: '', quantity: 0, unitCost: 0, reason: 'DAMAGE', stockStatus: 'BLOCKED' },
    ])
    const [creating, setCreating] = useState(false)

    const openCreate = useCallback(async () => {
        await Promise.all([ensureWarehouses(), ensureMaterials()])
        setCreateForm({ warehouseId: '', reason: 'DAMAGE', remarks: '' })
        setCreateLines([{ materialId: '', uomId: '', quantity: 0, unitCost: 0, reason: 'DAMAGE', stockStatus: 'BLOCKED' }])
        setCreateOpen(true)
    }, [ensureWarehouses, ensureMaterials])

    const handleCreate = useCallback(async () => {
        setCreating(true)
        try {
            const wh = warehouses.find((w) => w.id === createForm.warehouseId)
            await returnsDisposalService.createDisposal({
                companyId: wh?.companyId || '',
                warehouseId: createForm.warehouseId,
                disposalType: DISPOSAL_TYPE,
                reason: createForm.reason,
                remarks: createForm.remarks || undefined,
                lines: createLines.filter((l) => l.materialId).map((l) => ({
                    materialId: l.materialId,
                    uomId: l.uomId || materials.find((m) => m.id === l.materialId)?.baseUomId || '',
                    quantity: l.quantity,
                    unitCost: l.unitCost,
                    reason: l.reason,
                    stockStatus: l.stockStatus || 'BLOCKED',
                })),
            })
            pushToast('success', 'Created', 'Scrap document created.')
            setCreateOpen(false); fetchList()
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'Failed'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : msg)
        } finally { setCreating(false) }
    }, [createForm, createLines, warehouses, materials, fetchList])

    /* ── Detail ── */
    const [detailOpen, setDetailOpen] = useState(false)
    const [detail, setDetail] = useState<Disposal | null>(null)

    const openDetail = useCallback(async (id: string) => {
        setDetailOpen(true)
        try { setDetail(await returnsDisposalService.getDisposal(id)) } catch {
            pushToast('danger', 'Error', 'Failed to load'); setDetailOpen(false)
        }
    }, [])

    const refreshDetail = useCallback(async () => {
        if (!detail) return
        try { setDetail(await returnsDisposalService.getDisposal(detail.id)) } catch { /* ignore */ }
    }, [detail])

    const doAction = useCallback(async (label: string, fn: () => Promise<any>) => {
        try {
            await fn()
            pushToast('success', label, `${detail?.disposalNumber} — ${label}.`)
            await refreshDetail(); fetchList()
        } catch (err: any) { pushToast('danger', 'Error', err?.response?.data?.message || `${label} failed`) }
    }, [detail, refreshDetail, fetchList])

    const [confirmAction, setConfirmAction] = useState<{ action: string; fn: () => void } | null>(null)

    const [executeOpen, setExecuteOpen] = useState(false)
    const [executeSaving, setExecuteSaving] = useState(false)
    const [executeForm, setExecuteForm] = useState({
        witnessName: '',
        disposalMethod: 'Certified waste disposal',
        wasteManifestRef: '',
        executionNotes: '',
    })

    const submitExecute = useCallback(async () => {
        if (!detail) return
        setExecuteSaving(true)
        try {
            await returnsDisposalService.executeDisposal(detail.id, executeForm)
            pushToast('success', 'Executed', 'Physical disposal recorded.')
            setExecuteOpen(false)
            await refreshDetail()
            fetchList()
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || 'Execution failed')
        } finally {
            setExecuteSaving(false)
        }
    }, [detail, executeForm, refreshDetail, fetchList])

    const detailLineColumns = useMemo<ColumnDef<DisposalLine>[]>(() => [
        {
            header: 'Material',
            accessorKey: 'material.materialName',
            size: 160,
            cell: ({ row }) => {
                const label = row.original.material?.materialName ?? row.original.materialId
                return <span className="block truncate" title={label}>{label}</span>
            },
        },
        { header: 'Qty', accessorKey: 'quantity', size: 64 },
        { header: 'Unit Cost', accessorKey: 'unitCost', size: 88, cell: ({ row }) => fmtMoney(row.original.unitCost) },
        { header: 'Reason', accessorKey: 'reason', size: 96 },
        { header: 'Stock Status', accessorKey: 'stockStatus', size: 100 },
    ], [])

    const auditColumns = useMemo<ColumnDef<AuditEntry>[]>(() => [
        { header: 'Action', accessorKey: 'action', size: 80 },
        { header: 'Field', accessorKey: 'field', size: 80 },
        { header: 'Old', accessorKey: 'oldValue', size: 80, cell: ({ row }) => <span className="block truncate" title={row.original.oldValue ?? undefined}>{row.original.oldValue ?? '—'}</span> },
        { header: 'New', accessorKey: 'newValue', size: 80, cell: ({ row }) => <span className="block truncate" title={row.original.newValue ?? undefined}>{row.original.newValue ?? '—'}</span> },
        { header: 'By', accessorKey: 'performedBy', size: 80 },
        { header: 'Date', accessorKey: 'performedAt', size: 96, cell: ({ row }) => fmtDate(row.original.performedAt) },
    ], [])

    const columns: ListColumnDef<Disposal>[] = useMemo(() => [
        {
            header: 'Scrap',
            cell: ({ row }) => (
                <RdDocNumberCell
                    icon="return"
                    primary={row.original.disposalNumber}
                    secondary={fmtDate(row.original.createdAt)}
                />
            ),
        },
        {
            header: 'Warehouse',
            cell: ({ row }) => (
                <RdPartyCell kind="warehouse" name={row.original.warehouse?.name} />
            ),
        },
        {
            header: 'Reason',
            cell: ({ row }) => (
                <RdPlainCell>{row.original.reason?.replace(/_/g, ' ')}</RdPlainCell>
            ),
        },
        {
            header: 'Value',
            cell: ({ row }) => <RdMoneyCell amount={row.original.estimatedValue} />,
        },
        {
            header: 'Qty',
            cell: ({ row }) => <RdQtyCell value={row.original.totalQuantity} />,
        },
        {
            header: 'Status',
            cell: ({ row }) => (
                <RdAnimatedStatus
                    status={row.original.status}
                    tone={rdStatusTone(row.original.status, RD_DISPOSAL_STATUS)}
                />
            ),
        },
        {
            header: 'Created',
            cell: ({ row }) => <RdDateCell iso={row.original.createdAt} />,
        },
        {
            header: '', id: 'actions', cell: ({ row }) => (
                <Dropdown renderTitle={<EllipsisButton />} placement="bottom-end">
                    <Dropdown.Item eventKey="view" onClick={() => openDetail(row.original.id)}><HiOutlineEye className="mr-2" /> View</Dropdown.Item>
                    {row.original.status === 'DRAFT' && <Dropdown.Item eventKey="submit" onClick={() => setConfirmAction({ action: 'Submit', fn: async () => { await returnsDisposalService.submitDisposal(row.original.id); fetchList() } })}><HiOutlineCheck className="mr-2" /> Submit</Dropdown.Item>}
                    {row.original.status === 'PENDING_APPROVAL' && <Dropdown.Item eventKey="approve" onClick={() => setConfirmAction({ action: 'Approve', fn: async () => { await returnsDisposalService.approveDisposal(row.original.id); fetchList() } })}><HiOutlineCheck className="mr-2" /> Approve</Dropdown.Item>}
                    {row.original.status === 'APPROVED' && (
                        <Dropdown.Item
                            eventKey="execute"
                            onClick={async () => {
                                await openDetail(row.original.id)
                                setExecuteOpen(true)
                            }}
                        >
                            <HiOutlineCheck className="mr-2" /> Record execution
                        </Dropdown.Item>
                    )}
                    {row.original.status === 'EXECUTED' && <Dropdown.Item eventKey="post" onClick={() => setConfirmAction({ action: 'Post', fn: async () => { await returnsDisposalService.postDisposal(row.original.id); fetchList() } })}><HiOutlineCheck className="mr-2" /> Post</Dropdown.Item>}
                    {['DRAFT', 'REJECTED'].includes(row.original.status) && <Dropdown.Item eventKey="cancel" onClick={() => setConfirmAction({ action: 'Cancel', fn: async () => { await returnsDisposalService.cancelDisposal(row.original.id); fetchList() } })}><HiOutlineX className="mr-2" /> Cancel</Dropdown.Item>}
                </Dropdown>
            ),
        },
    ], [openDetail, fetchList])

    return (
        <PageContainer>
            <PageHeader
                title="Scrap"
                description="Approval does not reduce inventory — witness execution, then post"
                breadcrumbs={parentBreadcrumbs}
                actions={<Button variant="solid" icon={<HiOutlinePlus />} onClick={openCreate}>New Scrap</Button>}
            />
            <AdaptiveCard>
                <div className="flex flex-wrap items-center gap-4 mb-4">
                    <Input prefix={<HiOutlineSearch />} placeholder="Search..." value={search} onChange={(e: any) => { setSearch(e.target.value); setPage(1) }} className="max-w-xs" />
                </div>
                <Tabs value={statusTab} onChange={(val) => { setStatusTab(val as string); setPage(1) }}>
                    <Tabs.TabList>{TAB_OPTIONS.map((t) => <Tabs.TabNav key={t.value} value={t.value}>{t.label}</Tabs.TabNav>)}</Tabs.TabList>
                </Tabs>
                <ReturnsResponsiveTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    getRowId={(row) => row.id}
                    pagingData={{ total, pageIndex: page, pageSize }}
                    onPaginationChange={(p) => setPage(p)}
                    onSelectChange={(s) => setPageSize(s)}
                    tableMinWidthClass="min-w-[980px]"
                />
            </AdaptiveCard>

            {/* Create */}
            <FormDialog isOpen={createOpen} onClose={() => setCreateOpen(false)} size="lg" title="New Scrap" footer={<><Button size="sm" onClick={() => setCreateOpen(false)}>Cancel</Button><Button size="sm" variant="solid" loading={creating} onClick={handleCreate}>Create</Button></>}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormItem label="Warehouse"><Select options={warehouseOpts} value={warehouseOpts.find((o) => o.value === createForm.warehouseId)} onChange={(opt: any) => setCreateForm((p) => ({ ...p, warehouseId: opt?.value ?? '' }))} /></FormItem>
                    <FormItem label="Reason"><Select options={REASON_OPTS} value={REASON_OPTS.find((o) => o.value === createForm.reason)} onChange={(opt: any) => setCreateForm((p) => ({ ...p, reason: opt?.value ?? 'DAMAGE' }))} /></FormItem>
                </div>
                <FormItem label="Remarks" className="mt-2"><Input textArea value={createForm.remarks} onChange={(e: any) => setCreateForm((p) => ({ ...p, remarks: e.target.value }))} /></FormItem>
                <h6 className="mt-4 mb-2">Lines</h6>
                {createLines.map((line, idx) => (
                    <div key={idx} className="flex items-end gap-2 mb-2">
                        <FormItem label="Material" className="flex-1"><Select options={materialOpts} value={materialOpts.find((o) => o.value === line.materialId)} onChange={(opt: any) => setCreateLines((p) => p.map((l, i) => i === idx ? { ...l, materialId: opt?.value ?? '' } : l))} /></FormItem>
                        <FormItem label="Qty" className="w-24"><Input type="number" value={line.quantity} onChange={(e: any) => setCreateLines((p) => p.map((l, i) => i === idx ? { ...l, quantity: Number(e.target.value) } : l))} /></FormItem>
                        <FormItem label="Unit Cost" className="w-28"><Input type="number" value={line.unitCost} onChange={(e: any) => setCreateLines((p) => p.map((l, i) => i === idx ? { ...l, unitCost: Number(e.target.value) } : l))} /></FormItem>
                        <FormItem label="Reason" className="w-36"><Select size="sm" options={REASON_OPTS} value={REASON_OPTS.find((o) => o.value === line.reason)} onChange={(opt: any) => setCreateLines((p) => p.map((l, i) => i === idx ? { ...l, reason: opt?.value ?? 'DAMAGE' } : l))} /></FormItem>
                        <Button size="xs" variant="plain" onClick={() => setCreateLines((p) => p.filter((_, i) => i !== idx))}><HiOutlineTrash /></Button>
                    </div>
                ))}
                <Button size="sm" variant="plain" onClick={() => setCreateLines((p) => [...p, { materialId: '', uomId: '', quantity: 0, unitCost: 0, reason: 'DAMAGE', stockStatus: 'BLOCKED' }])}>+ Add Line</Button>
            </FormDialog>

            <FormDialog
                isOpen={executeOpen}
                onClose={() => setExecuteOpen(false)}
                title="Physical disposal execution"
                footer={
                    <>
                        <Button size="sm" onClick={() => setExecuteOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" loading={executeSaving} onClick={submitExecute}>
                            Confirm execution
                        </Button>
                    </>
                }
            >
                <FormItem label="Witness name" asterisk>
                    <Input value={executeForm.witnessName} onChange={(e: any) => setExecuteForm((p) => ({ ...p, witnessName: e.target.value }))} />
                </FormItem>
                <FormItem label="Disposal method" asterisk className="mt-2">
                    <Input value={executeForm.disposalMethod} onChange={(e: any) => setExecuteForm((p) => ({ ...p, disposalMethod: e.target.value }))} />
                </FormItem>
                <FormItem label="Waste manifest #" className="mt-2">
                    <Input value={executeForm.wasteManifestRef} onChange={(e: any) => setExecuteForm((p) => ({ ...p, wasteManifestRef: e.target.value }))} />
                </FormItem>
                <FormItem label="Notes" className="mt-2">
                    <Input textArea value={executeForm.executionNotes} onChange={(e: any) => setExecuteForm((p) => ({ ...p, executionNotes: e.target.value }))} />
                </FormItem>
            </FormDialog>

            {/* Detail */}
            <FormDialog
                isOpen={detailOpen}
                onClose={() => setDetailOpen(false)}
                size="xl"
                title={detail?.disposalNumber ?? 'Scrap'}
                headerExtra={
                    detail ? (
                        <RdAnimatedStatus
                            status={detail.status}
                            tone={rdStatusTone(detail.status, RD_DISPOSAL_STATUS)}
                        />
                    ) : undefined
                }
                bodyClassName="overflow-x-hidden"
                footerClassName="!justify-between"
                footer={detail ? (
                    <>
                        <div className="flex flex-wrap items-center gap-2">
                            {detail.status === 'DRAFT' && <Button variant="solid" size="sm" onClick={() => doAction('Submitted', () => returnsDisposalService.submitDisposal(detail.id))}>Submit</Button>}
                            {detail.status === 'PENDING_APPROVAL' && <Button variant="solid" size="sm" onClick={() => doAction('Approved', () => returnsDisposalService.approveDisposal(detail.id))}>Approve</Button>}
                            {detail.status === 'PENDING_APPROVAL' && <Button size="sm" onClick={() => doAction('Rejected', () => returnsDisposalService.rejectDisposal(detail.id))}>Reject</Button>}
                            {detail.status === 'APPROVED' && (
                                <Button variant="solid" size="sm" onClick={() => setExecuteOpen(true)}>
                                    Record execution
                                </Button>
                            )}
                            {detail.status === 'EXECUTED' && (
                                <Button variant="solid" size="sm" onClick={() => doAction('Posted', () => returnsDisposalService.postDisposal(detail.id))}>
                                    Post to ledger
                                </Button>
                            )}
                            {['DRAFT', 'REJECTED'].includes(detail.status) && <Button size="sm" onClick={() => doAction('Cancelled', () => returnsDisposalService.cancelDisposal(detail.id))}>Cancel</Button>}
                            {detail.status === 'POSTED' && (
                                <Button size="sm" variant="plain" onClick={() => doAction('Reversed', () => returnsDisposalService.reverseDisposal(detail.id))}>
                                    <HiOutlineRewind className="mr-1" /> Reverse
                                </Button>
                            )}
                        </div>
                        <Button size="sm" onClick={() => setDetailOpen(false)}>Close</Button>
                    </>
                ) : <Button size="sm" onClick={() => setDetailOpen(false)}>Close</Button>}
            >
                {detail && (
                    <div className="space-y-5">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <InfoCard label="Warehouse" value={detail.warehouse?.name} />
                            <InfoCard label="Reason" value={detail.reason} />
                            <InfoCard label="Value" value={fmtMoney(detail.estimatedValue)} />
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
                        {(detail.audits?.length ?? 0) > 0 ? (
                            <div>
                                <h6 className="mb-3 text-sm font-semibold heading-text">Audit trail</h6>
                                <DataTable
                                    columns={auditColumns}
                                    data={detail.audits ?? []}
                                    compact
                                    fit
                                    hidePagination
                                />
                            </div>
                        ) : null}
                    </div>
                )}
            </FormDialog>

            <ConfirmDialog isOpen={!!confirmAction} type="warning" title={`${confirmAction?.action}?`} onClose={() => setConfirmAction(null)} onRequestClose={() => setConfirmAction(null)} onCancel={() => setConfirmAction(null)} onConfirm={async () => { if (confirmAction) { try { await confirmAction.fn() } catch (err: any) { pushToast('danger', 'Error', err?.response?.data?.message || 'Action failed') } setConfirmAction(null) } }}>
                <p>Are you sure?</p>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default ScrapPage
