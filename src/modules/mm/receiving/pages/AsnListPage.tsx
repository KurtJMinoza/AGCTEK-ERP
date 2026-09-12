'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { HiOutlinePlus, HiOutlineSearch, HiOutlineTrash, HiOutlineTruck } from 'react-icons/hi'
import { inboundService } from '../services/inboundService'
import { purchaseOrderService } from '@/modules/mm/procurement/services/purchaseOrderService'
import { materialService } from '@/modules/mm/material-master/services/materialService'
import { uomService, orgService } from '@/modules/mm/material-master/services/referenceService'
import { supplierService } from '@/modules/mm/supplier-management/services/supplierService'
import type { MmAsn } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    firstError,
    positiveNumber,
    required,
    visibleError,
    type FieldErrors,
} from '@/modules/mm/shared/formValidation'

const ROUTE = '/modules/mm/receiving/advanced-shipping-notices'

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger' | 'info'> = {
    DRAFT: 'default',
    CONFIRMED: 'success',
    CANCELLED: 'danger',
}

type FilterOption = { value: string; label: string }

const STATUS_FILTER_OPTIONS: FilterOption[] = [
    { value: '', label: 'All statuses' },
    { value: 'CONFIRMED', label: 'Confirmed' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'CANCELLED', label: 'Cancelled' },
]

type LineDraft = {
    key: string
    materialId: string
    quantity: string
    uomId: string
    batchNumber: string
    serialNumber: string
}

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

const emptyLine = (): LineDraft => ({
    key: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    materialId: '',
    quantity: '1',
    uomId: '',
    batchNumber: '',
    serialNumber: '',
})

const AsnListPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)

    const [data, setData] = useState<MmAsn[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('')

    const [formOpen, setFormOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [header, setHeader] = useState({
        companyId: '',
        supplierId: '',
        purchaseOrderId: '',
        warehouseId: '',
        shipmentNumber: '',
        carrier: '',
        trackingNumber: '',
        expectedDate: '',
        remarks: '',
    })
    const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
    const [touched, setTouched] = useState<Record<string, boolean>>({})
    const [forceValidate, setForceValidate] = useState(false)
    const [actionId, setActionId] = useState<string | null>(null)

    const [companies, setCompanies] = useState<FilterOption[]>([])
    const [suppliers, setSuppliers] = useState<FilterOption[]>([])
    const [warehouses, setWarehouses] = useState<FilterOption[]>([])
    const [materials, setMaterials] = useState<FilterOption[]>([])
    const [uoms, setUoms] = useState<FilterOption[]>([])
    const [pos, setPos] = useState<FilterOption[]>([])

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const res = await inboundService.listAsns({
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
        orgService.companies().then((list) =>
            setCompanies(list.map((c) => ({ value: c.id, label: c.name }))),
        ).catch(() => {})
        orgService.warehouses().then((list) =>
            setWarehouses(list.map((w: { id: string; name: string }) => ({ value: w.id, label: w.name }))),
        ).catch(() => {})
        uomService.list().then((list) =>
            setUoms(list.map((u: { id: string; code: string }) => ({ value: u.id, label: u.code }))),
        ).catch(() => {})
        materialService.list({ page: 1, limit: 200, status: 'ACTIVE' } as never).then((res) => {
            setMaterials(res.data.map((m) => ({ value: m.id, label: `${m.materialCode} — ${m.materialName}` })))
        }).catch(() => {})
        supplierService.list({ page: 1, pageSize: 200, status: 'ACTIVE' }).then((res) => {
            setSuppliers(res.data.map((s) => ({ value: s.id, label: `${s.supplierCode} — ${s.supplierName}` })))
        }).catch(() => {})
        purchaseOrderService.list({ page: 1, pageSize: 100 }).then((res) => {
            setPos(res.data.map((p) => ({
                value: p.id,
                label: `${p.poNumber} — ${p.supplier?.supplierName ?? ''}`,
            })))
        }).catch(() => {})
    }, [])

    const openCreate = useCallback(() => {
        setHeader({
            companyId: companies[0]?.value || '',
            supplierId: '',
            purchaseOrderId: '',
            warehouseId: '',
            shipmentNumber: '',
            carrier: '',
            trackingNumber: '',
            expectedDate: '',
            remarks: '',
        })
        setLines([emptyLine()])
        setTouched({})
        setForceValidate(false)
        setFormOpen(true)
    }, [companies])

    const errors = useMemo<FieldErrors>(() => {
        const e: FieldErrors = {
            companyId: required(header.companyId, 'Company'),
            supplierId: required(header.supplierId, 'Supplier'),
        }
        if (!lines.length) e.lines = 'Add at least one line'
        lines.forEach((l, idx) => {
            e[`material-${idx}`] = required(l.materialId, 'Material')
            e[`qty-${idx}`] = firstError(required(l.quantity, 'Quantity'), positiveNumber(l.quantity, 'Quantity'))
            e[`uom-${idx}`] = required(l.uomId, 'UOM')
        })
        return e
    }, [header, lines])

    const handleCreate = useCallback(async () => {
        setForceValidate(true)
        if (Object.values(errors).some(Boolean)) {
            pushToast('danger', 'Validation', 'Fix required fields before saving.')
            return
        }
        setSubmitting(true)
        try {
            const asn = await inboundService.createAsn({
                companyId: header.companyId,
                supplierId: header.supplierId,
                purchaseOrderId: header.purchaseOrderId || undefined,
                warehouseId: header.warehouseId || undefined,
                shipmentNumber: header.shipmentNumber || undefined,
                carrier: header.carrier || undefined,
                trackingNumber: header.trackingNumber || undefined,
                expectedDate: header.expectedDate || undefined,
                remarks: header.remarks || undefined,
                lines: lines.map((l) => ({
                    materialId: l.materialId,
                    quantity: Number(l.quantity),
                    uomId: l.uomId,
                    batchNumber: l.batchNumber.trim() || undefined,
                    serialNumber: l.serialNumber.trim() || undefined,
                })),
            })
            pushToast('success', 'Created', `ASN ${asn.asnNumber} saved as DRAFT.`)
            setFormOpen(false)
            fetchData()
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message || 'Create failed'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : msg)
        } finally {
            setSubmitting(false)
        }
    }, [header, lines, errors, fetchData])

    const handleConfirm = useCallback(async (row: MmAsn) => {
        setActionId(row.id)
        try {
            await inboundService.confirmAsn(row.id)
            pushToast('success', 'Confirmed', `${row.asnNumber} confirmed.`)
            fetchData()
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message || 'Confirm failed'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : String(msg))
        } finally {
            setActionId(null)
        }
    }, [fetchData])

    const handleCancelAsn = useCallback(async (row: MmAsn) => {
        setActionId(row.id)
        try {
            await inboundService.cancelAsn(row.id)
            pushToast('success', 'Cancelled', `${row.asnNumber} cancelled.`)
            fetchData()
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message || 'Cancel failed'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : String(msg))
        } finally {
            setActionId(null)
        }
    }, [fetchData])

    const columns: ColumnDef<MmAsn>[] = useMemo(() => [
        { header: 'ASN #', accessorKey: 'asnNumber' },
        {
            header: 'Supplier',
            accessorKey: 'supplier.supplierName',
            cell: ({ row }) => row.original.supplier?.supplierName ?? '—',
        },
        {
            header: 'Shipment',
            accessorKey: 'shipmentNumber',
            cell: ({ row }) => row.original.shipmentNumber || '—',
        },
        {
            header: 'Supplier ref',
            accessorKey: 'supplierReference',
            cell: ({ row }) => row.original.supplierReference || '—',
        },
        {
            header: 'Packages',
            accessorKey: 'packageCount',
            cell: ({ row }) => row.original.packageCount ?? '—',
        },
        {
            header: 'Carrier / tracking',
            id: 'carrier',
            cell: ({ row }) => {
                const c = row.original.carrier
                const t = row.original.trackingNumber
                if (!c && !t) return '—'
                return [c, t].filter(Boolean).join(' · ')
            },
        },
        {
            header: 'PO',
            accessorKey: 'purchaseOrder.poNumber',
            cell: ({ row }) => row.original.purchaseOrder?.poNumber ?? '—',
        },
        {
            header: 'ETA',
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
        {
            header: 'Actions',
            id: 'actions',
            cell: ({ row }) => {
                const asn = row.original
                if (asn.status !== 'DRAFT' && asn.status !== 'CONFIRMED') return null
                return (
                    <div className="flex flex-wrap gap-1">
                        {asn.status === 'DRAFT' ? (
                            <Button
                                size="xs"
                                variant="solid"
                                loading={actionId === asn.id}
                                onClick={() => handleConfirm(asn)}
                            >
                                Confirm
                            </Button>
                        ) : null}
                        {(asn.status === 'DRAFT' || asn.status === 'CONFIRMED') ? (
                            <Button
                                size="xs"
                                loading={actionId === asn.id}
                                onClick={() => handleCancelAsn(asn)}
                            >
                                Cancel
                            </Button>
                        ) : null}
                    </div>
                )
            },
        },
    ], [actionId, handleConfirm, handleCancelAsn])

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Advanced Shipping Notices"
                description="Capture supplier shipments as DRAFT, confirm to generate expected receipts"
                actions={
                    <Button variant="solid" icon={<HiOutlinePlus />} onClick={openCreate}>
                        New ASN
                    </Button>
                }
            />

            <AdaptiveCard>
                <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Input
                        prefix={<HiOutlineSearch />}
                        placeholder="Search ASN #..."
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
                isOpen={formOpen}
                onClose={() => setFormOpen(false)}
                size="xl"
                title="Create ASN"
                icon={<HiOutlineTruck />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setFormOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" loading={submitting} onClick={handleCreate}>Create</Button>
                    </>
                }
            >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormItem
                        label="Company"
                        invalid={!!visibleError(errors, touched, 'companyId', forceValidate)}
                        errorMessage={visibleError(errors, touched, 'companyId', forceValidate)}
                    >
                        <Select
                            options={companies}
                            value={companies.find((o) => o.value === header.companyId) ?? null}
                            onChange={(opt: FilterOption | null) => {
                                setTouched((t) => ({ ...t, companyId: true }))
                                setHeader((h) => ({ ...h, companyId: opt?.value ?? '' }))
                            }}
                        />
                    </FormItem>
                    <FormItem
                        label="Supplier"
                        invalid={!!visibleError(errors, touched, 'supplierId', forceValidate)}
                        errorMessage={visibleError(errors, touched, 'supplierId', forceValidate)}
                    >
                        <Select
                            options={suppliers}
                            value={suppliers.find((o) => o.value === header.supplierId) ?? null}
                            onChange={(opt: FilterOption | null) => {
                                setTouched((t) => ({ ...t, supplierId: true }))
                                setHeader((h) => ({ ...h, supplierId: opt?.value ?? '' }))
                            }}
                        />
                    </FormItem>
                    <FormItem label="Purchase order">
                        <Select
                            options={pos}
                            value={pos.find((o) => o.value === header.purchaseOrderId) ?? null}
                            onChange={(opt: FilterOption | null) =>
                                setHeader((h) => ({ ...h, purchaseOrderId: opt?.value ?? '' }))
                            }
                            isClearable
                        />
                    </FormItem>
                    <FormItem label="Warehouse">
                        <Select
                            options={warehouses}
                            value={warehouses.find((o) => o.value === header.warehouseId) ?? null}
                            onChange={(opt: FilterOption | null) =>
                                setHeader((h) => ({ ...h, warehouseId: opt?.value ?? '' }))
                            }
                            isClearable
                        />
                    </FormItem>
                    <FormItem label="Shipment #">
                        <Input
                            value={header.shipmentNumber}
                            onChange={(e) => setHeader((h) => ({ ...h, shipmentNumber: e.target.value }))}
                            placeholder="Carrier shipment ID"
                        />
                    </FormItem>
                    <FormItem label="Carrier">
                        <Input
                            value={header.carrier}
                            onChange={(e) => setHeader((h) => ({ ...h, carrier: e.target.value }))}
                        />
                    </FormItem>
                    <FormItem label="Tracking #">
                        <Input
                            value={header.trackingNumber}
                            onChange={(e) => setHeader((h) => ({ ...h, trackingNumber: e.target.value }))}
                        />
                    </FormItem>
                    <FormItem label="ETA">
                        <Input
                            type="date"
                            value={header.expectedDate}
                            onChange={(e) => setHeader((h) => ({ ...h, expectedDate: e.target.value }))}
                        />
                    </FormItem>
                    <FormItem label="Remarks" className="sm:col-span-2">
                        <Input
                            value={header.remarks}
                            onChange={(e) => setHeader((h) => ({ ...h, remarks: e.target.value }))}
                        />
                    </FormItem>
                </div>

                <h6 className="mb-2 mt-4">Lines</h6>
                {lines.map((line, idx) => (
                    <div key={line.key} className="mb-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                        <div className="flex flex-wrap items-end gap-2">
                        <FormItem
                            label="Material"
                            className="min-w-[200px] flex-1"
                            invalid={!!visibleError(errors, touched, `material-${idx}`, forceValidate)}
                            errorMessage={visibleError(errors, touched, `material-${idx}`, forceValidate)}
                        >
                            <Select
                                options={materials}
                                value={materials.find((o) => o.value === line.materialId) ?? null}
                                onChange={(opt: FilterOption | null) => {
                                    setTouched((t) => ({ ...t, [`material-${idx}`]: true }))
                                    setLines((prev) =>
                                        prev.map((l, i) =>
                                            i === idx ? { ...l, materialId: opt?.value ?? '' } : l,
                                        ),
                                    )
                                }}
                            />
                        </FormItem>
                        <FormItem
                            label="Qty"
                            className="w-24"
                            invalid={!!visibleError(errors, touched, `qty-${idx}`, forceValidate)}
                            errorMessage={visibleError(errors, touched, `qty-${idx}`, forceValidate)}
                        >
                            <Input
                                type="number"
                                value={line.quantity}
                                onChange={(e) => {
                                    setTouched((t) => ({ ...t, [`qty-${idx}`]: true }))
                                    setLines((prev) =>
                                        prev.map((l, i) =>
                                            i === idx ? { ...l, quantity: e.target.value } : l,
                                        ),
                                    )
                                }}
                            />
                        </FormItem>
                        <FormItem
                            label="UOM"
                            className="w-32"
                            invalid={!!visibleError(errors, touched, `uom-${idx}`, forceValidate)}
                            errorMessage={visibleError(errors, touched, `uom-${idx}`, forceValidate)}
                        >
                            <Select
                                options={uoms}
                                value={uoms.find((o) => o.value === line.uomId) ?? null}
                                onChange={(opt: FilterOption | null) => {
                                    setTouched((t) => ({ ...t, [`uom-${idx}`]: true }))
                                    setLines((prev) =>
                                        prev.map((l, i) =>
                                            i === idx ? { ...l, uomId: opt?.value ?? '' } : l,
                                        ),
                                    )
                                }}
                            />
                        </FormItem>
                        <FormItem label="Batch (optional)" className="w-36">
                            <Input
                                value={line.batchNumber}
                                onChange={(e) =>
                                    setLines((prev) =>
                                        prev.map((l, i) =>
                                            i === idx ? { ...l, batchNumber: e.target.value } : l,
                                        ),
                                    )
                                }
                            />
                        </FormItem>
                        <FormItem label="Serial (optional)" className="w-36">
                            <Input
                                value={line.serialNumber}
                                onChange={(e) =>
                                    setLines((prev) =>
                                        prev.map((l, i) =>
                                            i === idx ? { ...l, serialNumber: e.target.value } : l,
                                        ),
                                    )
                                }
                            />
                        </FormItem>
                        <Button
                            size="xs"
                            variant="plain"
                            onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                        >
                            <HiOutlineTrash />
                        </Button>
                        </div>
                    </div>
                ))}
                <Button size="sm" variant="plain" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
                    + Add line
                </Button>
            </FormDialog>
        </PageContainer>
    )
}

export default AsnListPage
