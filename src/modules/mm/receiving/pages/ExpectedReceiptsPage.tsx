'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
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
import { HiOutlinePlus, HiOutlineSearch, HiOutlineTruck, HiOutlineDocumentText } from 'react-icons/hi'
import { inboundService } from '../services/inboundService'
import { purchaseOrderService } from '@/modules/mm/procurement/services/purchaseOrderService'
import { orgService } from '@/modules/mm/material-master/services/referenceService'
import type { MmExpectedReceipt } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { firstError, required, visibleError, type FieldErrors } from '@/modules/mm/shared/formValidation'

const ROUTE = '/modules/mm/receiving/expected-receipts'

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger' | 'info'> = {
    OPEN: 'info',
    IN_PROGRESS: 'warning',
    CLOSED: 'success',
    CANCELLED: 'danger',
}

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

function fmtDate(iso?: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
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

    const [warehouses, setWarehouses] = useState<FilterOption[]>([])
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

    useEffect(() => {
        orgService.warehouses().then((list) =>
            setWarehouses(list.map((w: { id: string; name: string }) => ({ value: w.id, label: w.name }))),
        ).catch(() => {})
    }, [])

    const openFromPo = useCallback(async () => {
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
    }, [])

    const openFromAsn = useCallback(async () => {
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
    }, [])

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
            header: 'Document #',
            accessorKey: 'documentNumber',
            cell: ({ row }) => (
                <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => router.push(`${ROUTE}/${row.original.id}`)}
                >
                    {row.original.documentNumber}
                </button>
            ),
        },
        {
            header: 'Supplier',
            accessorKey: 'supplier.supplierName',
            cell: ({ row }) => row.original.supplier?.supplierName ?? '—',
        },
        {
            header: 'Source',
            accessorKey: 'sourceType',
            cell: ({ row }) => (
                <span>
                    {row.original.sourceType}
                    {row.original.purchaseOrder?.poNumber
                        ? ` · ${row.original.purchaseOrder.poNumber}`
                        : row.original.asn?.asnNumber
                          ? ` · ${row.original.asn.asnNumber}`
                          : ''}
                </span>
            ),
        },
        {
            header: 'Warehouse',
            accessorKey: 'warehouse.name',
            cell: ({ row }) => row.original.warehouse?.name ?? '—',
        },
        {
            header: 'Expected',
            accessorKey: 'expectedDate',
            cell: ({ row }) => fmtDate(row.original.expectedDate),
        },
        {
            header: 'Lines',
            accessorKey: 'lines',
            cell: ({ row }) => row.original.lines?.length ?? 0,
        },
        {
            header: 'Status',
            accessorKey: 'status',
            cell: ({ row }) => (
                <StatusBadge tone={STATUS_TONE[row.original.status] ?? 'default'}>
                    {row.original.status}
                </StatusBadge>
            ),
        },
    ], [router])

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

                <DataTable
                    columns={columns}
                    data={data}
                    loading={loading}
                    pagingData={{ total, pageIndex: page, pageSize }}
                    onPaginationChange={(p) => setPage(p)}
                    onSelectChange={(s) => { setPageSize(s); setPage(1) }}
                />
            </AdaptiveCard>

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
