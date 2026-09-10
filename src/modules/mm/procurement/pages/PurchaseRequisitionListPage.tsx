'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
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
import Steps from '@/components/ui/Steps'
import { FormItem } from '@/components/ui/Form'
import {
    HiOutlinePlus,
    HiOutlineTrash,
    HiOutlineEye,
    HiOutlineSearch,
    HiOutlineCheckCircle,
    HiOutlineBan,
    HiOutlineClipboardCheck,
    HiOutlineArrowLeft,
    HiOutlineArrowRight,
    HiOutlineXCircle,
    HiOutlineReply,
    HiOutlineLockClosed,
} from 'react-icons/hi'
import { purchaseRequisitionService } from '../services/purchaseRequisitionService'
import { materialService } from '@/modules/mm/material-master/services/materialService'
import { uomService, orgService } from '@/modules/mm/material-master/services/referenceService'
import { supplierService } from '@/modules/mm/supplier-management/services/supplierService'
import type { PurchaseRequisition, PrListResponse } from '../types'
import { prTotalAmount } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    firstError,
    minLength,
    nonNegativeNumber,
    positiveNumber,
    required,
    visibleError,
    type FieldErrors,
} from '@/modules/mm/shared/formValidation'

const ROUTE_PATH = '/modules/mm/procurement/purchase-requisitions'

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger' | 'info'> = {
    DRAFT: 'default',
    SUBMITTED: 'info',
    PENDING_APPROVAL: 'warning',
    APPROVED: 'success',
    REJECTED: 'danger',
    RETURNED: 'warning',
    PARTIALLY_CONVERTED: 'info',
    FULLY_CONVERTED: 'success',
    CANCELLED: 'danger',
    CLOSED: 'default',
}

type FilterOption = { value: string; label: string }

const STATUS_FILTER_OPTIONS: FilterOption[] = [
    { value: '', label: 'All statuses' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'SUBMITTED', label: 'Submitted' },
    { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: 'CANCELLED', label: 'Cancelled' },
]

type LineDraft = {
    key: string
    materialId: string
    description: string
    requestedQuantity: string
    uomId: string
    estimatedUnitPrice: string
    requiredDate: string
    warehouseId: string
    preferredSupplierId: string
    remarks: string
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
    description: '',
    requestedQuantity: '1',
    uomId: '',
    estimatedUnitPrice: '0',
    requiredDate: '',
    warehouseId: '',
    preferredSupplierId: '',
    remarks: '',
})

const PurchaseRequisitionListPage = () => {
    const router = useRouter()
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE_PATH)

    const [data, setData] = useState<PurchaseRequisition[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('')

    const [formOpen, setFormOpen] = useState(false)
    const [wizardStep, setWizardStep] = useState(0)
    const [submitting, setSubmitting] = useState(false)
    const [header, setHeader] = useState<any>({})
    const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
    const [touched, setTouched] = useState<Record<string, boolean>>({})
    const [forceValidate, setForceValidate] = useState(false)

    const [companies, setCompanies] = useState<FilterOption[]>([])
    const [materials, setMaterials] = useState<FilterOption[]>([])
    const [uoms, setUoms] = useState<FilterOption[]>([])
    const [warehouses, setWarehouses] = useState<FilterOption[]>([])
    const [suppliers, setSuppliers] = useState<FilterOption[]>([])

    const [confirmAction, setConfirmAction] = useState<{ action: string; fn: () => Promise<void> } | null>(null)
    const [confirming, setConfirming] = useState(false)

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const res: PrListResponse = await purchaseRequisitionService.list({
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
        orgService.warehouses().then((list) => setWarehouses(list.map((w: any) => ({ value: w.id, label: w.name })))).catch(() => {})
        uomService.list().then((list) => setUoms(list.map((u: any) => ({ value: u.id, label: u.code })))).catch(() => {})
        materialService.list({ page: 1, limit: 200, status: 'ACTIVE' } as any).then((res) => {
            setMaterials(res.data.map((m) => ({ value: m.id, label: `${m.materialCode} — ${m.materialName}` })))
        }).catch(() => {})
        supplierService.list({ page: 1, pageSize: 200, status: 'ACTIVE' }).then((res) => {
            setSuppliers(res.data.map((s) => ({ value: s.id, label: `${s.supplierCode} — ${s.supplierName}` })))
        }).catch(() => {})
    }, [])

    const openCreate = useCallback(() => {
        setWizardStep(0)
        setHeader({
            companyId: companies[0]?.value || '',
            requesterId: 'current-user',
            requiredDate: new Date().toISOString().slice(0, 10),
            purpose: '',
            departmentId: '',
            costCenterId: '',
            businessUnitId: '',
            branchId: '',
            projectId: '',
        })
        setLines([emptyLine()])
        setTouched({})
        setForceValidate(false)
        setFormOpen(true)
    }, [companies])

    const headerErrors = useMemo<FieldErrors>(() => ({
        companyId: required(header.companyId, 'Company'),
        requesterId: required(header.requesterId, 'Requester'),
        purpose: firstError(
            required(header.purpose, 'Purpose'),
            minLength(header.purpose, 3, 'Purpose'),
        ),
        requiredDate: required(header.requiredDate, 'Required date'),
    }), [header])

    const lineErrors = useMemo(() => lines.map((l) => ({
        materialId: required(l.materialId, 'Material'),
        uomId: required(l.uomId, 'UOM'),
        requestedQuantity: firstError(
            required(l.requestedQuantity, 'Quantity'),
            positiveNumber(l.requestedQuantity, 'Quantity'),
        ),
        estimatedUnitPrice: nonNegativeNumber(l.estimatedUnitPrice, 'Unit price'),
    })), [lines])

    const setHeaderField = (key: string, value: unknown) => {
        setHeader((p: any) => ({ ...p, [key]: value }))
        setTouched((t) => ({ ...t, [key]: true }))
    }

    const updateLine = useCallback((key: string, patch: Partial<LineDraft>) => {
        setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
        for (const field of Object.keys(patch)) {
            setTouched((t) => ({ ...t, [`${key}.${field}`]: true }))
        }
    }, [])

    const hdrErr = (key: string) => visibleError(headerErrors, touched, key, forceValidate)
    const lnErr = (lineKey: string, field: string, errors: FieldErrors) =>
        visibleError(errors, touched, `${lineKey}.${field}`, forceValidate)

    const canGoNext = useMemo(() => {
        if (wizardStep === 0) {
            return !headerErrors.companyId && !headerErrors.requesterId && !headerErrors.purpose && !headerErrors.requiredDate
        }
        if (wizardStep === 1) {
            return lines.length > 0 && lineErrors.every((e) => !e.materialId && !e.uomId && !e.requestedQuantity && !e.estimatedUnitPrice)
        }
        return true
    }, [wizardStep, headerErrors, lines.length, lineErrors])

    const goNext = useCallback(() => {
        setForceValidate(true)
        if (!canGoNext) return
        setForceValidate(false)
        setWizardStep((s) => s + 1)
    }, [canGoNext])

    const handleCreate = useCallback(async () => {
        setForceValidate(true)
        if (!canGoNext && wizardStep === 2) {
            // re-check all
        }
        const headerInvalid = Object.values(headerErrors).some(Boolean)
        const linesInvalid = lineErrors.some((e) => Object.values(e).some(Boolean))
        if (headerInvalid || linesInvalid) {
            pushToast('danger', 'Validation', 'Fix the highlighted fields before creating.')
            if (headerInvalid) setWizardStep(0)
            else setWizardStep(1)
            return
        }
        setSubmitting(true)
        try {
            const created = await purchaseRequisitionService.create({
                ...header,
                lines: lines.map((l) => ({
                    materialId: l.materialId,
                    description: l.description || undefined,
                    requestedQuantity: parseFloat(l.requestedQuantity) || 0,
                    uomId: l.uomId,
                    estimatedUnitPrice: parseFloat(l.estimatedUnitPrice) || 0,
                    requiredDate: l.requiredDate || header.requiredDate,
                    warehouseId: l.warehouseId || undefined,
                    preferredSupplierId: l.preferredSupplierId || undefined,
                    remarks: l.remarks || undefined,
                })),
            })
            pushToast('success', 'Created', `${created.requisitionNumber} created as DRAFT.`)
            setFormOpen(false)
            fetchData()
        } catch (e: any) {
            const msg = e?.response?.data?.message || 'Create failed'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : msg)
        } finally {
            setSubmitting(false)
        }
    }, [header, lines, fetchData, headerErrors, lineErrors, canGoNext, wizardStep])

    const runConfirm = useCallback(async () => {
        if (!confirmAction) return
        setConfirming(true)
        try {
            await confirmAction.fn()
            pushToast('success', confirmAction.action, `${confirmAction.action} completed.`)
            setConfirmAction(null)
            fetchData()
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || `${confirmAction.action} failed`)
        } finally {
            setConfirming(false)
        }
    }, [confirmAction, fetchData])

    const columns = useMemo<ColumnDef<PurchaseRequisition>[]>(() => [
        {
            header: 'PR Number',
            accessorKey: 'requisitionNumber',
            size: 150,
            cell: ({ row }) => (
                <button
                    type="button"
                    className="font-mono text-xs font-semibold text-primary hover:underline"
                    onClick={() => router.push(`${ROUTE_PATH}/${row.original.id}`)}
                >
                    {row.original.requisitionNumber}
                </button>
            ),
        },
        {
            header: 'Requester',
            accessorKey: 'requesterId',
            size: 120,
            cell: ({ row }) => <span className="text-sm">{row.original.requesterId}</span>,
        },
        {
            header: 'Department',
            accessorKey: 'departmentId',
            size: 120,
            cell: ({ row }) => <span className="text-sm">{row.original.departmentId || '—'}</span>,
        },
        {
            header: 'Required Date',
            accessorKey: 'requiredDate',
            size: 120,
            cell: ({ row }) => (
                <span className="text-sm">{new Date(row.original.requiredDate).toLocaleDateString()}</span>
            ),
        },
        {
            header: 'Amount',
            id: 'amount',
            size: 110,
            cell: ({ row }) => (
                <span className="text-sm font-semibold">
                    {prTotalAmount(row.original).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
            ),
        },
        {
            header: 'Status',
            accessorKey: 'status',
            size: 140,
            cell: ({ row }) => (
                <StatusBadge tone={STATUS_TONE[row.original.status] ?? 'default'}>
                    {row.original.status.replace(/_/g, ' ')}
                </StatusBadge>
            ),
        },
        {
            header: 'Approval',
            id: 'approval',
            size: 110,
            cell: ({ row }) => {
                const s = row.original.status
                const label = s === 'PENDING_APPROVAL' ? 'Pending' : s === 'APPROVED' || s === 'PARTIALLY_CONVERTED' || s === 'FULLY_CONVERTED' ? 'Approved' : s === 'REJECTED' ? 'Rejected' : s === 'RETURNED' ? 'Returned' : '—'
                return <span className="text-xs text-gray-500">{label}</span>
            },
        },
        {
            id: 'actions',
            header: '',
            enableSorting: false,
            size: 48,
            cell: ({ row }) => {
                const pr = row.original
                return (
                    <Dropdown renderTitle={<EllipsisButton />} placement="bottom-end">
                        <Dropdown.Item eventKey="view" onClick={() => router.push(`${ROUTE_PATH}/${pr.id}`)}>
                            <HiOutlineEye className="text-base" /><span>View</span>
                        </Dropdown.Item>
                        {pr.status === 'DRAFT' && (
                            <Dropdown.Item eventKey="submit" onClick={() => setConfirmAction({
                                action: 'Submit',
                                fn: async () => { await purchaseRequisitionService.submit(pr.id, pr.requesterId) },
                            })}>
                                <HiOutlineClipboardCheck className="text-base" /><span>Submit</span>
                            </Dropdown.Item>
                        )}
                        {pr.status === 'PENDING_APPROVAL' && (
                            <>
                                <Dropdown.Item eventKey="approve" onClick={() => setConfirmAction({
                                    action: 'Approve',
                                    fn: async () => { await purchaseRequisitionService.approve(pr.id) },
                                })}>
                                    <HiOutlineCheckCircle className="text-base text-green-500" /><span>Approve</span>
                                </Dropdown.Item>
                                <Dropdown.Item eventKey="reject" onClick={() => setConfirmAction({
                                    action: 'Reject',
                                    fn: async () => { await purchaseRequisitionService.reject(pr.id, 'Rejected') },
                                })}>
                                    <HiOutlineXCircle className="text-base text-red-500" /><span>Reject</span>
                                </Dropdown.Item>
                                <Dropdown.Item eventKey="return" onClick={() => setConfirmAction({
                                    action: 'Return',
                                    fn: async () => { await purchaseRequisitionService.return(pr.id, 'Returned for revision') },
                                })}>
                                    <HiOutlineReply className="text-base" /><span>Return</span>
                                </Dropdown.Item>
                            </>
                        )}
                        {['DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'REJECTED', 'RETURNED'].includes(pr.status) && (
                            <Dropdown.Item eventKey="cancel" onClick={() => setConfirmAction({
                                action: 'Cancel',
                                fn: async () => { await purchaseRequisitionService.cancel(pr.id) },
                            })}>
                                <HiOutlineBan className="text-base text-red-500" /><span className="text-red-500">Cancel</span>
                            </Dropdown.Item>
                        )}
                        {['APPROVED', 'PARTIALLY_CONVERTED', 'FULLY_CONVERTED'].includes(pr.status) && (
                            <Dropdown.Item eventKey="close" onClick={() => setConfirmAction({
                                action: 'Close',
                                fn: async () => { await purchaseRequisitionService.close(pr.id) },
                            })}>
                                <HiOutlineLockClosed className="text-base" /><span>Close</span>
                            </Dropdown.Item>
                        )}
                    </Dropdown>
                )
            },
        },
    ], [router])

    const reviewTotal = lines.reduce((sum, l) => sum + (parseFloat(l.requestedQuantity) || 0) * (parseFloat(l.estimatedUnitPrice) || 0), 0)

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Purchase Requisitions"
                description="Internal demand documents for materials and services — not a supplier commitment."
                actions={
                    <Button variant="solid" size="sm" icon={<HiOutlinePlus />} onClick={openCreate}>
                        New Requisition
                    </Button>
                }
            />

            <AdaptiveCard className="mt-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Input
                        prefix={<HiOutlineSearch className="text-lg" />}
                        placeholder="Search PR number, purpose, requester..."
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
                    <DataTable<PurchaseRequisition>
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

            {/* Create wizard */}
            <FormDialog
                isOpen={formOpen}
                onClose={() => setFormOpen(false)}
                width={780}
                title="New Purchase Requisition"
                description="Capture demand details step by step before submitting for approval."
                icon={<HiOutlinePlus />}
                headerExtra={
                    <Steps current={wizardStep}>
                        <Steps.Item title="Header" />
                        <Steps.Item title="Lines" />
                        <Steps.Item title="Review" />
                    </Steps>
                }
                footerClassName="!justify-between"
                footer={
                    <>
                        <div>
                            {wizardStep > 0 && (
                                <Button size="sm" icon={<HiOutlineArrowLeft />} onClick={() => setWizardStep((s) => s - 1)}>Back</Button>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <Button size="sm" onClick={() => setFormOpen(false)}>Cancel</Button>
                            {wizardStep < 2 ? (
                                <Button size="sm" variant="solid" onClick={goNext}>
                                    Next <HiOutlineArrowRight className="ml-1 inline" />
                                </Button>
                            ) : (
                                <Button size="sm" variant="solid" loading={submitting} onClick={handleCreate}>
                                    Create Requisition
                                </Button>
                            )}
                        </div>
                    </>
                }
            >
                    {wizardStep === 0 && (
                        <div className="space-y-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Requisition Header</p>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <FormItem label="Company" asterisk invalid={Boolean(hdrErr('companyId'))} errorMessage={hdrErr('companyId')}>
                                    <Select<FilterOption>
                                        options={companies}
                                        value={companies.find((c) => c.value === header.companyId) ?? null}
                                        onChange={(opt) => setHeaderField('companyId', opt?.value ?? '')}
                                    />
                                </FormItem>
                                <FormItem label="Requester ID" asterisk invalid={Boolean(hdrErr('requesterId'))} errorMessage={hdrErr('requesterId')}>
                                    <Input value={header.requesterId ?? ''} onChange={(e) => setHeaderField('requesterId', e.target.value)} />
                                </FormItem>
                                <FormItem label="Purpose" asterisk className="sm:col-span-2" invalid={Boolean(hdrErr('purpose'))} errorMessage={hdrErr('purpose')}>
                                    <Input textArea value={header.purpose ?? ''} onChange={(e) => setHeaderField('purpose', e.target.value)} placeholder="Why is this material/service needed?" />
                                </FormItem>
                                <FormItem label="Required Date" asterisk invalid={Boolean(hdrErr('requiredDate'))} errorMessage={hdrErr('requiredDate')}>
                                    <Input type="date" value={header.requiredDate ?? ''} onChange={(e) => setHeaderField('requiredDate', e.target.value)} />
                                </FormItem>
                                <FormItem label="Department">
                                    <Input value={header.departmentId ?? ''} onChange={(e) => setHeaderField('departmentId', e.target.value)} />
                                </FormItem>
                                <FormItem label="Cost Center">
                                    <Input value={header.costCenterId ?? ''} onChange={(e) => setHeaderField('costCenterId', e.target.value)} />
                                </FormItem>
                                <FormItem label="Business Unit">
                                    <Input value={header.businessUnitId ?? ''} onChange={(e) => setHeaderField('businessUnitId', e.target.value)} />
                                </FormItem>
                                <FormItem label="Branch">
                                    <Input value={header.branchId ?? ''} onChange={(e) => setHeaderField('branchId', e.target.value)} />
                                </FormItem>
                                <FormItem label="Project">
                                    <Input value={header.projectId ?? ''} onChange={(e) => setHeaderField('projectId', e.target.value)} />
                                </FormItem>
                            </div>
                        </div>
                    )}

                    {wizardStep === 1 && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Line Items</p>
                                <Button size="xs" icon={<HiOutlinePlus />} onClick={() => setLines((p) => [...p, emptyLine()])}>
                                    Add Line
                                </Button>
                            </div>
                            <div className="space-y-4">
                                {lines.map((line, idx) => {
                                    const le = lineErrors[idx] || {}
                                    return (
                                    <div key={line.key} className="rounded-lg border border-gray-200 p-3 sm:p-4 dark:border-gray-600">
                                        <div className="mb-3 flex items-center justify-between">
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
                                            <FormItem label="Qty" asterisk invalid={Boolean(lnErr(line.key, 'requestedQuantity', le))} errorMessage={lnErr(line.key, 'requestedQuantity', le)}>
                                                <Input type="number" value={line.requestedQuantity} onChange={(e) => updateLine(line.key, { requestedQuantity: e.target.value })} />
                                            </FormItem>
                                            <FormItem label="Est. Unit Price" invalid={Boolean(lnErr(line.key, 'estimatedUnitPrice', le))} errorMessage={lnErr(line.key, 'estimatedUnitPrice', le)}>
                                                <Input type="number" value={line.estimatedUnitPrice} onChange={(e) => updateLine(line.key, { estimatedUnitPrice: e.target.value })} />
                                            </FormItem>
                                            <FormItem label="Description" className="sm:col-span-2">
                                                <Input value={line.description} onChange={(e) => updateLine(line.key, { description: e.target.value })} />
                                            </FormItem>
                                            <FormItem label="Warehouse">
                                                <Select<FilterOption>
                                                    options={warehouses}
                                                    value={warehouses.find((w) => w.value === line.warehouseId) ?? null}
                                                    onChange={(opt) => updateLine(line.key, { warehouseId: opt?.value ?? '' })}
                                                    isClearable
                                                />
                                            </FormItem>
                                            <FormItem label="Preferred Supplier">
                                                <Select<FilterOption>
                                                    options={suppliers}
                                                    value={suppliers.find((s) => s.value === line.preferredSupplierId) ?? null}
                                                    onChange={(opt) => updateLine(line.key, { preferredSupplierId: opt?.value ?? '' })}
                                                    isClearable
                                                />
                                            </FormItem>
                                            <FormItem label="Line Required Date">
                                                <Input type="date" value={line.requiredDate} onChange={(e) => updateLine(line.key, { requiredDate: e.target.value })} />
                                            </FormItem>
                                            <FormItem label="Remarks">
                                                <Input value={line.remarks} onChange={(e) => updateLine(line.key, { remarks: e.target.value })} />
                                            </FormItem>
                                        </div>
                                    </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {wizardStep === 2 && (
                        <div className="space-y-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Review before creating</p>
                            <div className="rounded-lg border border-gray-200 dark:border-gray-600">
                                <ReviewSection title="Header">
                                    <ReviewRow label="Purpose" value={header.purpose} />
                                    <ReviewRow label="Requester" value={header.requesterId} />
                                    <ReviewRow label="Required Date" value={header.requiredDate} />
                                    <ReviewRow label="Department" value={header.departmentId} />
                                    <ReviewRow label="Cost Center" value={header.costCenterId} />
                                    <ReviewRow label="Project" value={header.projectId} />
                                </ReviewSection>
                                <ReviewSection title="Lines" last>
                                    <ReviewRow label="Line count" value={String(lines.length)} />
                                    <ReviewRow label="Est. total" value={reviewTotal.toFixed(2)} />
                                    {lines.map((l, i) => (
                                        <ReviewRow
                                            key={l.key}
                                            label={`Line ${i + 1}`}
                                            value={`${materials.find((m) => m.value === l.materialId)?.label ?? l.materialId} × ${l.requestedQuantity}`}
                                        />
                                    ))}
                                </ReviewSection>
                            </div>
                        </div>
                    )}
            </FormDialog>

            <ConfirmDialog
                isOpen={Boolean(confirmAction)}
                type="warning"
                title={`${confirmAction?.action ?? 'Confirm'}?`}
                confirmText={confirmAction?.action ?? 'Confirm'}
                onRequestClose={() => setConfirmAction(null)}
                onCancel={() => setConfirmAction(null)}
                onConfirm={runConfirm}
                confirmButtonProps={{ loading: confirming }}
            >
                <p>Are you sure you want to {confirmAction?.action?.toLowerCase()} this purchase requisition?</p>
            </ConfirmDialog>
        </PageContainer>
    )
}

const ReviewSection = ({ title, children, last }: { title: string; children: React.ReactNode; last?: boolean }) => (
    <div className={last ? '' : 'border-b border-gray-200 dark:border-gray-600'}>
        <div className="bg-gray-50 px-4 py-2 dark:bg-gray-700/40">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</span>
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-1 px-4 py-3 sm:grid-cols-2">{children}</div>
    </div>
)

const ReviewRow = ({ label, value }: { label: string; value?: string | null }) => (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
        <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{label}</span>
        <span className="truncate text-right text-sm font-medium text-gray-900 dark:text-gray-100">
            {value || <span className="text-gray-300 dark:text-gray-600">—</span>}
        </span>
    </div>
)

export default PurchaseRequisitionListPage
