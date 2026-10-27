'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import FilterBar, {
    type FilterChip,
    type FilterField,
} from '@/components/shared/FilterBar'
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
import Tag from '@/components/ui/Tag'
import {
    HiOutlinePlus,
    HiOutlineEye,
    HiOutlineTrash,
    HiOutlineCheck,
    HiOutlineX,
    HiOutlineRewind,
    HiOutlineInboxIn,
    HiOutlinePrinter,
} from 'react-icons/hi'
import ReceivingReceiptPanel from '@/modules/mm/receiving/components/ReceivingReceiptPanel'
import ReceivingReceiptSlip from '@/modules/mm/receiving/components/ReceivingReceiptSlip'
import { goodsReceiptToSlip } from '@/modules/mm/receiving/utils/receiptSlipMappers'
import { goodsReceiptService } from '../services/goodsReceiptService'
import { useLazyMaterialEntities, useLazyWarehouseEntities } from '@/modules/mm/shared/useLazyMmRefs'
import type { GoodsReceipt, StockOpsQueryParams } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import Iso9001ReceivingWorkflowStrip from '@/modules/mm/shared/components/Iso9001ReceivingWorkflowStrip'
import { buildStockDocColumns } from '../utils/stockDocColumns'
import { StatusSummaryTiles } from '../utils/summaryTiles'
import { DocStatusBadge, StockStatusTag } from '../utils/inventoryUi'
import InfoCard from '../../shared/InfoCard'
import { fmtMoney } from '../../shared/formatters'

const ROUTE = '/modules/mm/inventory-management/goods-receipt'

type FilterOption = { value: string; label: string }

const STATUS_FILTER_OPTIONS: FilterOption[] = [
    { value: '', label: 'All statuses' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'SUBMITTED', label: 'Submitted' },
    { value: 'VERIFIED', label: 'Verified' },
    { value: 'POSTED', label: 'Posted' },
    { value: 'CANCELLED', label: 'Cancelled' },
    { value: 'REVERSED', label: 'Reversed' },
]

const STOCK_STATUS_OPTS = [
    { value: 'UNRESTRICTED', label: 'Unrestricted' },
    { value: 'QUALITY_INSPECTION', label: 'Quality Inspection' },
]

type LineInput = { materialId: string; quantity: number; uomId: string; unitCost: number }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

function fmtDate(iso?: string) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })
}

function supplierLabel(gr: GoodsReceipt) {
    return gr.supplier?.supplierName ?? gr.supplier?.name ?? '—'
}

function materialLabel(line: GoodsReceipt['lines'][number]) {
    return (
        line.material?.materialName ??
        line.material?.name ??
        line.material?.materialCode ??
        line.material?.code ??
        line.materialId
    )
}

function hasDiscrepancy(gr: GoodsReceipt) {
    return (gr.lines ?? []).some((l) => !!l.discrepancyFlag)
}

const GoodsReceiptPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)

    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [rows, setRows] = useState<GoodsReceipt[]>([])
    const [total, setTotal] = useState(0)
    const [summary, setSummary] = useState<{ status: string; count: number }[]>([])
    const [loading, setLoading] = useState(true)

    const queryParams = useMemo<StockOpsQueryParams>(
        () => ({
            page,
            pageSize,
            search: search || undefined,
            status: statusFilter || undefined,
        }),
        [page, pageSize, search, statusFilter],
    )

    const fetchList = useCallback(async () => {
        setLoading(true)
        try {
            const res = await goodsReceiptService.list(queryParams)
            setRows(res.data)
            setTotal(res.total)
            setSummary(res.summary?.byStatus ?? [])
        } catch {
            /* ignore */
        } finally {
            setLoading(false)
        }
    }, [queryParams])

    useEffect(() => {
        fetchList()
    }, [fetchList])

    const { ensure: ensureWarehouses, rows: warehouses } = useLazyWarehouseEntities()
    const { ensure: ensureMaterials, rows: materials } = useLazyMaterialEntities()

    const warehouseOpts = useMemo(
        () => warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })),
        [warehouses],
    )
    const materialOpts = useMemo(
        () =>
            materials.map((m) => ({
                value: m.id,
                label: `${m.materialCode} — ${m.materialName}`,
            })),
        [materials],
    )

    /* ── Create dialog ── */
    const [createOpen, setCreateOpen] = useState(false)
    const [createForm, setCreateForm] = useState({
        companyId: '',
        warehouseId: '',
        postingDate: '',
        documentDate: '',
        stockStatus: 'UNRESTRICTED',
        remarks: '',
    })
    const [createLines, setCreateLines] = useState<LineInput[]>([
        { materialId: '', quantity: 1, uomId: '', unitCost: 0 },
    ])
    const [creating, setCreating] = useState(false)

    const openCreate = useCallback(async () => {
        await Promise.all([ensureWarehouses(), ensureMaterials()])
        setCreateForm({
            companyId: '',
            warehouseId: '',
            postingDate: new Date().toISOString().slice(0, 10),
            documentDate: new Date().toISOString().slice(0, 10),
            stockStatus: 'UNRESTRICTED',
            remarks: '',
        })
        setCreateLines([{ materialId: '', quantity: 1, uomId: '', unitCost: 0 }])
        setCreateOpen(true)
    }, [ensureWarehouses, ensureMaterials])

    const handleCreate = useCallback(async () => {
        setCreating(true)
        try {
            const wh = warehouses.find((w) => w.id === createForm.warehouseId)
            const payload = {
                companyId: wh?.companyId || createForm.companyId,
                warehouseId: createForm.warehouseId,
                postingDate: createForm.postingDate,
                documentDate: createForm.documentDate,
                stockStatus: createForm.stockStatus,
                remarks: createForm.remarks || undefined,
                lines: createLines
                    .filter((l) => l.materialId)
                    .map((l) => ({
                        materialId: l.materialId,
                        quantity: l.quantity,
                        uomId:
                            l.uomId ||
                            materials.find((m) => m.id === l.materialId)?.baseUomId ||
                            '',
                        unitCost: l.unitCost,
                        totalCost: l.quantity * l.unitCost,
                    })),
            }
            await goodsReceiptService.create(payload)
            pushToast('success', 'Created', 'Goods receipt created.')
            setCreateOpen(false)
            fetchList()
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'Creation failed'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : msg)
        } finally {
            setCreating(false)
        }
    }, [createForm, createLines, warehouses, materials, fetchList])

    /* ── Detail dialog ── */
    const [detailOpen, setDetailOpen] = useState(false)
    const [detail, setDetail] = useState<GoodsReceipt | null>(null)
    const [printSlip, setPrintSlip] = useState<
        ReturnType<typeof goodsReceiptToSlip> | null
    >(null)

    const openPrint = useCallback(async (id: string) => {
        try {
            const gr = await goodsReceiptService.get(id)
            setPrintSlip(goodsReceiptToSlip(gr))
        } catch {
            pushToast('danger', 'Error', 'Failed to load receipt for printing')
        }
    }, [])

    const openDetail = useCallback(async (id: string) => {
        setDetailOpen(true)
        try {
            const gr = await goodsReceiptService.get(id)
            setDetail(gr)
            setPrintSlip(null)
        } catch {
            pushToast('danger', 'Error', 'Failed to load')
            setDetailOpen(false)
        }
    }, [])

    const refreshDetail = useCallback(async () => {
        if (!detail) return
        try {
            setDetail(await goodsReceiptService.get(detail.id))
        } catch {
            /* ignore */
        }
    }, [detail])

    const handleAction = useCallback(
        async (action: 'submit' | 'verify' | 'post' | 'cancel' | 'reverse') => {
            if (!detail) return
            const actor = workflowActor.trim()
            if (['submit', 'verify'].includes(action) && !actor) {
                pushToast('danger', 'Required', 'Enter clerk / supervisor name first.')
                return
            }
            try {
                if (action === 'submit') {
                    await goodsReceiptService.submit(detail.id, { submittedBy: actor })
                } else if (action === 'verify') {
                    await goodsReceiptService.verify(detail.id, { verifiedBy: actor })
                } else if (action === 'post') {
                    await goodsReceiptService.post(detail.id)
                } else if (action === 'cancel') {
                    await goodsReceiptService.cancel(detail.id)
                } else {
                    await goodsReceiptService.reverse(detail.id)
                }
                pushToast(
                    'success',
                    action.charAt(0).toUpperCase() + action.slice(1),
                    `${detail.documentNumber} ${action}ed.`,
                )
                await refreshDetail()
                fetchList()
            } catch (err: any) {
                pushToast(
                    'danger',
                    'Error',
                    err?.response?.data?.message || `${action} failed`,
                )
            }
        },
        [detail, refreshDetail, fetchList, workflowActor],
    )

    /* ── Confirm dialog ── */
    const [confirmAction, setConfirmAction] = useState<{
        action: string
        fn: () => void
    } | null>(null)
    const [workflowActor, setWorkflowActor] = useState('')

    const detailLineColumns = useMemo<ColumnDef<GoodsReceipt['lines'][number]>[]>(
        () => [
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
            {
                header: 'Damaged',
                accessorKey: 'damagedQuantity',
                size: 72,
                cell: ({ row }) => Number(row.original.damagedQuantity ?? 0),
            },
            {
                header: 'Variance',
                accessorKey: 'discrepancyFlag',
                size: 88,
                cell: ({ row }) =>
                    row.original.discrepancyFlag ? (
                        <Tag className="border-0 bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                            {row.original.discrepancyFlag}
                        </Tag>
                    ) : (
                        '—'
                    ),
            },
            {
                header: 'UOM',
                accessorKey: 'uom.code',
                size: 64,
                cell: ({ row }) => row.original.uom?.code ?? '—',
            },
            {
                header: 'Unit Cost',
                accessorKey: 'unitCost',
                size: 88,
                cell: ({ row }) => fmtMoney(row.original.unitCost),
            },
            {
                header: 'Total Cost',
                accessorKey: 'totalCost',
                size: 88,
                cell: ({ row }) => fmtMoney(row.original.totalCost),
            },
        ],
        [],
    )

    const columns: ColumnDef<GoodsReceipt>[] = useMemo(
        () =>
            buildStockDocColumns<GoodsReceipt>({
                detail: {
                    header: 'Supplier',
                    value: (row) => supplierLabel(row),
                    sub: (row) =>
                        row.purchaseOrder?.poNumber
                            ? `PO ${row.purchaseOrder.poNumber}`
                            : undefined,
                },
                warehouse: (row) => row.warehouse?.name ?? '—',
                actions: [
                    {
                        header: 'Variance',
                        id: 'variance',
                        cell: ({ row }) =>
                            hasDiscrepancy(row.original) ? (
                                <Tag className="border-0 bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                                    Discrepancy
                                </Tag>
                            ) : (
                                <span className="text-sm text-gray-300">—</span>
                            ),
                    },
                    {
                        header: 'Stock Status',
                        id: 'stockStatus',
                        cell: ({ row }) => (
                            <StockStatusTag status={row.original.stockStatus} />
                        ),
                    },
                    {
                        header: '',
                        id: 'actions',
                        cell: ({ row }) => (
                            <Dropdown
                                renderTitle={<EllipsisButton />}
                                placement="bottom-end"
                            >
                                <Dropdown.Item
                                    eventKey="view"
                                    onClick={() => openDetail(row.original.id)}
                                >
                                    <HiOutlineEye className="mr-2" /> View
                                </Dropdown.Item>
                                <Dropdown.Item
                                    eventKey="print"
                                    onClick={() => openPrint(row.original.id)}
                                >
                                    <HiOutlinePrinter className="mr-2" /> Print receipt
                                </Dropdown.Item>
                                {row.original.status === 'VERIFIED' && (
                                    <Dropdown.Item
                                        eventKey="post"
                                        onClick={() =>
                                            setConfirmAction({
                                                action: 'Post',
                                                fn: async () => {
                                                    await goodsReceiptService.post(
                                                        row.original.id,
                                                    )
                                                    fetchList()
                                                },
                                            })
                                        }
                                    >
                                        <HiOutlineCheck className="mr-2" /> Post
                                    </Dropdown.Item>
                                )}
                                {row.original.status === 'DRAFT' && (
                                    <Dropdown.Item
                                        eventKey="cancel"
                                        onClick={() =>
                                            setConfirmAction({
                                                action: 'Cancel',
                                                fn: async () => {
                                                    await goodsReceiptService.cancel(
                                                        row.original.id,
                                                    )
                                                    fetchList()
                                                },
                                            })
                                        }
                                    >
                                        <HiOutlineX className="mr-2" /> Cancel
                                    </Dropdown.Item>
                                )}
                                {row.original.status === 'POSTED' && (
                                    <Dropdown.Item
                                        eventKey="reverse"
                                        onClick={() =>
                                            setConfirmAction({
                                                action: 'Reverse',
                                                fn: async () => {
                                                    await goodsReceiptService.reverse(
                                                        row.original.id,
                                                    )
                                                    fetchList()
                                                },
                                            })
                                        }
                                    >
                                        <HiOutlineRewind className="mr-2" /> Reverse
                                    </Dropdown.Item>
                                )}
                            </Dropdown>
                        ),
                    },
                ],
            }),
        [openDetail, openPrint, fetchList],
    )

    const chips = useMemo<FilterChip[]>(() => {
        const list: FilterChip[] = []
        if (search)
            list.push({
                key: 'search',
                label: `Search: ${search}`,
                onRemove: () => setSearch(''),
            })
        if (statusFilter)
            list.push({
                key: 'status',
                label: `Status: ${
                    STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter)?.label ??
                    statusFilter
                }`,
                onRemove: () => setStatusFilter(''),
            })
        return list
    }, [search, statusFilter])

    const fields = useMemo<FilterField[]>(
        () => [
            {
                key: 'search',
                label: 'Search',
                kind: 'text',
                inputType: 'search',
                value: search,
                placeholder: 'Document number…',
                onChange: (value) => {
                    setSearch(value)
                    setPage(1)
                },
            },
            {
                key: 'status',
                label: 'Status',
                value: statusFilter,
                options: STATUS_FILTER_OPTIONS,
                onChange: (value) => {
                    setStatusFilter(value)
                    setPage(1)
                },
            },
        ],
        [search, statusFilter],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Goods Receipt"
                description="Receive materials into inventory — every receipt posts through the inventory ledger."
                actions={
                    <Button variant="solid" icon={<HiOutlinePlus />} onClick={openCreate}>
                        New Receipt
                    </Button>
                }
            />
            <Iso9001ReceivingWorkflowStrip activeStep={1} />

            <FilterBar
                className="mb-4"
                fields={fields}
                chips={chips}
                onClear={() => {
                    setSearch('')
                    setStatusFilter('')
                    setPage(1)
                }}
            />

            <StatusSummaryTiles byStatus={summary} total={total} totalLabel="Receipts in scope" />

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                <span>
                    {total} receipt{total === 1 ? '' : 's'} in scope
                </span>
                <span>
                    Page {page} · {pageSize} per page
                </span>
            </div>

            <AdaptiveCard>
                <DataTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    compact
                    noData={rows.length === 0}
                    pagingData={{ total, pageIndex: page, pageSize }}
                    onPaginationChange={(p) => setPage(p)}
                    onSelectChange={(s) => setPageSize(s)}
                />
            </AdaptiveCard>

            {/* Create Dialog */}
            <FormDialog
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                size="lg"
                title="New Goods Receipt"
                icon={<HiOutlineInboxIn />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setCreateOpen(false)}>
                            Cancel
                        </Button>
                        <Button size="sm" variant="solid" loading={creating} onClick={handleCreate}>
                            Create
                        </Button>
                    </>
                }
            >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormItem label="Warehouse">
                        <Select
                            options={warehouseOpts}
                            value={warehouseOpts.find((o) => o.value === createForm.warehouseId)}
                            onChange={(opt: any) =>
                                setCreateForm((p) => ({ ...p, warehouseId: opt?.value ?? '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Stock Status">
                        <Select
                            options={STOCK_STATUS_OPTS}
                            value={{
                                value: createForm.stockStatus,
                                label:
                                    STOCK_STATUS_OPTS.find(
                                        (o) => o.value === createForm.stockStatus,
                                    )?.label ?? createForm.stockStatus,
                            }}
                            onChange={(opt: any) =>
                                setCreateForm((p) => ({
                                    ...p,
                                    stockStatus: opt?.value ?? 'UNRESTRICTED',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Posting Date">
                        <Input
                            type="date"
                            value={createForm.postingDate}
                            onChange={(e: any) =>
                                setCreateForm((p) => ({ ...p, postingDate: e.target.value }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Document Date">
                        <Input
                            type="date"
                            value={createForm.documentDate}
                            onChange={(e: any) =>
                                setCreateForm((p) => ({ ...p, documentDate: e.target.value }))
                            }
                        />
                    </FormItem>
                </div>
                <FormItem label="Remarks" className="mt-2">
                    <Input
                        textArea
                        value={createForm.remarks}
                        onChange={(e: any) =>
                            setCreateForm((p) => ({ ...p, remarks: e.target.value }))
                        }
                    />
                </FormItem>

                <h6 className="mt-4 mb-2">Lines</h6>
                {createLines.map((line, idx) => (
                    <div key={idx} className="flex items-end gap-2 mb-2">
                        <FormItem label="Material" className="flex-1">
                            <Select
                                options={materialOpts}
                                value={materialOpts.find((o) => o.value === line.materialId)}
                                onChange={(opt: any) =>
                                    setCreateLines((p) =>
                                        p.map((l, i) =>
                                            i === idx ? { ...l, materialId: opt?.value ?? '' } : l,
                                        ),
                                    )
                                }
                            />
                        </FormItem>
                        <FormItem label="Qty" className="w-24">
                            <Input
                                type="number"
                                value={line.quantity}
                                onChange={(e: any) =>
                                    setCreateLines((p) =>
                                        p.map((l, i) =>
                                            i === idx ? { ...l, quantity: Number(e.target.value) } : l,
                                        ),
                                    )
                                }
                            />
                        </FormItem>
                        <FormItem label="Unit Cost" className="w-28">
                            <Input
                                type="number"
                                value={line.unitCost}
                                onChange={(e: any) =>
                                    setCreateLines((p) =>
                                        p.map((l, i) =>
                                            i === idx ? { ...l, unitCost: Number(e.target.value) } : l,
                                        ),
                                    )
                                }
                            />
                        </FormItem>
                        <Button
                            size="xs"
                            variant="plain"
                            onClick={() =>
                                setCreateLines((p) => p.filter((_, i) => i !== idx))
                            }
                        >
                            <HiOutlineTrash />
                        </Button>
                    </div>
                ))}
                <Button
                    size="sm"
                    variant="plain"
                    onClick={() =>
                        setCreateLines((p) => [
                            ...p,
                            { materialId: '', quantity: 1, uomId: '', unitCost: 0 },
                        ])
                    }
                >
                    + Add Line
                </Button>
            </FormDialog>

            {/* Detail Dialog */}
            <FormDialog
                isOpen={detailOpen}
                onClose={() => setDetailOpen(false)}
                size="xl"
                title={detail?.documentNumber ?? 'Goods Receipt'}
                icon={<HiOutlineInboxIn />}
                headerExtra={
                    detail ? <DocStatusBadge status={detail.status} /> : undefined
                }
                bodyClassName="overflow-x-hidden"
                footerClassName="!justify-between"
                footer={
                    detail ? (
                        <>
                            <div className="flex flex-wrap items-center gap-2">
                                {['DRAFT', 'SUBMITTED', 'VERIFIED'].includes(detail.status) && (
                                    <Input
                                        className="max-w-[180px]"
                                        placeholder="Your name (ISO audit)"
                                        value={workflowActor}
                                        onChange={(e: any) => setWorkflowActor(e.target.value)}
                                    />
                                )}
                                {detail.status === 'DRAFT' && (
                                    <Button size="sm" onClick={() => handleAction('submit')}>
                                        Submit
                                    </Button>
                                )}
                                {detail.status === 'SUBMITTED' && (
                                    <Button
                                        variant="solid"
                                        size="sm"
                                        onClick={() => handleAction('verify')}
                                    >
                                        Verify
                                    </Button>
                                )}
                                {detail.status === 'VERIFIED' && (
                                    <Button
                                        variant="solid"
                                        size="sm"
                                        onClick={() => handleAction('post')}
                                    >
                                        Post
                                    </Button>
                                )}
                                {['DRAFT', 'SUBMITTED'].includes(detail.status) && (
                                    <Button size="sm" onClick={() => handleAction('cancel')}>
                                        Cancel
                                    </Button>
                                )}
                                {detail.status === 'POSTED' && (
                                    <Button
                                        size="sm"
                                        variant="plain"
                                        onClick={() => handleAction('reverse')}
                                    >
                                        <HiOutlineRewind className="mr-1" /> Reverse
                                    </Button>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    size="sm"
                                    icon={<HiOutlinePrinter />}
                                    onClick={() => window.print()}
                                >
                                    Print receipt
                                </Button>
                                <Button size="sm" onClick={() => setDetailOpen(false)}>
                                    Close
                                </Button>
                            </div>
                        </>
                    ) : (
                        <Button size="sm" onClick={() => setDetailOpen(false)}>
                            Close
                        </Button>
                    )
                }
            >
                {detail && (
                    <div className="space-y-5">
                        <ReceivingReceiptPanel
                            data={goodsReceiptToSlip(detail)}
                            enablePrintPortal={detailOpen}
                            title="Goods receipt slip"
                        />
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <InfoCard label="Supplier" value={supplierLabel(detail)} />
                            <InfoCard label="Warehouse" value={detail.warehouse?.name} />
                            <InfoCard label="Posting Date" value={fmtDate(detail.postingDate)} />
                            <InfoCard label="Stock Status" value={detail.stockStatus} />
                            <InfoCard label="PO" value={detail.purchaseOrder?.poNumber} />
                            <InfoCard label="Created" value={fmtDate(detail.createdAt)} />
                        </div>
                        {detail.remarks ? (
                            <AdaptiveCard className="!p-3">
                                <p className="text-xs text-gray-500">Remarks</p>
                                <p className="mt-0.5 text-sm">{detail.remarks}</p>
                            </AdaptiveCard>
                        ) : null}
                        <div>
                            <h6 className="mb-3 text-sm font-semibold heading-text">
                                Line items
                            </h6>
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

            {printSlip && !detailOpen && typeof document !== 'undefined'
                ? createPortal(
                      <div className="print-isolate hidden print:block">
                          <ReceivingReceiptSlip data={printSlip} />
                      </div>,
                      document.body,
                  )
                : null}

            <FormDialog
                isOpen={printSlip !== null && !detailOpen}
                onClose={() => setPrintSlip(null)}
                size="lg"
                title="Goods receipt"
                icon={<HiOutlinePrinter />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setPrintSlip(null)}>
                            Close
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            icon={<HiOutlinePrinter />}
                            onClick={() => window.print()}
                        >
                            Print receipt
                        </Button>
                    </>
                }
            >
                {printSlip ? (
                    <div className="max-h-[70vh] overflow-y-auto rounded border border-gray-200 dark:border-gray-600">
                        <ReceivingReceiptSlip data={printSlip} />
                    </div>
                ) : null}
            </FormDialog>

            <ConfirmDialog
                isOpen={!!confirmAction}
                type="warning"
                title={`${confirmAction?.action}?`}
                onClose={() => setConfirmAction(null)}
                onRequestClose={() => setConfirmAction(null)}
                onCancel={() => setConfirmAction(null)}
                onConfirm={async () => {
                    if (confirmAction) {
                        try {
                            await confirmAction.fn()
                        } catch (err: any) {
                            pushToast(
                                'danger',
                                'Error',
                                err?.response?.data?.message || 'Action failed',
                            )
                        }
                        setConfirmAction(null)
                    }
                }}
            >
                <p>Are you sure?</p>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default GoodsReceiptPage
