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
import Steps from '@/components/ui/Steps'
import { FormItem } from '@/components/ui/Form'
import {
    HiOutlinePlus,
    HiOutlineTrash,
    HiOutlineSearch,
    HiOutlineArrowLeft,
    HiOutlineArrowRight,
    HiOutlineDocumentDuplicate,
} from 'react-icons/hi'
import { rfqService } from '../services/rfqService'
import { purchaseRequisitionService } from '../services/purchaseRequisitionService'
import { materialService } from '@/modules/mm/material-master/services/materialService'
import { uomService, orgService } from '@/modules/mm/material-master/services/referenceService'
import { supplierService } from '@/modules/mm/supplier-management/services/supplierService'
import type { MmRfq, MmRfqListResponse, PurchaseRequisition } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    firstError,
    minLength,
    positiveNumber,
    required,
    visibleError,
    type FieldErrors,
} from '@/modules/mm/shared/formValidation'

const ROUTE_PATH = '/modules/mm/procurement/rfqs'

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger' | 'info'> = {
    DRAFT: 'default',
    ISSUED: 'info',
    PARTIALLY_RESPONDED: 'warning',
    RESPONDED: 'info',
    EVALUATION: 'warning',
    AWARDED: 'success',
    CLOSED: 'default',
    CANCELLED: 'danger',
}

type FilterOption = { value: string; label: string }

const STATUS_FILTER_OPTIONS: FilterOption[] = [
    { value: '', label: 'All statuses' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'ISSUED', label: 'Issued' },
    { value: 'PARTIALLY_RESPONDED', label: 'Partial' },
    { value: 'RESPONDED', label: 'Responded' },
    { value: 'EVALUATION', label: 'Evaluation' },
    { value: 'AWARDED', label: 'Awarded' },
    { value: 'CLOSED', label: 'Closed' },
    { value: 'CANCELLED', label: 'Cancelled' },
]

type LineDraft = {
    key: string
    materialId: string
    quantity: string
    uomId: string
    requiredDate: string
    specifications: string
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
    requiredDate: '',
    specifications: '',
})

const RfqListPage = () => {
    const router = useRouter()
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE_PATH)

    const [data, setData] = useState<MmRfq[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('')

    const [formOpen, setFormOpen] = useState(false)
    const [fromPrOpen, setFromPrOpen] = useState(false)
    const [wizardStep, setWizardStep] = useState(0)
    const [submitting, setSubmitting] = useState(false)
    const [header, setHeader] = useState<Record<string, unknown>>({})
    const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
    const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([])
    const [touched, setTouched] = useState<Record<string, boolean>>({})
    const [forceValidate, setForceValidate] = useState(false)

    const [companies, setCompanies] = useState<FilterOption[]>([])
    const [currencies, setCurrencies] = useState<FilterOption[]>([])
    const [materials, setMaterials] = useState<FilterOption[]>([])
    const [uoms, setUoms] = useState<FilterOption[]>([])
    const [suppliers, setSuppliers] = useState<FilterOption[]>([])

    const [approvedPrs, setApprovedPrs] = useState<PurchaseRequisition[]>([])
    const [fromPr, setFromPr] = useState({
        purchaseRequisitionId: '',
        buyerId: 'current-user',
        responseDeadline: '',
        currencyId: '',
        purpose: '',
        autoSelectCheapest: false,
        prLineIds: [] as string[],
        supplierIds: [] as string[],
    })
    const [fromPrTouched, setFromPrTouched] = useState<Record<string, boolean>>({})
    const [fromPrForce, setFromPrForce] = useState(false)

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const res: MmRfqListResponse = await rfqService.list({
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
        orgService.currencies().then((list) => setCurrencies(list.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })))).catch(() => {})
        uomService.list().then((list) => setUoms(list.map((u: { id: string; code: string }) => ({ value: u.id, label: u.code })))).catch(() => {})
        materialService.list({ page: 1, limit: 200, status: 'ACTIVE' } as never).then((res) => {
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
            buyerId: 'current-user',
            responseDeadline: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
            currencyId: '',
            purpose: '',
            notes: '',
            autoSelectCheapest: false,
        })
        setLines([emptyLine()])
        setSelectedSupplierIds([])
        setTouched({})
        setForceValidate(false)
        setFormOpen(true)
    }, [companies])

    const openFromPr = useCallback(async () => {
        setFromPr({
            purchaseRequisitionId: '',
            buyerId: 'current-user',
            responseDeadline: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
            currencyId: '',
            purpose: '',
            autoSelectCheapest: false,
            prLineIds: [],
            supplierIds: [],
        })
        setFromPrTouched({})
        setFromPrForce(false)
        setFromPrOpen(true)
        try {
            const [a, p] = await Promise.all([
                purchaseRequisitionService.list({ status: 'APPROVED', page: 1, pageSize: 100 }),
                purchaseRequisitionService.list({ status: 'PARTIALLY_CONVERTED', page: 1, pageSize: 100 }),
            ])
            setApprovedPrs([...a.data, ...p.data])
        } catch {
            setApprovedPrs([])
        }
    }, [])

    const selectedPr = useMemo(
        () => approvedPrs.find((p) => p.id === fromPr.purchaseRequisitionId) ?? null,
        [approvedPrs, fromPr.purchaseRequisitionId],
    )

    const headerErrors = useMemo<FieldErrors>(() => ({
        companyId: required(header.companyId as string, 'Company'),
        buyerId: required(header.buyerId as string, 'Buyer'),
        responseDeadline: required(header.responseDeadline as string, 'Response deadline'),
        purpose: header.purpose
            ? minLength(String(header.purpose), 3, 'Purpose')
            : undefined,
    }), [header])

    const lineErrors = useMemo(() => lines.map((l) => ({
        materialId: required(l.materialId, 'Material'),
        uomId: required(l.uomId, 'UOM'),
        quantity: firstError(
            required(l.quantity, 'Quantity'),
            positiveNumber(l.quantity, 'Quantity'),
        ),
    })), [lines])

    const fromPrErrors = useMemo<FieldErrors>(() => ({
        purchaseRequisitionId: required(fromPr.purchaseRequisitionId, 'Purchase requisition'),
        buyerId: required(fromPr.buyerId, 'Buyer'),
        responseDeadline: required(fromPr.responseDeadline, 'Response deadline'),
        prLineIds: fromPr.prLineIds.length === 0 ? 'Select at least one PR line' : undefined,
    }), [fromPr])

    const setHeaderField = (key: string, value: unknown) => {
        setHeader((p) => ({ ...p, [key]: value }))
        setTouched((t) => ({ ...t, [key]: true }))
    }

    const updateLine = useCallback((key: string, patch: Partial<LineDraft>) => {
        setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
        for (const field of Object.keys(patch)) {
            setTouched((t) => ({ ...t, [`${key}.${field}`]: true }))
        }
    }, [])

    const toggleSupplier = (id: string) => {
        setSelectedSupplierIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
        )
    }

    const hdrErr = (key: string) => visibleError(headerErrors, touched, key, forceValidate)
    const lnErr = (lineKey: string, field: string, errors: FieldErrors) =>
        visibleError(errors, touched, `${lineKey}.${field}`, forceValidate)
    const fpErr = (key: string) => visibleError(fromPrErrors, fromPrTouched, key, fromPrForce)

    const canGoNext = useMemo(() => {
        if (wizardStep === 0) {
            return !headerErrors.companyId && !headerErrors.buyerId && !headerErrors.responseDeadline && !headerErrors.purpose
        }
        if (wizardStep === 1) {
            return lines.length > 0 && lineErrors.every((e) => !e.materialId && !e.uomId && !e.quantity)
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
            const created = await rfqService.create({
                companyId: header.companyId,
                buyerId: header.buyerId,
                responseDeadline: header.responseDeadline,
                currencyId: header.currencyId || undefined,
                purpose: header.purpose || undefined,
                notes: header.notes || undefined,
                autoSelectCheapest: Boolean(header.autoSelectCheapest),
                createdBy: header.buyerId,
                lines: lines.map((l) => ({
                    materialId: l.materialId,
                    quantity: parseFloat(l.quantity) || 0,
                    uomId: l.uomId,
                    requiredDate: l.requiredDate || undefined,
                    specifications: l.specifications || undefined,
                })),
                supplierIds: selectedSupplierIds.length > 0 ? selectedSupplierIds : undefined,
            })
            pushToast('success', 'Created', `${created.rfqNumber} created as DRAFT.`)
            setFormOpen(false)
            fetchData()
            router.push(`${ROUTE_PATH}/${created.id}`)
        } catch (e: unknown) {
            const err = e as { response?: { data?: { message?: string | string[] } } }
            const msg = err?.response?.data?.message || 'Create failed'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : msg)
        } finally {
            setSubmitting(false)
        }
    }, [header, lines, selectedSupplierIds, fetchData, headerErrors, lineErrors, router])

    const handleFromPr = useCallback(async () => {
        setFromPrForce(true)
        if (Object.values(fromPrErrors).some(Boolean)) {
            pushToast('danger', 'Validation', 'Fix the highlighted fields.')
            return
        }
        setSubmitting(true)
        try {
            const created = await rfqService.createFromPr({
                purchaseRequisitionId: fromPr.purchaseRequisitionId,
                buyerId: fromPr.buyerId,
                responseDeadline: fromPr.responseDeadline,
                currencyId: fromPr.currencyId || undefined,
                purpose: fromPr.purpose || undefined,
                autoSelectCheapest: fromPr.autoSelectCheapest,
                createdBy: fromPr.buyerId,
                prLineIds: fromPr.prLineIds,
                supplierIds: fromPr.supplierIds.length > 0 ? fromPr.supplierIds : undefined,
            })
            pushToast('success', 'Created', `${created.rfqNumber} created from PR.`)
            setFromPrOpen(false)
            fetchData()
            router.push(`${ROUTE_PATH}/${created.id}`)
        } catch (e: unknown) {
            const err = e as { response?: { data?: { message?: string | string[] } } }
            const msg = err?.response?.data?.message || 'Create from PR failed'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : msg)
        } finally {
            setSubmitting(false)
        }
    }, [fromPr, fromPrErrors, fetchData, router])

    const prOptions = useMemo(
        () => approvedPrs.map((p) => ({
            value: p.id,
            label: `${p.requisitionNumber} — ${p.purpose?.slice(0, 40) || 'No purpose'}`,
        })),
        [approvedPrs],
    )

    const columns = useMemo<ColumnDef<MmRfq>[]>(() => [
        {
            header: 'RFQ Number',
            accessorKey: 'rfqNumber',
            size: 160,
            cell: ({ row }) => (
                <button
                    type="button"
                    className="font-mono text-xs font-semibold text-primary hover:underline"
                    onClick={() => router.push(`${ROUTE_PATH}/${row.original.id}`)}
                >
                    {row.original.rfqNumber}
                </button>
            ),
        },
        {
            header: 'Buyer',
            accessorKey: 'buyerId',
            size: 120,
            cell: ({ row }) => <span className="text-sm">{row.original.buyerId}</span>,
        },
        {
            header: 'Purpose',
            accessorKey: 'purpose',
            size: 200,
            cell: ({ row }) => (
                <span className="line-clamp-1 text-sm">{row.original.purpose || '—'}</span>
            ),
        },
        {
            header: 'Deadline',
            accessorKey: 'responseDeadline',
            size: 120,
            cell: ({ row }) => (
                <span className="text-sm">
                    {new Date(row.original.responseDeadline).toLocaleDateString()}
                </span>
            ),
        },
        {
            header: 'Suppliers',
            id: 'suppliers',
            size: 90,
            cell: ({ row }) => (
                <span className="text-sm">{row.original.invitedSuppliers?.length ?? 0}</span>
            ),
        },
        {
            header: 'Quotes',
            id: 'quotes',
            size: 80,
            cell: ({ row }) => (
                <span className="text-sm">{row.original.quotations?.length ?? 0}</span>
            ),
        },
        {
            header: 'Status',
            accessorKey: 'status',
            size: 150,
            cell: ({ row }) => (
                <StatusBadge tone={STATUS_TONE[row.original.status] ?? 'default'}>
                    {row.original.status.replace(/_/g, ' ')}
                </StatusBadge>
            ),
        },
    ], [router])

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="RFQs"
                description="Request quotations from suppliers, compare responses, and award winners."
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" icon={<HiOutlineDocumentDuplicate />} onClick={openFromPr}>
                            From Approved PR
                        </Button>
                        <Button variant="solid" size="sm" icon={<HiOutlinePlus />} onClick={openCreate}>
                            New RFQ
                        </Button>
                    </div>
                }
            />

            <AdaptiveCard className="mt-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Input
                        prefix={<HiOutlineSearch className="text-lg" />}
                        placeholder="Search RFQ number, purpose, buyer..."
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
                    <DataTable<MmRfq>
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
                width={780}
                title="New RFQ"
                description="Define header, lines, and invited suppliers before issuing."
                icon={<HiOutlinePlus />}
                headerExtra={
                    <Steps current={wizardStep}>
                        <Steps.Item title="Header" />
                        <Steps.Item title="Lines" />
                        <Steps.Item title="Suppliers" />
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
                            {wizardStep < 3 ? (
                                <Button size="sm" variant="solid" onClick={goNext}>
                                    Next <HiOutlineArrowRight className="ml-1 inline" />
                                </Button>
                            ) : (
                                <Button size="sm" variant="solid" loading={submitting} onClick={handleCreate}>
                                    Create RFQ
                                </Button>
                            )}
                        </div>
                    </>
                }
            >
                {wizardStep === 0 && (
                    <div className="space-y-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">RFQ Header</p>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <FormItem label="Company" asterisk invalid={Boolean(hdrErr('companyId'))} errorMessage={hdrErr('companyId')}>
                                <Select<FilterOption>
                                    options={companies}
                                    value={companies.find((c) => c.value === header.companyId) ?? null}
                                    onChange={(opt) => setHeaderField('companyId', opt?.value ?? '')}
                                />
                            </FormItem>
                            <FormItem label="Buyer ID" asterisk invalid={Boolean(hdrErr('buyerId'))} errorMessage={hdrErr('buyerId')}>
                                <Input value={String(header.buyerId ?? '')} onChange={(e) => setHeaderField('buyerId', e.target.value)} />
                            </FormItem>
                            <FormItem label="Response Deadline" asterisk invalid={Boolean(hdrErr('responseDeadline'))} errorMessage={hdrErr('responseDeadline')}>
                                <Input type="date" value={String(header.responseDeadline ?? '')} onChange={(e) => setHeaderField('responseDeadline', e.target.value)} />
                            </FormItem>
                            <FormItem label="Currency">
                                <Select<FilterOption>
                                    options={currencies}
                                    value={currencies.find((c) => c.value === header.currencyId) ?? null}
                                    onChange={(opt) => setHeaderField('currencyId', opt?.value ?? '')}
                                    isClearable
                                />
                            </FormItem>
                            <FormItem label="Purpose" className="sm:col-span-2" invalid={Boolean(hdrErr('purpose'))} errorMessage={hdrErr('purpose')}>
                                <Input textArea value={String(header.purpose ?? '')} onChange={(e) => setHeaderField('purpose', e.target.value)} placeholder="What are you sourcing?" />
                            </FormItem>
                            <FormItem label="Notes" className="sm:col-span-2">
                                <Input textArea value={String(header.notes ?? '')} onChange={(e) => setHeaderField('notes', e.target.value)} />
                            </FormItem>
                            <div className="sm:col-span-2">
                                <Checkbox
                                    checked={Boolean(header.autoSelectCheapest)}
                                    onChange={(v) => setHeaderField('autoSelectCheapest', v)}
                                >
                                    Allow auto-select cheapest on award
                                </Checkbox>
                            </div>
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
                                            <FormItem label="Qty" asterisk invalid={Boolean(lnErr(line.key, 'quantity', le))} errorMessage={lnErr(line.key, 'quantity', le)}>
                                                <Input type="number" value={line.quantity} onChange={(e) => updateLine(line.key, { quantity: e.target.value })} />
                                            </FormItem>
                                            <FormItem label="Required Date">
                                                <Input type="date" value={line.requiredDate} onChange={(e) => updateLine(line.key, { requiredDate: e.target.value })} />
                                            </FormItem>
                                            <FormItem label="Specifications" className="sm:col-span-2">
                                                <Input value={line.specifications} onChange={(e) => updateLine(line.key, { specifications: e.target.value })} />
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
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Invite Suppliers (optional)</p>
                        <p className="text-sm text-gray-500">Select suppliers to invite. You can also invite later from the RFQ detail page.</p>
                        <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-gray-200 p-3 dark:border-gray-600">
                            {suppliers.length === 0 ? (
                                <p className="text-sm text-gray-400">No active suppliers found.</p>
                            ) : (
                                suppliers.map((s) => (
                                    <label key={s.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/40">
                                        <Checkbox
                                            checked={selectedSupplierIds.includes(s.value)}
                                            onChange={() => toggleSupplier(s.value)}
                                        />
                                        <span className="text-sm">{s.label}</span>
                                    </label>
                                ))
                            )}
                        </div>
                        <p className="text-xs text-gray-400">{selectedSupplierIds.length} supplier(s) selected</p>
                    </div>
                )}

                {wizardStep === 3 && (
                    <div className="space-y-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Review before creating</p>
                        <div className="rounded-lg border border-gray-200 dark:border-gray-600">
                            <ReviewSection title="Header">
                                <ReviewRow label="Buyer" value={String(header.buyerId ?? '')} />
                                <ReviewRow label="Deadline" value={String(header.responseDeadline ?? '')} />
                                <ReviewRow label="Purpose" value={String(header.purpose ?? '')} />
                                <ReviewRow label="Currency" value={currencies.find((c) => c.value === header.currencyId)?.label} />
                                <ReviewRow label="Auto cheapest" value={header.autoSelectCheapest ? 'Yes' : 'No'} />
                            </ReviewSection>
                            <ReviewSection title="Lines">
                                <ReviewRow label="Line count" value={String(lines.length)} />
                                {lines.map((l, i) => (
                                    <ReviewRow
                                        key={l.key}
                                        label={`Line ${i + 1}`}
                                        value={`${materials.find((m) => m.value === l.materialId)?.label ?? l.materialId} × ${l.quantity}`}
                                    />
                                ))}
                            </ReviewSection>
                            <ReviewSection title="Suppliers" last>
                                <ReviewRow
                                    label="Invited"
                                    value={selectedSupplierIds.length
                                        ? selectedSupplierIds.map((id) => suppliers.find((s) => s.value === id)?.label ?? id).join(', ')
                                        : 'None (invite later)'}
                                />
                            </ReviewSection>
                        </div>
                    </div>
                )}
            </FormDialog>

            <FormDialog
                isOpen={fromPrOpen}
                onClose={() => setFromPrOpen(false)}
                width={720}
                title="RFQ from Approved PR"
                description="Create an RFQ from approved purchase requisition lines."
                icon={<HiOutlineDocumentDuplicate />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setFromPrOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" loading={submitting} onClick={handleFromPr}>
                            Create from PR
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <FormItem label="Approved PR" asterisk invalid={Boolean(fpErr('purchaseRequisitionId'))} errorMessage={fpErr('purchaseRequisitionId')}>
                        <Select<FilterOption>
                            options={prOptions}
                            value={prOptions.find((o) => o.value === fromPr.purchaseRequisitionId) ?? null}
                            onChange={(opt) => {
                                const pr = approvedPrs.find((p) => p.id === opt?.value)
                                setFromPr((p) => ({
                                    ...p,
                                    purchaseRequisitionId: opt?.value ?? '',
                                    purpose: pr?.purpose || p.purpose,
                                    prLineIds: pr?.lines?.map((l) => l.id) ?? [],
                                }))
                                setFromPrTouched((t) => ({ ...t, purchaseRequisitionId: true, prLineIds: true }))
                            }}
                        />
                    </FormItem>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <FormItem label="Buyer ID" asterisk invalid={Boolean(fpErr('buyerId'))} errorMessage={fpErr('buyerId')}>
                            <Input
                                value={fromPr.buyerId}
                                onChange={(e) => {
                                    setFromPr((p) => ({ ...p, buyerId: e.target.value }))
                                    setFromPrTouched((t) => ({ ...t, buyerId: true }))
                                }}
                            />
                        </FormItem>
                        <FormItem label="Response Deadline" asterisk invalid={Boolean(fpErr('responseDeadline'))} errorMessage={fpErr('responseDeadline')}>
                            <Input
                                type="date"
                                value={fromPr.responseDeadline}
                                onChange={(e) => {
                                    setFromPr((p) => ({ ...p, responseDeadline: e.target.value }))
                                    setFromPrTouched((t) => ({ ...t, responseDeadline: true }))
                                }}
                            />
                        </FormItem>
                        <FormItem label="Currency">
                            <Select<FilterOption>
                                options={currencies}
                                value={currencies.find((c) => c.value === fromPr.currencyId) ?? null}
                                onChange={(opt) => setFromPr((p) => ({ ...p, currencyId: opt?.value ?? '' }))}
                                isClearable
                            />
                        </FormItem>
                        <FormItem label="Purpose" className="sm:col-span-2">
                            <Input textArea value={fromPr.purpose} onChange={(e) => setFromPr((p) => ({ ...p, purpose: e.target.value }))} />
                        </FormItem>
                    </div>
                    {selectedPr && (
                        <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">PR Lines</p>
                            {fpErr('prLineIds') && <p className="mb-2 text-xs text-red-500">{fpErr('prLineIds')}</p>}
                            <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-gray-200 p-3 dark:border-gray-600">
                                {(selectedPr.lines ?? []).map((l) => (
                                    <label key={l.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/40">
                                        <Checkbox
                                            checked={fromPr.prLineIds.includes(l.id)}
                                            onChange={(checked) => {
                                                setFromPr((p) => ({
                                                    ...p,
                                                    prLineIds: checked
                                                        ? [...p.prLineIds, l.id]
                                                        : p.prLineIds.filter((x) => x !== l.id),
                                                }))
                                                setFromPrTouched((t) => ({ ...t, prLineIds: true }))
                                            }}
                                        />
                                        <span className="text-sm">
                                            {l.material?.materialCode ?? l.materialId} × {Number(l.requestedQuantity)} {l.uom?.code ?? ''}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                    <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Invite Suppliers (optional)</p>
                        <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-gray-200 p-3 dark:border-gray-600">
                            {suppliers.map((s) => (
                                <label key={s.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/40">
                                    <Checkbox
                                        checked={fromPr.supplierIds.includes(s.value)}
                                        onChange={(checked) => {
                                            setFromPr((p) => ({
                                                ...p,
                                                supplierIds: checked
                                                    ? [...p.supplierIds, s.value]
                                                    : p.supplierIds.filter((x) => x !== s.value),
                                            }))
                                        }}
                                    />
                                    <span className="text-sm">{s.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    <Checkbox
                        checked={fromPr.autoSelectCheapest}
                        onChange={(v) => setFromPr((p) => ({ ...p, autoSelectCheapest: v }))}
                    >
                        Allow auto-select cheapest on award
                    </Checkbox>
                </div>
            </FormDialog>
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

export default RfqListPage
