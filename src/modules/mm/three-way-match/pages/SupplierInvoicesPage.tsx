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
import { useLazyMmRefs } from '@/modules/mm/shared/useLazyMmRefs'
import type { SupplierInvoice } from '../types'
import type { MmPurchaseOrder, MmPurchaseOrderLine } from '@/modules/mm/procurement/types'
import { poInvoiceOpenQty } from '@/modules/mm/procurement/types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    listPurchaseOrdersForInvoicing,
    loadSupplierInvoicePoDraft,
    resolvePurchaseOrderId,
} from '../utils/supplierInvoicePoDraft'
import {
    firstError,
    positiveNumber,
    required,
    visibleError,
    type FieldErrors,
} from '@/modules/mm/shared/formValidation'

const ROUTE = '/modules/mm/procurement/supplier-invoices'

function pushToast(type: 'success' | 'danger' | 'warning', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

type PoSelectOption = { value: string; label: string }

const SupplierInvoicesPage = () => {
    const searchParams = useSearchParams()
    const highlightId = searchParams.get('invoiceId')
    const prefillPoId = searchParams.get('purchaseOrderId')
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<SupplierInvoice[]>([])
    const [loading, setLoading] = useState(false)
    const { ensure: ensureFormRefs, suppliers } = useLazyMmRefs()
    const [open, setOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [poLookup, setPoLookup] = useState('')
    const [poOptions, setPoOptions] = useState<PoSelectOption[]>([])
    const [poOptionsLoading, setPoOptionsLoading] = useState(false)
    const [selectedPoId, setSelectedPoId] = useState<string | null>(null)
    const [po, setPo] = useState<MmPurchaseOrder | null>(null)
    const [poLoading, setPoLoading] = useState(false)
    const [postedGrCount, setPostedGrCount] = useState(0)
    const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10))
    const [supplierId, setSupplierId] = useState('')
    const [remarks, setRemarks] = useState('')
    const [invLines, setInvLines] = useState<Record<string, string>>({})
    const [grLineId, setGrLineId] = useState<Record<string, string>>({})
    const [grOpts, setGrOpts] = useState<
        Record<string, { value: string; label: string; maxQty: number }[]>
    >({})
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

    const poQtySummary = useMemo(() => {
        const lines = po?.lines ?? []
        const received = lines.reduce((s, l) => s + Number(l.receivedQuantity || 0), 0)
        const invoiced = lines.reduce((s, l) => s + Number(l.invoicedQuantity || 0), 0)
        const open = lines.reduce((s, l) => s + poInvoiceOpenQty(l), 0)
        return {
            ordered: lines.reduce((s, l) => s + Number(l.quantity), 0),
            received,
            invoiced,
            open,
        }
    }, [po])

    const canInvoicePo = invOpenLines.length > 0

    const poLinePreviewColumns = useMemo<ColumnDef<MmPurchaseOrderLine>[]>(
        () => [
            { header: '#', accessorKey: 'lineNumber', size: 44 },
            {
                header: 'Material',
                id: 'm',
                cell: ({ row }) => (
                    <span className="text-sm">
                        {row.original.material?.materialCode ?? row.original.materialId}
                    </span>
                ),
            },
            {
                header: 'Received',
                id: 'rcv',
                cell: ({ row }) => <span>{Number(row.original.receivedQuantity || 0)}</span>,
            },
            {
                header: 'Invoiced',
                id: 'inv',
                cell: ({ row }) => <span>{Number(row.original.invoicedQuantity || 0)}</span>,
            },
            {
                header: 'Open',
                id: 'open',
                cell: ({ row }) => (
                    <span
                        className={
                            poInvoiceOpenQty(row.original) > 0
                                ? 'font-medium text-primary'
                                : 'text-gray-400'
                        }
                    >
                        {poInvoiceOpenQty(row.original)}
                    </span>
                ),
            },
        ],
        [],
    )

    const applyPoDraft = useCallback(
        (draft: Awaited<ReturnType<typeof loadSupplierInvoicePoDraft>>) => {
            setPo(draft.po)
            setSelectedPoId(draft.po.id)
            setSupplierId(draft.po.supplierId ?? '')
            setGrOpts(draft.grOpts)
            setInvLines(draft.invLines)
            setGrLineId(draft.grLineId)
            setPostedGrCount(draft.postedReceiptCount)
        },
        [],
    )

    const clearPoDraft = useCallback(() => {
        setPo(null)
        setSelectedPoId(null)
        setPostedGrCount(0)
        setInvLines({})
        setGrLineId({})
        setGrOpts({})
    }, [])

    const loadPoById = useCallback(
        async (purchaseOrderId: string) => {
            setPoLoading(true)
            try {
                const draft = await loadSupplierInvoicePoDraft(purchaseOrderId)
                applyPoDraft(draft)
                if (draft.openLines.length === 0) {
                    pushToast(
                        'warning',
                        'Nothing to invoice',
                        draft.postedReceiptCount === 0
                            ? 'This PO has no posted goods receipts yet. Receive and post a GR first.'
                            : 'All received quantity on this PO is already invoiced.',
                    )
                } else if (draft.postedReceiptCount === 0) {
                    pushToast(
                        'warning',
                        'Goods receipts',
                        'No posted GR found — you will need a posted receipt to allocate each line.',
                    )
                }
            } catch (e: unknown) {
                const err = e as { response?: { data?: { message?: string } }; message?: string }
                pushToast(
                    'danger',
                    'PO',
                    err?.response?.data?.message || err?.message || 'Failed to load PO',
                )
                clearPoDraft()
            } finally {
                setPoLoading(false)
            }
        },
        [applyPoDraft, clearPoDraft],
    )

    const loadPoOptions = useCallback(async () => {
        setPoOptionsLoading(true)
        try {
            const list = await listPurchaseOrdersForInvoicing()
            setPoOptions(
                list.map((p) => ({
                    value: p.id,
                    label: `${p.poNumber} — ${p.supplier?.supplierName ?? 'No supplier'} (${p.status})`,
                })),
            )
        } catch {
            setPoOptions([])
            pushToast('danger', 'PO list', 'Could not load purchase orders ready for invoicing.')
        } finally {
            setPoOptionsLoading(false)
        }
    }, [])

    const loadPoFromLookup = async () => {
        const q = poLookup.trim()
        if (!q) {
            pushToast('warning', 'Purchase order', 'Choose a PO from the list or enter a PO number.')
            return
        }
        try {
            const id = await resolvePurchaseOrderId(q)
            await loadPoById(id)
        } catch (e: unknown) {
            const err = e as { message?: string }
            pushToast('danger', 'PO', err?.message || 'PO not found')
            clearPoDraft()
        }
    }

    const openCreate = useCallback(async () => {
        await ensureFormRefs('companies', 'suppliers')
        clearPoDraft()
        setPoLookup('')
        setInvoiceDate(new Date().toISOString().slice(0, 10))
        setSupplierId('')
        setRemarks('')
        setTouched({})
        setForceValidate(false)
        setOpen(true)
        void loadPoOptions()
    }, [ensureFormRefs, clearPoDraft, loadPoOptions])

    useEffect(() => {
        if (!prefillPoId || highlightId) return
        void (async () => {
            await ensureFormRefs('companies', 'suppliers')
            setOpen(true)
            setForceValidate(false)
            setTouched({})
            void loadPoOptions()
            await loadPoById(prefillPoId)
        })()
    }, [prefillPoId, highlightId, ensureFormRefs, loadPoById, loadPoOptions])

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
                description="Select a partially or fully received PO, allocate posted goods receipt lines, then create and submit for three-way match."
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
                        <Button
                            size="sm"
                            variant="solid"
                            loading={submitting}
                            disabled={!canInvoicePo}
                            onClick={() => void submit()}
                        >
                            Create & Submit
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <FormItem
                        label="Purchase order"
                        asterisk
                        invalid={Boolean(visibleError(errors, touched, 'po', forceValidate))}
                        errorMessage={visibleError(errors, touched, 'po', forceValidate)}
                    >
                        <Select
                            isSearchable
                            placeholder={
                                poOptionsLoading
                                    ? 'Loading POs with receipts…'
                                    : 'Select PO (partially or fully received)'
                            }
                            isLoading={poOptionsLoading || poLoading}
                            options={poOptions}
                            value={
                                selectedPoId
                                    ? (poOptions.find((o) => o.value === selectedPoId) ?? {
                                          value: selectedPoId,
                                          label: po?.poNumber ?? selectedPoId,
                                      })
                                    : null
                            }
                            onChange={(o: PoSelectOption | null) => {
                                const id = o?.value ?? ''
                                setSelectedPoId(id || null)
                                setTouched((t) => ({ ...t, po: true }))
                                if (id) void loadPoById(id)
                                else clearPoDraft()
                            }}
                        />
                        <p className="mt-2 text-xs text-gray-500">
                            Or find by number:{' '}
                            <span className="inline-flex w-full max-w-md flex-wrap items-center gap-2 sm:inline-flex">
                                <Input
                                    className="min-w-[12rem] flex-1"
                                    placeholder="PO-2026-00042"
                                    value={poLookup}
                                    onChange={(e) => setPoLookup(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault()
                                            void loadPoFromLookup()
                                        }
                                    }}
                                />
                                <Button
                                    size="sm"
                                    type="button"
                                    loading={poLoading}
                                    onClick={() => void loadPoFromLookup()}
                                >
                                    Find PO
                                </Button>
                            </span>
                        </p>
                    </FormItem>
                    {po ? (
                        <AdaptiveCard className="overflow-hidden !p-0">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-600">
                                <div>
                                    <p className="text-sm font-semibold heading-text">{po.poNumber}</p>
                                    <p className="text-xs text-gray-500">
                                        Invoice-open = received − invoiced on each PO line
                                    </p>
                                </div>
                                <StatusBadge status={po.status} />
                            </div>
                            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
                                <InfoCard
                                    label="Supplier"
                                    value={
                                        po.supplier
                                            ? `${po.supplier.supplierCode} — ${po.supplier.supplierName}`
                                            : 'Not set on PO'
                                    }
                                />
                                <InfoCard label="Open to invoice" value={String(poQtySummary.open)} />
                                <InfoCard label="Posted GRs" value={String(postedGrCount)} />
                                <InfoCard label="Received (PO)" value={String(poQtySummary.received)} />
                                <InfoCard label="Invoiced (PO)" value={String(poQtySummary.invoiced)} />
                            </div>
                            <div className="border-t border-gray-200 px-2 pb-2 dark:border-gray-600">
                                <DataTable
                                    columns={poLinePreviewColumns}
                                    data={po.lines ?? []}
                                    compact
                                    fit
                                    hidePagination
                                    noData={(po.lines ?? []).length === 0}
                                />
                            </div>
                            {!canInvoicePo ? (
                                <div className="border-t border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-600 dark:bg-gray-800/40">
                                    <p className="text-sm font-semibold heading-text">
                                        No quantity available to invoice
                                    </p>
                                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                                        {postedGrCount > 0 && poQtySummary.received === 0
                                            ? 'This PO has posted goods receipt(s), but line received quantities are still zero. Open the PO, confirm receiving updated the PO lines, or post GR from the PO Receiving flow.'
                                            : poQtySummary.received > 0 && poQtySummary.open === 0
                                              ? 'All received quantity on this PO is already invoiced.'
                                              : 'Post a goods receipt against this PO first, then return here when received − invoiced is greater than zero.'}
                                    </p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <Link
                                            href={`/modules/mm/procurement/purchase-orders/${po.id}`}
                                        >
                                            <Button size="sm" variant="solid" type="button">
                                                Open PO
                                            </Button>
                                        </Link>
                                        <Link
                                            href={`/modules/mm/procurement/purchase-orders/${po.id}?tab=receiving`}
                                        >
                                            <Button size="sm" variant="default" type="button">
                                                Receiving tab
                                            </Button>
                                        </Link>
                                    </div>
                                </div>
                            ) : null}
                        </AdaptiveCard>
                    ) : null}
                    {canInvoicePo ? (
                    <>
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
                    </>
                    ) : null}
                    {canInvoicePo ? invOpenLines.map((l) => {
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
                    }) : null}
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
