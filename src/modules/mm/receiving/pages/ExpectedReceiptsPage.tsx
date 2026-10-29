'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import ReceivingResponsiveTable, { type ColumnDef } from '../components/ReceivingResponsiveTable'
import {
    fmtRcvDate,
    RCV_EXPECTED_RECEIPT_STATUS,
    RcvAnimatedStatus,
    RcvDateCell,
    RcvDocNumberCell,
    RcvPartyCell,
    RcvQtyCell,
    RcvSourceTag,
    rcvStatusTone,
} from '../components/receivingTableUi'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlinePlus, HiOutlineSearch, HiOutlineTruck, HiOutlineDocumentText, HiOutlinePrinter } from 'react-icons/hi'
import ReceivingReceiptPanel from '../components/ReceivingReceiptPanel'
import { expectedReceiptToSlip } from '../utils/receiptSlipMappers'
import { inboundService } from '../services/inboundService'
import { purchaseOrderService } from '@/modules/mm/procurement/services/purchaseOrderService'
import { useLazyMmRefs } from '@/modules/mm/shared/useLazyMmRefs'
import type { MmExpectedReceipt } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { firstError, required, visibleError, type FieldErrors } from '@/modules/mm/shared/formValidation'

const ROUTE = '/modules/mm/receiving/expected-receipts'

type FilterOption = { value: string; label: string }

const STATUS_FILTER_OPTIONS: FilterOption[] = [
    { value: '', label: 'All statuses' },
    { value: 'OPEN', label: 'Open' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'CLOSED', label: 'Closed' },
    { value: 'CANCELLED', label: 'Cancelled' },
]

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>{msg}</Notification>,
        { placement: 'top-end' },
    )
}

const ExpectedReceiptsPage = () => {
    const router = useRouter()
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)

    const [data, setData] = useState<MmExpectedReceipt[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('')

    const [fromPoOpen, setFromPoOpen] = useState(false)
    const [fromAsnOpen, setFromAsnOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [fromPo, setFromPo] = useState({ purchaseOrderId: '', warehouseId: '', expectedDate: '' })
    const [fromAsn, setFromAsn] = useState({ asnId: '', warehouseId: '' })
    const [touched, setTouched] = useState<Record<string, boolean>>({})
    const [forceValidate, setForceValidate] = useState(false)
    const [printEr, setPrintEr] = useState<MmExpectedReceipt | null>(null)
    const [printLoadingId, setPrintLoadingId] = useState<string | null>(null)

    const { ensure: ensureFormRefs, warehouses } = useLazyMmRefs()
    const [poOptions, setPoOptions] = useState<FilterOption[]>([])
    const [asnOptions, setAsnOptions] = useState<FilterOption[]>([])

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const res = await inboundService.listExpectedReceipts({
                page,
                pageSize,
                search: search || undefined,
                status: statusFilter || undefined,
            })
            setData(res.data)
            setTotal(res.total)
        } catch {
            setData([])
            setTotal(0)
        } finally {
            setLoading(false)
        }
    }, [page, pageSize, search, statusFilter])

    useEffect(() => { fetchData() }, [fetchData])

    const openFromPo = useCallback(async () => {
        await ensureFormRefs('warehouses')
        setFromPo({ purchaseOrderId: '', warehouseId: '', expectedDate: '' })
        setTouched({})
        setForceValidate(false)
        setFromPoOpen(true)
        try {
            const res = await purchaseOrderService.list({ page: 1, pageSize: 100, status: 'SENT' })
            const approved = await purchaseOrderService.list({ page: 1, pageSize: 100, status: 'APPROVED' })
            const partial = await purchaseOrderService.list({ page: 1, pageSize: 100, status: 'PARTIALLY_RECEIVED' })
            const all = [...res.data, ...approved.data, ...partial.data]
            const seen = new Set<string>()
            setPoOptions(
                all
                    .filter((p) => {
                        if (seen.has(p.id)) return false
                        seen.add(p.id)
                        return true
                    })
                    .map((p) => ({
                        value: p.id,
                        label: `${p.poNumber} — ${p.supplier?.supplierName ?? p.supplierId}`,
                    })),
            )
        } catch {
            setPoOptions([])
        }
    }, [ensureFormRefs])

    const openFromAsn = useCallback(async () => {
        await ensureFormRefs('warehouses')
        setFromAsn({ asnId: '', warehouseId: '' })
        setTouched({})
        setForceValidate(false)
        setFromAsnOpen(true)
        try {
            const res = await inboundService.listAsns({ page: 1, pageSize: 100, status: 'CONFIRMED' })
            setAsnOptions(
                res.data.map((a) => ({
                    value: a.id,
                    label: `${a.asnNumber} — ${a.supplier?.supplierName ?? a.supplierId}`,
                })),
            )
        } catch {
            setAsnOptions([])
        }
    }, [ensureFormRefs])

    const poErrors = useMemo<FieldErrors>(() => ({
        purchaseOrderId: required(fromPo.purchaseOrderId, 'Purchase order'),
    }), [fromPo])

    const asnErrors = useMemo<FieldErrors>(() => ({
        asnId: required(fromAsn.asnId, 'ASN'),
    }), [fromAsn])

    const submitFromPo = useCallback(async () => {
        setForceValidate(true)
        if (firstError(...Object.values(poErrors))) {
            pushToast('danger', 'Validation', 'Select a purchase order.')
            return
        }
        setSubmitting(true)
        try {
            const er = await inboundService.createExpectedFromPo({
                purchaseOrderId: fromPo.purchaseOrderId,
                warehouseId: fromPo.warehouseId || undefined,
                expectedDate: fromPo.expectedDate || undefined,
            })
            pushToast('success', 'Created', `Expected receipt ${er.documentNumber} created.`)
            setFromPoOpen(false)
            fetchData()
            router.push(`${ROUTE}/${er.id}`)
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message || 'Create failed'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : msg)
        } finally {
            setSubmitting(false)
        }
    }, [fromPo, poErrors, fetchData, router])

    const submitFromAsn = useCallback(async () => {
        setForceValidate(true)
        if (firstError(...Object.values(asnErrors))) {
            pushToast('danger', 'Validation', 'Select an ASN.')
            return
        }
        setSubmitting(true)
        try {
            const er = await inboundService.createExpectedFromAsn({
                asnId: fromAsn.asnId,
                warehouseId: fromAsn.warehouseId || undefined,
            })
            pushToast('success', 'Created', `Expected receipt ${er.documentNumber} created.`)
            setFromAsnOpen(false)
            fetchData()
            router.push(`${ROUTE}/${er.id}`)
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message || 'Create failed'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : msg)
        } finally {
            setSubmitting(false)
        }
    }, [fromAsn, asnErrors, fetchData, router])

    const columns: ColumnDef<MmExpectedReceipt>[] = useMemo(() => [
        {
            header: 'Document',
            accessorKey: 'documentNumber',
            cell: ({ row }) => (
                <RcvDocNumberCell
                    icon="receipt"
                    primary={row.original.documentNumber}
                    secondary={fmtRcvDate(row.original.expectedDate)}
                    onClick={() => router.push(`${ROUTE}/${row.original.id}`)}
                />
            ),
        },
        {
            header: 'Supplier',
            accessorKey: 'supplier.supplierName',
            cell: ({ row }) => (
                <RcvPartyCell
                    name={row.original.supplier?.supplierName}
                    subtitle={row.original.supplier?.supplierCode}
                />
            ),
        },
        {
            header: 'Source',
            accessorKey: 'sourceType',
            cell: ({ row }) => (
                <RcvSourceTag
                    sourceType={row.original.sourceType}
                    ref={
                        row.original.purchaseOrder?.poNumber
                            ?? row.original.asn?.asnNumber
                            ?? null
                    }
                />
            ),
        },
        {
            header: 'Warehouse',
            accessorKey: 'warehouse.name',
            cell: ({ row }) => (
                <RcvPartyCell
                    kind="warehouse"
                    name={row.original.warehouse?.name}
                    subtitle={row.original.warehouse?.code}
                />
            ),
        },
        {
            header: 'Expected',
            accessorKey: 'expectedDate',
            cell: ({ row }) => <RcvDateCell iso={row.original.expectedDate} />,
        },
        {
            header: 'Lines',
            accessorKey: 'lines',
            cell: ({ row }) => (
                <RcvQtyCell value={row.original.lines?.length ?? 0} label="Lines" />
            ),
        },
        {
            header: 'Status',
            accessorKey: 'status',
            cell: ({ row }) => (
                <RcvAnimatedStatus
                    status={row.original.status}
                    tone={rcvStatusTone(row.original.status, RCV_EXPECTED_RECEIPT_STATUS)}
                />
            ),
        },
        {
            header: '',
            id: 'print',
            size: 48,
            cell: ({ row }) => (
                <Button
                    size="xs"
                    variant="plain"
                    loading={printLoadingId === row.original.id}
                    icon={<HiOutlinePrinter />}
                    onClick={async () => {
                        setPrintLoadingId(row.original.id)
                        try {
                            setPrintEr(await inboundService.getExpectedReceipt(row.original.id))
                        } catch {
                            pushToast('danger', 'Error', 'Failed to load receipt')
                        } finally {
                            setPrintLoadingId(null)
                        }
                    }}
                />
            ),
        },
    ], [router, printLoadingId])

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Expected Receipts"
                description="Inbound expectations from purchase orders and ASNs"
                actions={
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" icon={<HiOutlineDocumentText />} onClick={openFromPo}>
                            From PO
                        </Button>
                        <Button size="sm" variant="solid" icon={<HiOutlineTruck />} onClick={openFromAsn}>
                            From ASN
                        </Button>
                    </div>
                }
            />

            <AdaptiveCard>
                <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Input
                        prefix={<HiOutlineSearch />}
                        placeholder="Search document #..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                    />
                    <Select<FilterOption>
                        placeholder="Status"
                        options={STATUS_FILTER_OPTIONS}
                        value={STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter)}
                        onChange={(opt) => { setStatusFilter(opt?.value ?? ''); setPage(1) }}
                    />
                </div>

                <ReceivingResponsiveTable
                    columns={columns}
                    data={data}
                    loading={loading}
                    getRowId={(row) => row.id}
                    pagingData={{ total, pageIndex: page, pageSize }}
                    onPaginationChange={(p) => setPage(p)}
                    onSelectChange={(s) => { setPageSize(s); setPage(1) }}
                    tableMinWidthClass="min-w-[880px]"
                />
            </AdaptiveCard>

            <FormDialog
                isOpen={printEr !== null}
                onClose={() => setPrintEr(null)}
                size="sm"
                title={printEr?.documentNumber ?? 'Expected receipt'}
                icon={<HiOutlinePrinter />}
                footer={
                    <Button size="sm" onClick={() => setPrintEr(null)}>Close</Button>
                }
            >
                {printEr ? (
                    <ReceivingReceiptPanel
                        data={expectedReceiptToSlip(printEr)}
                        enablePrintPortal
                        title="Expected receipt slip"
                    />
                ) : null}
            </FormDialog>

            <FormDialog
                isOpen={fromPoOpen}
                onClose={() => setFromPoOpen(false)}
                title="Expected receipt from PO"
                description="Create an open expected receipt from a purchase order."
                icon={<HiOutlinePlus />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setFromPoOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" loading={submitting} onClick={submitFromPo}>Create</Button>
                    </>
                }
            >
                <div className="grid grid-cols-1 gap-4">
                    <FormItem
                        label="Purchase order"
                        invalid={!!visibleError(poErrors, touched, 'purchaseOrderId', forceValidate)}
                        errorMessage={visibleError(poErrors, touched, 'purchaseOrderId', forceValidate)}
                    >
                        <Select
                            options={poOptions}
                            value={poOptions.find((o) => o.value === fromPo.purchaseOrderId) ?? null}
                            onChange={(opt: FilterOption | null) => {
                                setTouched((t) => ({ ...t, purchaseOrderId: true }))
                                setFromPo((p) => ({ ...p, purchaseOrderId: opt?.value ?? '' }))
                            }}
                            placeholder="Select PO"
                        />
                    </FormItem>
                    <FormItem label="Warehouse (optional)">
                        <Select
                            options={warehouses}
                            value={warehouses.find((o) => o.value === fromPo.warehouseId) ?? null}
                            onChange={(opt: FilterOption | null) =>
                                setFromPo((p) => ({ ...p, warehouseId: opt?.value ?? '' }))
                            }
                            isClearable
                            placeholder="Use PO warehouse"
                        />
                    </FormItem>
                    <FormItem label="Expected date">
                        <Input
                            type="date"
                            value={fromPo.expectedDate}
                            onChange={(e) => setFromPo((p) => ({ ...p, expectedDate: e.target.value }))}
                        />
                    </FormItem>
                </div>
            </FormDialog>

            <FormDialog
                isOpen={fromAsnOpen}
                onClose={() => setFromAsnOpen(false)}
                title="Expected receipt from ASN"
                description="Create an open expected receipt from a confirmed ASN."
                icon={<HiOutlineTruck />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setFromAsnOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" loading={submitting} onClick={submitFromAsn}>Create</Button>
                    </>
                }
            >
                <div className="grid grid-cols-1 gap-4">
                    <FormItem
                        label="ASN"
                        invalid={!!visibleError(asnErrors, touched, 'asnId', forceValidate)}
                        errorMessage={visibleError(asnErrors, touched, 'asnId', forceValidate)}
                    >
                        <Select
                            options={asnOptions}
                            value={asnOptions.find((o) => o.value === fromAsn.asnId) ?? null}
                            onChange={(opt: FilterOption | null) => {
                                setTouched((t) => ({ ...t, asnId: true }))
                                setFromAsn((p) => ({ ...p, asnId: opt?.value ?? '' }))
                            }}
                            placeholder="Select ASN"
                        />
                    </FormItem>
                    <FormItem label="Warehouse (optional)">
                        <Select
                            options={warehouses}
                            value={warehouses.find((o) => o.value === fromAsn.warehouseId) ?? null}
                            onChange={(opt: FilterOption | null) =>
                                setFromAsn((p) => ({ ...p, warehouseId: opt?.value ?? '' }))
                            }
                            isClearable
                            placeholder="Use ASN warehouse"
                        />
                    </FormItem>
                </div>
            </FormDialog>
        </PageContainer>
    )
}

export default ExpectedReceiptsPage
