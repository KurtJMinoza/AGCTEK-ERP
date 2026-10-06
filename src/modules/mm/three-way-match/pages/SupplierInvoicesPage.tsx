'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import FormDialog from '@/components/shared/FormDialog'
import EllipsisButton from '@/components/shared/EllipsisButton'
import StatusBadge from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import Dropdown from '@/components/ui/Dropdown'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlineEye, HiOutlinePlus, HiOutlinePrinter, HiOutlineReceiptTax } from 'react-icons/hi'
import { threeWayMatchService } from '../services/threeWayMatchService'
import { SupplierInvoicePrintHost } from '../components/SupplierInvoicePrintHost'
import { supplierInvoiceToSlip } from '../utils/supplierInvoiceSlipMappers'
import type { SupplierInvoiceSlipData } from '../components/SupplierInvoiceSlip'
import InfoCard from '@/modules/mm/shared/InfoCard'
import { fmtMoney } from '@/modules/mm/shared/formatters'
import { goodsReceiptService } from '@/modules/mm/inventory/services/goodsReceiptService'
import { useLazyMmRefs } from '@/modules/mm/shared/useLazyMmRefs'
import type { SupplierInvoice } from '../types'
import type { GoodsReceipt } from '@/modules/mm/inventory/types'
import type { MmPurchaseOrder, MmPurchaseOrderLine } from '@/modules/mm/procurement/types'
import { poInvoiceOpenQty } from '@/modules/mm/procurement/types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import {
    firstError,
    positiveNumber,
    required,
    visibleError,
    type FieldErrors,
} from '@/modules/mm/shared/formValidation'

const ROUTE = '/modules/mm/procurement/supplier-invoices'

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

type GrPick = { value: string; label: string; maxQty: number }

const SupplierInvoicesPage = () => {
    const searchParams = useSearchParams()
    const highlightId = searchParams.get('invoiceId')
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<SupplierInvoice[]>([])
    const [loading, setLoading] = useState(false)
    const { ensure: ensureFormRefs, companies, suppliers } = useLazyMmRefs()
    const [open, setOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [poLookup, setPoLookup] = useState('')
    const [po, setPo] = useState<MmPurchaseOrder | null>(null)
    const [poLoading, setPoLoading] = useState(false)
    const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10))
    const [supplierId, setSupplierId] = useState('')
    const [remarks, setRemarks] = useState('')
    const [invLines, setInvLines] = useState<Record<string, string>>({})
    const [grLineId, setGrLineId] = useState<Record<string, string>>({})
    const [grOpts, setGrOpts] = useState<Record<string, GrPick[]>>({})
    const [touched, setTouched] = useState<Record<string, boolean>>({})
    const [forceValidate, setForceValidate] = useState(false)
    const [detailOpen, setDetailOpen] = useState(false)
    const [detail, setDetail] = useState<SupplierInvoice | null>(null)
    const [printSlip, setPrintSlip] = useState<SupplierInvoiceSlipData | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await threeWayMatchService.listInvoices({ limit: 50 })
            setRows(res.data)
        } catch (e: unknown) {
            const err = e as { response?: { data?: { message?: string } } }
            pushToast('danger', 'Error', err?.response?.data?.message || 'Load failed')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load()
    }, [load])

    const openDetail = useCallback(async (invoiceId: string) => {
        setDetailOpen(true)
        try {
            const inv = await threeWayMatchService.getInvoice(invoiceId)
            setDetail(inv)
            setPrintSlip(null)
        } catch {
            pushToast('danger', 'Error', 'Failed to load invoice')
            setDetailOpen(false)
        }
    }, [])

    const openPrint = useCallback(async (invoiceId: string) => {
        try {
            const inv = await threeWayMatchService.getInvoice(invoiceId)
            setPrintSlip(supplierInvoiceToSlip(inv))
            setDetailOpen(false)
            setDetail(null)
        } catch {
            pushToast('danger', 'Error', 'Failed to load invoice for printing')
        }
    }, [])

    useEffect(() => {
        if (highlightId) void openDetail(highlightId)
    }, [highlightId, openDetail])

    const invOpenLines = useMemo(
        () => (po?.lines ?? []).filter((l) => poInvoiceOpenQty(l) > 0),
        [po],
    )

    const loadPo = async (poIdOrNumber: string) => {
        const q = poIdOrNumber.trim()
        if (!q) return
        setPoLoading(true)
        try {
            let poData: MmPurchaseOrder
            if (q.startsWith('PO-') || q.length < 20) {
                const list = await ErpAxiosBase.get('/mm/purchase-orders', {
                    params: { search: q, pageSize: 5 },
                }).then((r) => r.data)
                const hit = (list.data ?? []).find(
                    (p: MmPurchaseOrder) => p.poNumber === q || p.id === q,
                ) ?? list.data?.[0]
                if (!hit?.id) throw new Error('PO not found')
                poData = await ErpAxiosBase.get(`/mm/purchase-orders/${hit.id}`).then((r) => r.data)
            } else {
                poData = await ErpAxiosBase.get(`/mm/purchase-orders/${q}`).then((r) => r.data)
            }
            setPo(poData)
            setSupplierId(poData.supplierId ?? '')
            const openLines = (poData.lines ?? []).filter((l: MmPurchaseOrderLine) => poInvoiceOpenQty(l) > 0)
            const grRes = await goodsReceiptService.list({
                purchaseOrderId: poData.id,
                status: 'POSTED',
                pageSize: 100,
            })
            const receipts = (grRes.data ?? []) as GoodsReceipt[]
            const opts: Record<string, GrPick[]> = {}
            const qtyInit: Record<string, string> = {}
            const grInit: Record<string, string> = {}
            for (const l of openLines) {
                const open = poInvoiceOpenQty(l)
                qtyInit[l.id] = String(open)
                const picks: GrPick[] = []
                for (const gr of receipts) {
                    for (const gl of gr.lines ?? []) {
                        if (gl.purchaseOrderLineId && gl.purchaseOrderLineId !== l.id) continue
                        if (!gl.purchaseOrderLineId && gl.materialId !== l.materialId) continue
                        picks.push({
                            value: gl.id,
                            label: `${gr.documentNumber} · qty ${Number(gl.quantity)}`,
                            maxQty: Number(gl.quantity),
                        })
                    }
                }
                opts[l.id] = picks
                grInit[l.id] = picks[0]?.value ?? ''
            }
            setGrOpts(opts)
            setInvLines(qtyInit)
            setGrLineId(grInit)
        } catch (e: unknown) {
            const err = e as { response?: { data?: { message?: string } }; message?: string }
            pushToast('danger', 'PO', err?.response?.data?.message || err?.message || 'Failed to load PO')
            setPo(null)
        } finally {
            setPoLoading(false)
        }
    }

    const openCreate = useCallback(async () => {
        await ensureFormRefs('companies', 'suppliers')
        setPo(null)
        setPoLookup('')
        setInvoiceDate(new Date().toISOString().slice(0, 10))
        setSupplierId('')
        setRemarks('')
        setInvLines({})
        setGrLineId({})
        setGrOpts({})
        setTouched({})
        setForceValidate(false)
        setOpen(true)
    }, [ensureFormRefs])

    const errors = useMemo<FieldErrors>(() => {
        const errs: FieldErrors = {}
        if (!po) errs.po = 'Load a purchase order'
        const sid = po?.supplierId || supplierId
        if (po && !sid) errs.supplierId = 'Supplier required'
        for (const l of invOpenLines) {
            const qty = invLines[l.id] ?? ''
            errs[l.id] = firstError(required(qty, 'Qty'), positiveNumber(qty, 'Qty'))
            const n = Number(qty)
            if (!errs[l.id] && n > poInvoiceOpenQty(l)) {
                errs[l.id] = `Max ${poInvoiceOpenQty(l)}`
            }
            if (n > 0 && !grLineId[l.id]) {
                errs[`gr-${l.id}`] = 'Select GR line'
            }
        }
        return errs
    }, [po, supplierId, invOpenLines, invLines, grLineId])

    const columns: ColumnDef<SupplierInvoice>[] = useMemo(
        () => [
            {
                header: 'Invoice',
                accessorKey: 'invoiceNumber',
                cell: ({ row }) => (
                    <span className={row.original.id === highlightId ? 'font-bold text-primary' : ''}>
                        {row.original.invoiceNumber}
                    </span>
                ),
            },
            {
                header: 'Supplier',
                cell: ({ row }) =>
                    row.original.supplier?.supplierName || row.original.supplierId,
            },
            {
                header: 'PO',
                cell: ({ row }) =>
                    row.original.purchaseOrder?.poNumber ? (
                        <Link
                            className="text-primary hover:underline"
                            href={`/modules/mm/procurement/purchase-orders/${row.original.purchaseOrderId}`}
                        >
                            {row.original.purchaseOrder.poNumber}
                        </Link>
                    ) : (
                        row.original.purchaseOrderId
                    ),
            },
            { header: 'Total', accessorKey: 'totalAmount' },
            {
                header: 'Status',
                cell: ({ row }) => <StatusBadge status={row.original.status} />,
            },
            {
                header: 'Match',
                cell: ({ row }) => row.original.matchStatus || '—',
            },
            {
                header: '',
                id: 'actions',
                size: 56,
                enableSorting: false,
                cell: ({ row }) => (
                    <Dropdown renderTitle={<EllipsisButton />} placement="bottom-end">
                        <Dropdown.Item eventKey="view" onClick={() => void openDetail(row.original.id)}>
                            <HiOutlineEye className="mr-2 text-base" />
                            View details
                        </Dropdown.Item>
                        <Dropdown.Item eventKey="print" onClick={() => void openPrint(row.original.id)}>
                            <HiOutlinePrinter className="mr-2 text-base" />
                            Print invoice
                        </Dropdown.Item>
                        {row.original.status === 'DRAFT' && (
                            <Dropdown.Item
                                eventKey="submit"
                                onClick={async () => {
                                    try {
                                        await threeWayMatchService.submitInvoice(row.original.id)
                                        pushToast('success', 'Submitted', 'Ready to match')
                                        load()
                                    } catch (e: unknown) {
                                        const err = e as { response?: { data?: { message?: string } } }
                                        pushToast('danger', 'Fail', err?.response?.data?.message || 'Submit failed')
                                    }
                                }}
                            >
                                Submit for match
                            </Dropdown.Item>
                        )}
                        {row.original.status === 'SUBMITTED' && (
                            <Dropdown.Item
                                eventKey="match"
                                onClick={async () => {
                                    try {
                                        await threeWayMatchService.runMatch(row.original.id)
                                        pushToast('success', 'Matched', 'Three-way match run')
                                        load()
                                    } catch (e: unknown) {
                                        const err = e as { response?: { data?: { message?: string } } }
                                        pushToast('danger', 'Fail', err?.response?.data?.message || 'Match failed')
                                    }
                                }}
                            >
                                Run match
                            </Dropdown.Item>
                        )}
                    </Dropdown>
                ),
            },
        ],
        [load, highlightId, openDetail, openPrint],
    )

    const detailLineColumns = useMemo<ColumnDef<NonNullable<SupplierInvoice['lines']>[number]>[]>(
        () => [
            { header: '#', accessorKey: 'lineNumber', size: 40 },
            {
                header: 'Material',
                id: 'm',
                cell: ({ row }) =>
                    row.original.material
                        ? `${row.original.material.materialCode} — ${row.original.material.materialName}`
                        : row.original.materialId,
            },
            { header: 'Qty', accessorKey: 'invoicedQuantity' },
            { header: 'UOM', id: 'uom', cell: ({ row }) => row.original.uom?.code ?? '—' },
            { header: 'Unit price', accessorKey: 'unitPrice', cell: ({ row }) => fmtMoney(row.original.unitPrice) },
            { header: 'Tax', accessorKey: 'taxAmount', cell: ({ row }) => fmtMoney(row.original.taxAmount) },
            { header: 'Line total', accessorKey: 'lineTotal', cell: ({ row }) => fmtMoney(row.original.lineTotal) },
            {
                header: 'GR ref',
                id: 'gr',
                cell: ({ row }) => {
                    const docs = (row.original.receipts ?? [])
                        .map((r) => r.goodsReceiptLine?.receipt?.documentNumber)
                        .filter(Boolean)
                    return docs.length ? docs.join(', ') : '—'
                },
            },
        ],
        [],
    )

    const submit = async () => {
        setForceValidate(true)
        if (!po || Object.values(errors).some(Boolean)) {
            pushToast('danger', 'Validation', 'Load PO and complete all lines.')
            return
        }
        const selected = invOpenLines.filter((l) => Number(invLines[l.id]) > 0)
        if (!selected.length) {
            pushToast('danger', 'Validation', 'Enter at least one quantity.')
            return
        }
        setSubmitting(true)
        try {
            const sid = po.supplierId || supplierId
            const inv = await threeWayMatchService.createInvoice({
                companyId: po.companyId,
                supplierId: sid,
                purchaseOrderId: po.id,
                currencyId: po.currencyId || undefined,
                invoiceDate,
                remarks: remarks.trim() || undefined,
                lines: selected.map((l) => {
                    const qty = Number(invLines[l.id])
                    const ordered = Number(l.quantity) || 1
                    return {
                        materialId: l.materialId,
                        purchaseOrderLineId: l.id,
                        uomId: l.uomId,
                        invoicedQuantity: qty,
                        unitPrice: Number(l.unitPrice),
                        taxAmount: (Number(l.tax || 0) / ordered) * qty,
                        receipts: [
                            {
                                goodsReceiptLineId: grLineId[l.id],
                                allocatedQuantity: qty,
                            },
                        ],
                    }
                }),
            })
            await threeWayMatchService.submitInvoice(inv.id)
            setOpen(false)
            pushToast('success', 'Created', `${inv.invoiceNumber} submitted for matching`)
            const full = await threeWayMatchService.getInvoice(inv.id)
            setPrintSlip(supplierInvoiceToSlip(full))
            load()
        } catch (e: unknown) {
            const err = e as { response?: { data?: { message?: string | string[] } } }
            const msg = err?.response?.data?.message || 'Create failed'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : msg)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Supplier Invoices"
                description="Capture vendor invoices against PO and posted goods receipts (same flow as PO → Receiving → Invoice tab)"
                actions={
                    <Button variant="solid" icon={<HiOutlinePlus />} onClick={() => void openCreate()}>
                        New Invoice
                    </Button>
                }
            />
            <AdaptiveCard>
                <DataTable columns={columns} data={rows} loading={loading} />
            </AdaptiveCard>

            <FormDialog
                isOpen={open}
                onClose={() => setOpen(false)}
                title="Create Supplier Invoice"
                size="lg"
                footer={
                    <>
                        <Button size="sm" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" loading={submitting} onClick={() => void submit()}>
                            Create & Submit
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <FormItem label="Purchase order" asterisk>
                        <div className="flex gap-2">
                            <Input
                                placeholder="PO number or ID"
                                value={poLookup}
                                onChange={(e) => setPoLookup(e.target.value)}
                            />
                            <Button size="sm" loading={poLoading} onClick={() => void loadPo(poLookup)}>
                                Load
                            </Button>
                        </div>
                        {po ? (
                            <p className="mt-1 text-xs text-gray-500">
                                Loaded {po.poNumber} · {po.lines?.length ?? 0} line(s)
                            </p>
                        ) : null}
                    </FormItem>
                    <FormItem label="Invoice date">
                        <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
                    </FormItem>
                    {po && !po.supplierId ? (
                        <FormItem
                            label="Supplier"
                            asterisk
                            invalid={Boolean(visibleError(errors, touched, 'supplierId', forceValidate))}
                            errorMessage={visibleError(errors, touched, 'supplierId', forceValidate)}
                        >
                            <Select
                                isSearchable
                                options={suppliers}
                                value={suppliers.find((o) => o.value === supplierId) ?? null}
                                onChange={(o: { value?: string } | null) => {
                                    setSupplierId(o?.value ?? '')
                                    setTouched((t) => ({ ...t, supplierId: true }))
                                }}
                            />
                        </FormItem>
                    ) : null}
                    <FormItem label="Remarks">
                        <Input textArea value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                    </FormItem>
                    {invOpenLines.map((l) => {
                        const err = visibleError(errors, touched, l.id, forceValidate)
                        const grErr = visibleError(errors, touched, `gr-${l.id}`, forceValidate)
                        const options = (grOpts[l.id] ?? []).map((o) => ({ value: o.value, label: o.label }))
                        return (
                            <div key={l.id} className="rounded-lg border border-gray-200 p-3 dark:border-gray-600">
                                <p className="mb-2 text-sm font-semibold">
                                    {l.material?.materialCode ?? l.materialId} · open {poInvoiceOpenQty(l)}
                                </p>
                                <FormItem label="Invoiced qty" asterisk invalid={Boolean(err)} errorMessage={err}>
                                    <Input
                                        type="number"
                                        value={invLines[l.id] ?? ''}
                                        onChange={(e) => {
                                            setInvLines((p) => ({ ...p, [l.id]: e.target.value }))
                                            setTouched((t) => ({ ...t, [l.id]: true }))
                                        }}
                                    />
                                </FormItem>
                                {Number(invLines[l.id]) > 0 ? (
                                    <FormItem
                                        label="GR line"
                                        asterisk
                                        invalid={Boolean(grErr)}
                                        errorMessage={grErr}
                                    >
                                        <Select
                                            isSearchable
                                            options={options}
                                            value={options.find((o) => o.value === grLineId[l.id]) ?? null}
                                            onChange={(o: { value?: string } | null) => {
                                                setGrLineId((p) => ({ ...p, [l.id]: o?.value ?? '' }))
                                                setTouched((t) => ({ ...t, [`gr-${l.id}`]: true }))
                                            }}
                                        />
                                    </FormItem>
                                ) : null}
                            </div>
                        )
                    })}
                    {po && invOpenLines.length === 0 ? (
                        <p className="text-sm text-gray-500">No received quantity left to invoice on this PO.</p>
                    ) : null}
                </div>
            </FormDialog>

            <FormDialog
                isOpen={detailOpen}
                onClose={() => setDetailOpen(false)}
                size="xl"
                title={detail?.invoiceNumber ?? 'Supplier invoice'}
                icon={<HiOutlineReceiptTax />}
                headerExtra={
                    detail ? (
                        <StatusBadge status={detail.status} />
                    ) : undefined
                }
                footer={
                    detail ? (
                        <>
                            <div className="flex flex-wrap gap-2">
                                {detail.status === 'DRAFT' && (
                                    <Button
                                        size="sm"
                                        variant="solid"
                                        onClick={async () => {
                                            await threeWayMatchService.submitInvoice(detail.id)
                                            pushToast('success', 'Submitted', 'Ready to match')
                                            void openDetail(detail.id)
                                            load()
                                        }}
                                    >
                                        Submit
                                    </Button>
                                )}
                                {detail.status === 'SUBMITTED' && (
                                    <Button
                                        size="sm"
                                        variant="solid"
                                        onClick={async () => {
                                            await threeWayMatchService.runMatch(detail.id)
                                            pushToast('success', 'Matched', 'Done')
                                            void openDetail(detail.id)
                                            load()
                                        }}
                                    >
                                        Run match
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
                {detail ? (
                    <div className="space-y-5">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <InfoCard
                                label="Supplier"
                                value={
                                    detail.supplier
                                        ? `${detail.supplier.supplierCode} — ${detail.supplier.supplierName}`
                                        : detail.supplierId
                                }
                            />
                            <InfoCard label="PO" value={detail.purchaseOrder?.poNumber ?? '—'} />
                            <InfoCard label="Invoice date" value={detail.invoiceDate?.slice(0, 10)} />
                            <InfoCard label="Status" value={detail.status} />
                            <InfoCard label="Match" value={detail.matchStatus ?? '—'} />
                            <InfoCard
                                label="Payment eligible"
                                value={detail.paymentEligible ? 'Yes' : 'No'}
                            />
                            <InfoCard label="Total" value={fmtMoney(detail.totalAmount)} />
                            <InfoCard label="Tax" value={fmtMoney(detail.taxAmount)} />
                            <InfoCard label="Remarks" value={detail.remarks ?? '—'} />
                        </div>
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
                ) : null}
            </FormDialog>

            <SupplierInvoicePrintHost slip={printSlip} onClose={() => setPrintSlip(null)} />
        </PageContainer>
    )
}

export default SupplierInvoicesPage
