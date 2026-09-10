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
import Checkbox from '@/components/ui/Checkbox'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import {
    HiOutlinePlus,
    HiOutlineTrash,
    HiOutlineSearch,
    HiOutlineDocumentDuplicate,
} from 'react-icons/hi'
import { purchaseOrderService } from '../services/purchaseOrderService'
import { purchaseRequisitionService } from '../services/purchaseRequisitionService'
import { rfqService } from '../services/rfqService'
import { materialService } from '@/modules/mm/material-master/services/materialService'
import { uomService, orgService } from '@/modules/mm/material-master/services/referenceService'
import { supplierService } from '@/modules/mm/supplier-management/services/supplierService'
import type {
    MmPurchaseOrder,
    PoListResponse,
    PurchaseRequisition,
    MmRfq,
} from '../types'
import { prRemainingQty } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    firstError,
    nonNegativeNumber,
    positiveNumber,
    required,
    visibleError,
    type FieldErrors,
} from '@/modules/mm/shared/formValidation'

const ROUTE_PATH = '/modules/mm/procurement/purchase-orders'

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger' | 'info'> = {
    DRAFT: 'default',
    PENDING_APPROVAL: 'warning',
    APPROVED: 'success',
    SENT: 'info',
    PARTIALLY_RECEIVED: 'info',
    FULLY_RECEIVED: 'success',
    CLOSED: 'default',
    CANCELLED: 'danger',
    REJECTED: 'danger',
}

type FilterOption = { value: string; label: string }

const STATUS_FILTER_OPTIONS: FilterOption[] = [
    { value: '', label: 'All statuses' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'SENT', label: 'Sent' },
    { value: 'PARTIALLY_RECEIVED', label: 'Partially Received' },
    { value: 'FULLY_RECEIVED', label: 'Fully Received' },
    { value: 'CLOSED', label: 'Closed' },
    { value: 'CANCELLED', label: 'Cancelled' },
]
type CreateMode = 'manual' | 'award' | 'pr'

type LineDraft = {
    key: string
    materialId: string
    quantity: string
    uomId: string
    unitPrice: string
}

function pushToast(type: 'success' | 'danger' | 'warning' | 'info', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>{msg}</Notification>,
        { placement: 'top-end' },
    )
}

const emptyLine = (): LineDraft => ({
    key: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    materialId: '',
    quantity: '1',
    uomId: '',
    unitPrice: '0',
})

const PurchaseOrderListPage = () => {
    const router = useRouter()
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE_PATH)

    const [data, setData] = useState<MmPurchaseOrder[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('')

    const [formOpen, setFormOpen] = useState(false)
    const [createMode, setCreateMode] = useState<CreateMode>('manual')
    const [submitting, setSubmitting] = useState(false)
    const [header, setHeader] = useState<Record<string, string>>({})
    const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
    const [touched, setTouched] = useState<Record<string, boolean>>({})
    const [forceValidate, setForceValidate] = useState(false)

    const [companies, setCompanies] = useState<FilterOption[]>([])
    const [currencies, setCurrencies] = useState<FilterOption[]>([])
    const [materials, setMaterials] = useState<FilterOption[]>([])
    const [uoms, setUoms] = useState<FilterOption[]>([])
    const [warehouses, setWarehouses] = useState<FilterOption[]>([])
    const [suppliers, setSuppliers] = useState<FilterOption[]>([])

    const [awardedRfqs, setAwardedRfqs] = useState<MmRfq[]>([])
    const [approvedPrs, setApprovedPrs] = useState<PurchaseRequisition[]>([])
    const [fromAward, setFromAward] = useState({ awardId: '', buyerId: 'current-user', warehouseId: '' })
    const [fromPr, setFromPr] = useState({
        purchaseRequisitionId: '',
        supplierId: '',
        buyerId: 'current-user',
        warehouseId: '',
        lineIds: [] as string[],
    })

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const res: PoListResponse = await purchaseOrderService.list({
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
        orgService.companies().then((list) => setCompanies(list.map((c) => ({ value: c.id, label: c.name })))).catch(() => {})
        orgService.currencies().then((list) => setCurrencies(list.map((c: { id: string; code: string; name?: string }) => ({ value: c.id, label: `${c.code}${c.name ? ` — ${c.name}` : ''}` })))).catch(() => {})
        orgService.warehouses().then((list) => setWarehouses(list.map((w: { id: string; name: string }) => ({ value: w.id, label: w.name })))).catch(() => {})
        uomService.list().then((list) => setUoms(list.map((u: { id: string; code: string }) => ({ value: u.id, label: u.code })))).catch(() => {})
        materialService.list({ page: 1, limit: 200, status: 'ACTIVE' } as never).then((res) => {
            setMaterials(res.data.map((m) => ({ value: m.id, label: `${m.materialCode} — ${m.materialName}` })))
        }).catch(() => {})
        supplierService.list({ page: 1, pageSize: 200, status: 'ACTIVE' }).then((res) => {
            setSuppliers(res.data.map((s) => ({ value: s.id, label: `${s.supplierCode} — ${s.supplierName}` })))
        }).catch(() => {})
    }, [])

    const awardOptions = useMemo<FilterOption[]>(() => {
        const opts: FilterOption[] = []
        for (const rfq of awardedRfqs) {
            for (const award of rfq.awards ?? []) {
                opts.push({
                    value: award.id,
                    label: `${rfq.rfqNumber} → ${award.supplier?.supplierName ?? award.supplierId}${award.quotation?.quotationNumber ? ` (${award.quotation.quotationNumber})` : ''}`,
                })
            }
        }
        return opts
    }, [awardedRfqs])

    const selectedPr = useMemo(
        () => approvedPrs.find((p) => p.id === fromPr.purchaseRequisitionId) ?? null,
        [approvedPrs, fromPr.purchaseRequisitionId],
    )

    const openCreate = useCallback(async (mode: CreateMode = 'manual') => {
        setCreateMode(mode)
        setHeader({
            companyId: companies[0]?.value || '',
            supplierId: '',
            buyerId: 'current-user',
            warehouseId: '',
            currencyId: '',
            expectedDeliveryDate: '',
        })
        setLines([emptyLine()])
        setFromAward({ awardId: '', buyerId: 'current-user', warehouseId: '' })
        setFromPr({
            purchaseRequisitionId: '',
            supplierId: '',
            buyerId: 'current-user',
            warehouseId: '',
            lineIds: [],
        })
        setTouched({})
        setForceValidate(false)
        setFormOpen(true)
        if (mode === 'award') {
            try {
                const res = await rfqService.list({ status: 'AWARDED', page: 1, pageSize: 100 })
                setAwardedRfqs(res.data)
            } catch {
                setAwardedRfqs([])
            }
        }
        if (mode === 'pr') {
            try {
                const [a, p] = await Promise.all([
                    purchaseRequisitionService.list({ status: 'APPROVED', page: 1, pageSize: 100 }),
                    purchaseRequisitionService.list({ status: 'PARTIALLY_CONVERTED', page: 1, pageSize: 100 }),
                ])
                setApprovedPrs([...a.data, ...p.data])
            } catch {
                setApprovedPrs([])
            }
        }
    }, [companies])

    const manualErrors = useMemo<FieldErrors>(() => ({
        companyId: required(header.companyId, 'Company'),
        supplierId: required(header.supplierId, 'Supplier'),
        buyerId: required(header.buyerId, 'Buyer'),
        warehouseId: required(header.warehouseId, 'Warehouse'),
    }), [header])

    const lineErrors = useMemo(() => lines.map((l) => ({
        materialId: required(l.materialId, 'Material'),
        uomId: required(l.uomId, 'UOM'),
        quantity: firstError(required(l.quantity, 'Quantity'), positiveNumber(l.quantity, 'Quantity')),
        unitPrice: nonNegativeNumber(l.unitPrice, 'Unit price'),
    })), [lines])

    const awardErrors = useMemo<FieldErrors>(() => ({
        awardId: required(fromAward.awardId, 'Award'),
        buyerId: required(fromAward.buyerId, 'Buyer'),
    }), [fromAward])

    const prErrors = useMemo<FieldErrors>(() => ({
        purchaseRequisitionId: required(fromPr.purchaseRequisitionId, 'Purchase requisition'),
        supplierId: required(fromPr.supplierId, 'Supplier'),
        buyerId: required(fromPr.buyerId, 'Buyer'),
        lineIds: fromPr.lineIds.length === 0 ? 'Select at least one PR line' : undefined,
    }), [fromPr])

    const setHeaderField = (key: string, value: string) => {
        setHeader((p) => ({ ...p, [key]: value }))
        setTouched((t) => ({ ...t, [key]: true }))
    }

    const updateLine = useCallback((key: string, patch: Partial<LineDraft>) => {
        setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
        for (const field of Object.keys(patch)) {
            setTouched((t) => ({ ...t, [`${key}.${field}`]: true }))
        }
    }, [])

    const hdrErr = (key: string) => visibleError(manualErrors, touched, key, forceValidate)
    const lnErr = (lineKey: string, field: string, errors: FieldErrors) =>
        visibleError(errors, touched, `${lineKey}.${field}`, forceValidate)
    const awardErr = (key: string) => visibleError(awardErrors, touched, key, forceValidate)
    const prErr = (key: string) => visibleError(prErrors, touched, key, forceValidate)

    const handleCreate = useCallback(async () => {
        setForceValidate(true)
        setSubmitting(true)
        try {
            let created: MmPurchaseOrder
            if (createMode === 'manual') {
                const headerInvalid = Object.values(manualErrors).some(Boolean)
                const linesInvalid = lineErrors.some((e) => Object.values(e).some(Boolean))
                if (headerInvalid || linesInvalid || lines.length === 0) {
                    pushToast('danger', 'Validation', 'Fix the highlighted fields before creating.')
                    return
                }
                created = await purchaseOrderService.create({
                    companyId: header.companyId,
                    supplierId: header.supplierId,
                    buyerId: header.buyerId,
                    warehouseId: header.warehouseId || undefined,
                    currencyId: header.currencyId || undefined,
                    expectedDeliveryDate: header.expectedDeliveryDate || undefined,
                    createdBy: header.buyerId,
                    lines: lines.map((l) => ({
                        materialId: l.materialId,
                        quantity: parseFloat(l.quantity) || 0,
                        uomId: l.uomId,
                        unitPrice: parseFloat(l.unitPrice) || 0,
                        warehouseId: header.warehouseId || undefined,
                    })),
                })
            } else if (createMode === 'award') {
                if (Object.values(awardErrors).some(Boolean)) {
                    pushToast('danger', 'Validation', 'Select an award and buyer.')
                    return
                }
                created = await purchaseOrderService.createFromAward({
                    awardId: fromAward.awardId,
                    buyerId: fromAward.buyerId,
                    warehouseId: fromAward.warehouseId || undefined,
                    createdBy: fromAward.buyerId,
                })
            } else {
                if (Object.values(prErrors).some(Boolean)) {
                    pushToast('danger', 'Validation', 'Complete PR conversion fields.')
                    return
                }
                created = await purchaseOrderService.createFromPr({
                    purchaseRequisitionId: fromPr.purchaseRequisitionId,
                    supplierId: fromPr.supplierId,
                    buyerId: fromPr.buyerId,
                    warehouseId: fromPr.warehouseId || undefined,
                    createdBy: fromPr.buyerId,
                    lineIds: fromPr.lineIds.map((lineId) => ({ lineId })),
                })
            }
            pushToast('success', 'Created', `${created.poNumber} created.`)
            setFormOpen(false)
            router.push(`${ROUTE_PATH}/${created.id}`)
        } catch (e: unknown) {
            const err = e as { response?: { data?: { message?: string | string[] } } }
            const msg = err?.response?.data?.message || 'Create failed'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : msg)
        } finally {
            setSubmitting(false)
        }
    }, [createMode, header, lines, manualErrors, lineErrors, awardErrors, fromAward, prErrors, fromPr, router])

    const columns = useMemo<ColumnDef<MmPurchaseOrder>[]>(() => [
        {
            header: 'PO Number',
            accessorKey: 'poNumber',
            size: 140,
            cell: ({ row }) => (
                <button
                    type="button"
                    className="font-mono text-xs font-semibold text-primary hover:underline"
                    onClick={() => router.push(`${ROUTE_PATH}/${row.original.id}`)}
                >
                    {row.original.poNumber}
                </button>
            ),
        },
        {
            header: 'Supplier',
            id: 'supplier',
            size: 180,
            cell: ({ row }) => (
                <span className="text-sm">
                    {row.original.supplier
                        ? `${row.original.supplier.supplierCode} — ${row.original.supplier.supplierName}`
                        : row.original.supplierId}
                </span>
            ),
        },
        {
            header: 'Buyer',
            accessorKey: 'buyerId',
            size: 120,
            cell: ({ row }) => <span className="text-sm">{row.original.buyerId}</span>,
        },
        {
            header: 'Status',
            accessorKey: 'status',
            size: 140,
            cell: ({ row }) => (
                <StatusBadge tone={STATUS_TONE[row.original.status] ?? 'default'}>
                    {String(row.original.status).replace(/_/g, ' ')}
                </StatusBadge>
            ),
        },
        {
            header: 'Total',
            id: 'total',
            size: 110,
            cell: ({ row }) => (
                <span className="text-sm font-semibold">
                    {Number(row.original.totalAmount || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                    })}
                </span>
            ),
        },
        {
            header: 'Expected Delivery',
            accessorKey: 'expectedDeliveryDate',
            size: 130,
            cell: ({ row }) => (
                <span className="text-sm">
                    {row.original.expectedDeliveryDate
                        ? new Date(row.original.expectedDeliveryDate).toLocaleDateString()
                        : '—'}
                </span>
            ),
        },
        {
            header: 'Created',
            accessorKey: 'createdAt',
            size: 120,
            cell: ({ row }) => (
                <span className="text-xs">{new Date(row.original.createdAt).toLocaleDateString()}</span>
            ),
        },
    ], [router])

    const modeTitle =
        createMode === 'manual' ? 'New Purchase Order (Manual)'
            : createMode === 'award' ? 'Create PO from Award'
                : 'Create PO from PR'

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Purchase Orders"
                description="Supplier commitments with approval, delivery, and receiving tracking."
                actions={
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" icon={<HiOutlineDocumentDuplicate />} onClick={() => openCreate('award')}>
                            From Award
                        </Button>
                        <Button size="sm" icon={<HiOutlineDocumentDuplicate />} onClick={() => openCreate('pr')}>
                            From PR
                        </Button>
                        <Button variant="solid" size="sm" icon={<HiOutlinePlus />} onClick={() => openCreate('manual')}>
                            New PO
                        </Button>
                    </div>
                }
            />

            <AdaptiveCard className="mt-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Input
                        prefix={<HiOutlineSearch className="text-lg" />}
                        placeholder="Search PO number, supplier, buyer..."
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

                <div className="mt-4">
                    <DataTable<MmPurchaseOrder>
                        columns={columns}
                        data={data}
                        compact
                        fit
                        loading={loading}
                        noData={!loading && data.length === 0}
                        pagingData={{ total, pageIndex: page, pageSize }}
                        onPaginationChange={setPage}
                        onSelectChange={(size) => { setPageSize(size); setPage(1) }}
                    />
                </div>
            </AdaptiveCard>

            <FormDialog
                isOpen={formOpen}
                onClose={() => setFormOpen(false)}
                width={760}
                title={modeTitle}
                description="Create a draft purchase order."
                icon={<HiOutlinePlus />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setFormOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" loading={submitting} onClick={handleCreate}>
                            Create PO
                        </Button>
                    </>
                }
            >
                <div className="mb-4 flex flex-wrap gap-2">
                    {(['manual', 'award', 'pr'] as CreateMode[]).map((m) => (
                        <Button
                            key={m}
                            size="xs"
                            variant={createMode === m ? 'solid' : 'default'}
                            onClick={() => openCreate(m)}
                        >
                            {m === 'manual' ? 'Manual DRAFT' : m === 'award' ? 'From Award' : 'From PR'}
                        </Button>
                    ))}
                </div>

                {createMode === 'manual' && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <FormItem label="Company" asterisk invalid={Boolean(hdrErr('companyId'))} errorMessage={hdrErr('companyId')}>
                                <Select<FilterOption>
                                    options={companies}
                                    value={companies.find((c) => c.value === header.companyId) ?? null}
                                    onChange={(opt) => setHeaderField('companyId', opt?.value ?? '')}
                                />
                            </FormItem>
                            <FormItem label="Supplier" asterisk invalid={Boolean(hdrErr('supplierId'))} errorMessage={hdrErr('supplierId')}>
                                <Select<FilterOption>
                                    options={suppliers}
                                    value={suppliers.find((s) => s.value === header.supplierId) ?? null}
                                    onChange={(opt) => setHeaderField('supplierId', opt?.value ?? '')}
                                />
                            </FormItem>
                            <FormItem label="Buyer" asterisk invalid={Boolean(hdrErr('buyerId'))} errorMessage={hdrErr('buyerId')}>
                                <Input value={header.buyerId ?? ''} onChange={(e) => setHeaderField('buyerId', e.target.value)} />
                            </FormItem>
                            <FormItem label="Warehouse" asterisk invalid={Boolean(hdrErr('warehouseId'))} errorMessage={hdrErr('warehouseId')}>
                                <Select<FilterOption>
                                    options={warehouses}
                                    value={warehouses.find((w) => w.value === header.warehouseId) ?? null}
                                    onChange={(opt) => setHeaderField('warehouseId', opt?.value ?? '')}
                                />
                            </FormItem>
                            <FormItem label="Currency">
                                <Select<FilterOption>
                                    options={currencies}
                                    value={currencies.find((c) => c.value === header.currencyId) ?? null}
                                    onChange={(opt) => setHeaderField('currencyId', opt?.value ?? '')}
                                    isClearable
                                />
                            </FormItem>
                            <FormItem label="Expected Delivery">
                                <Input
                                    type="date"
                                    value={header.expectedDeliveryDate ?? ''}
                                    onChange={(e) => setHeaderField('expectedDeliveryDate', e.target.value)}
                                />
                            </FormItem>
                        </div>
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Lines</p>
                            <Button size="xs" icon={<HiOutlinePlus />} onClick={() => setLines((p) => [...p, emptyLine()])}>
                                Add Line
                            </Button>
                        </div>
                        {lines.map((line, idx) => {
                            const le = lineErrors[idx] || {}
                            return (
                                <div key={line.key} className="rounded-lg border border-gray-200 p-3 dark:border-gray-600">
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className="text-sm font-semibold">Line {idx + 1}</span>
                                        {lines.length > 1 && (
                                            <Button size="xs" variant="plain" icon={<HiOutlineTrash />} onClick={() => setLines((p) => p.filter((l) => l.key !== line.key))} />
                                        )}
                                    </div>
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <FormItem label="Material" asterisk invalid={Boolean(lnErr(line.key, 'materialId', le))} errorMessage={lnErr(line.key, 'materialId', le)}>
                                            <Select<FilterOption>
                                                options={materials}
                                                value={materials.find((m) => m.value === line.materialId) ?? null}
                                                onChange={(opt) => updateLine(line.key, { materialId: opt?.value ?? '' })}
                                            />
                                        </FormItem>
                                        <FormItem label="UOM" asterisk invalid={Boolean(lnErr(line.key, 'uomId', le))} errorMessage={lnErr(line.key, 'uomId', le)}>
                                            <Select<FilterOption>
                                                options={uoms}
                                                value={uoms.find((u) => u.value === line.uomId) ?? null}
                                                onChange={(opt) => updateLine(line.key, { uomId: opt?.value ?? '' })}
                                            />
                                        </FormItem>
                                        <FormItem label="Qty" asterisk invalid={Boolean(lnErr(line.key, 'quantity', le))} errorMessage={lnErr(line.key, 'quantity', le)}>
                                            <Input type="number" value={line.quantity} onChange={(e) => updateLine(line.key, { quantity: e.target.value })} />
                                        </FormItem>
                                        <FormItem label="Unit Price" invalid={Boolean(lnErr(line.key, 'unitPrice', le))} errorMessage={lnErr(line.key, 'unitPrice', le)}>
                                            <Input type="number" value={line.unitPrice} onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })} />
                                        </FormItem>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}

                {createMode === 'award' && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <FormItem label="Award" asterisk className="sm:col-span-2" invalid={Boolean(awardErr('awardId'))} errorMessage={awardErr('awardId')}>
                            <Select<FilterOption>
                                options={awardOptions}
                                value={awardOptions.find((a) => a.value === fromAward.awardId) ?? null}
                                onChange={(opt) => {
                                    setFromAward((p) => ({ ...p, awardId: opt?.value ?? '' }))
                                    setTouched((t) => ({ ...t, awardId: true }))
                                }}
                            />
                        </FormItem>
                        <FormItem label="Buyer" asterisk invalid={Boolean(awardErr('buyerId'))} errorMessage={awardErr('buyerId')}>
                            <Input
                                value={fromAward.buyerId}
                                onChange={(e) => {
                                    setFromAward((p) => ({ ...p, buyerId: e.target.value }))
                                    setTouched((t) => ({ ...t, buyerId: true }))
                                }}
                            />
                        </FormItem>
                        <FormItem label="Warehouse">
                            <Select<FilterOption>
                                options={warehouses}
                                value={warehouses.find((w) => w.value === fromAward.warehouseId) ?? null}
                                onChange={(opt) => setFromAward((p) => ({ ...p, warehouseId: opt?.value ?? '' }))}
                                isClearable
                            />
                        </FormItem>
                    </div>
                )}

                {createMode === 'pr' && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <FormItem label="Approved PR" asterisk className="sm:col-span-2" invalid={Boolean(prErr('purchaseRequisitionId'))} errorMessage={prErr('purchaseRequisitionId')}>
                                <Select<FilterOption>
                                    options={approvedPrs.map((p) => ({ value: p.id, label: `${p.requisitionNumber} — ${p.purpose}` }))}
                                    value={approvedPrs.find((p) => p.id === fromPr.purchaseRequisitionId)
                                        ? { value: fromPr.purchaseRequisitionId, label: `${selectedPr?.requisitionNumber ?? ''} — ${selectedPr?.purpose ?? ''}` }
                                        : null}
                                    onChange={(opt) => {
                                        setFromPr((p) => ({
                                            ...p,
                                            purchaseRequisitionId: opt?.value ?? '',
                                            lineIds: [],
                                        }))
                                        setTouched((t) => ({ ...t, purchaseRequisitionId: true }))
                                    }}
                                />
                            </FormItem>
                            <FormItem label="Supplier" asterisk invalid={Boolean(prErr('supplierId'))} errorMessage={prErr('supplierId')}>
                                <Select<FilterOption>
                                    options={suppliers}
                                    value={suppliers.find((s) => s.value === fromPr.supplierId) ?? null}
                                    onChange={(opt) => {
                                        setFromPr((p) => ({ ...p, supplierId: opt?.value ?? '' }))
                                        setTouched((t) => ({ ...t, supplierId: true }))
                                    }}
                                />
                            </FormItem>
                            <FormItem label="Buyer" asterisk invalid={Boolean(prErr('buyerId'))} errorMessage={prErr('buyerId')}>
                                <Input
                                    value={fromPr.buyerId}
                                    onChange={(e) => {
                                        setFromPr((p) => ({ ...p, buyerId: e.target.value }))
                                        setTouched((t) => ({ ...t, buyerId: true }))
                                    }}
                                />
                            </FormItem>
                            <FormItem label="Warehouse">
                                <Select<FilterOption>
                                    options={warehouses}
                                    value={warehouses.find((w) => w.value === fromPr.warehouseId) ?? null}
                                    onChange={(opt) => setFromPr((p) => ({ ...p, warehouseId: opt?.value ?? '' }))}
                                    isClearable
                                />
                            </FormItem>
                        </div>
                        {selectedPr && (
                            <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                                    PR Lines (remaining qty)
                                </p>
                                {prErr('lineIds') && forceValidate && (
                                    <p className="text-xs text-red-500">{prErr('lineIds')}</p>
                                )}
                                {(selectedPr.lines ?? [])
                                    .filter((l) => prRemainingQty(l) > 0)
                                    .map((l) => (
                                        <label key={l.id} className="flex items-center gap-2 text-sm">
                                            <Checkbox
                                                checked={fromPr.lineIds.includes(l.id)}
                                                onChange={(checked) => {
                                                    setFromPr((p) => ({
                                                        ...p,
                                                        lineIds: checked
                                                            ? [...p.lineIds, l.id]
                                                            : p.lineIds.filter((id) => id !== l.id),
                                                    }))
                                                    setTouched((t) => ({ ...t, lineIds: true }))
                                                }}
                                            />
                                            <span>
                                                {l.material?.materialCode ?? l.materialId} — remaining {prRemainingQty(l)} {l.uom?.code ?? ''}
                                            </span>
                                        </label>
                                    ))}
                                {(selectedPr.lines ?? []).filter((l) => prRemainingQty(l) > 0).length === 0 && (
                                    <p className="text-sm text-gray-500">No remaining quantity on this PR.</p>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </FormDialog>
        </PageContainer>
    )
}

export default PurchaseOrderListPage
