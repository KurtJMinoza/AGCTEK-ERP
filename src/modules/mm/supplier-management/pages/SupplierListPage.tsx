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
    HiOutlinePencil,
    HiOutlineTrash,
    HiOutlineEye,
    HiOutlineSearch,
    HiOutlineCheckCircle,
    HiOutlineBan,
    HiOutlineClipboardCheck,
    HiOutlineArrowLeft,
    HiOutlineArrowRight,
} from 'react-icons/hi'
import { supplierService } from '../services/supplierService'
import { supplierCategoryService } from '../services/supplierCategoryService'
import { paymentTermsService } from '../services/paymentTermsService'
import { orgService } from '@/modules/mm/material-master/services/referenceService'
import type { Supplier, SupplierCategory, PaymentTerms, SupplierListResponse } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    email as emailRule,
    firstError,
    hasErrors,
    maxLength,
    minLength,
    nonNegativeNumber,
    omitEmpty,
    required,
    url as urlRule,
    visibleError,
    type FieldErrors,
} from '@/modules/mm/shared/formValidation'

const ROUTE_PATH = '/modules/mm/supplier-management/supplier-master'

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger' | 'info'> = {
    DRAFT: 'default',
    PENDING_REVIEW: 'info',
    APPROVED: 'info',
    ACTIVE: 'success',
    INACTIVE: 'warning',
    BLOCKED: 'danger',
}

type FilterOption = { value: string; label: string }

const STATUS_FILTER_OPTIONS: FilterOption[] = [
    { value: '', label: 'All statuses' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'ACTIVE', label: 'Active' },
    { value: 'INACTIVE', label: 'Inactive' },
    { value: 'BLOCKED', label: 'Blocked' },
]

function pushToast(type: 'success' | 'danger' | 'warning' | 'info', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>{msg}</Notification>,
        { placement: 'top-end' },
    )
}

const SupplierListPage = () => {
    const router = useRouter()
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE_PATH)

    const [data, setData] = useState<Supplier[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [categoryFilter, setCategoryFilter] = useState('')

    const [categories, setCategories] = useState<SupplierCategory[]>([])
    const [paymentTermsList, setPaymentTermsList] = useState<PaymentTerms[]>([])
    const [companies, setCompanies] = useState<FilterOption[]>([])

    const [formOpen, setFormOpen] = useState(false)
    const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
    const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
    const [deleteSupplier, setDeleteSupplier] = useState<Supplier | null>(null)
    const [blockDialog, setBlockDialog] = useState<Supplier | null>(null)
    const [blockReason, setBlockReason] = useState('')
    const [wizardStep, setWizardStep] = useState(0)
    const [submitting, setSubmitting] = useState(false)
    const [touched, setTouched] = useState<Record<string, boolean>>({})
    const [forceValidate, setForceValidate] = useState(false)

    const [formValues, setFormValues] = useState<any>({})

    const categoryFilterOptions = useMemo<FilterOption[]>(
        () => [
            { value: '', label: 'All categories' },
            ...categories.map((c) => ({ value: c.id, label: c.name })),
        ],
        [categories],
    )

    useEffect(() => {
        supplierCategoryService.list().then(setCategories).catch(() => {})
        paymentTermsService.list().then(setPaymentTermsList).catch(() => {})
        orgService.companies()
            .then((list) => setCompanies(list.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))))
            .catch(() => {})
    }, [])

    const fieldErrors = useMemo<FieldErrors>(() => ({
        companyId: formMode === 'create' ? required(formValues.companyId, 'Company') : undefined,
        supplierName: firstError(
            required(formValues.supplierName, 'Supplier name'),
            minLength(formValues.supplierName, 2, 'Supplier name'),
            maxLength(formValues.supplierName, 120, 'Supplier name'),
        ),
        email: emailRule(formValues.email),
        website: urlRule(formValues.website),
        leadTimeDays: nonNegativeNumber(formValues.leadTimeDays, 'Lead time'),
    }), [formMode, formValues])

    const err = (key: string) => visibleError(fieldErrors, touched, key, forceValidate)

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const res: SupplierListResponse = await supplierService.list({
                page,
                pageSize,
                search: search || undefined,
                status: statusFilter || undefined,
                categoryId: categoryFilter || undefined,
            })
            setData(res.data)
            setTotal(res.total)
        } catch {
            setData([])
            setTotal(0)
        } finally {
            setLoading(false)
        }
    }, [page, pageSize, search, statusFilter, categoryFilter])

    useEffect(() => { fetchData() }, [fetchData])

    const openCreate = useCallback(() => {
        setFormMode('create')
        setEditingSupplier(null)
        setFormValues({ companyId: companies[0]?.value || '' })
        setTouched({})
        setForceValidate(false)
        setWizardStep(0)
        setFormOpen(true)
    }, [companies])

    const openEdit = useCallback((s: Supplier) => {
        setFormMode('edit')
        setEditingSupplier(s)
        setFormValues({
            companyId: s.companyId || '',
            supplierName: s.supplierName,
            legalName: s.legalName || '',
            supplierType: s.supplierType || '',
            taxId: s.taxId || '',
            primaryContact: s.primaryContact || '',
            email: s.email || '',
            phone: s.phone || '',
            website: s.website || '',
            billingAddress: s.billingAddress || '',
            shippingAddress: s.shippingAddress || '',
            country: s.country || '',
            region: s.region || '',
            deliveryTerms: s.deliveryTerms || '',
            leadTimeDays: s.leadTimeDays ?? '',
            taxCode: s.taxCode || '',
            taxStatus: s.taxStatus || '',
            categoryId: s.categoryId || '',
            paymentTermsId: s.paymentTermsId || '',
        })
        setTouched({})
        setForceValidate(false)
        setWizardStep(0)
        setFormOpen(true)
    }, [])

    const buildPayload = useCallback(() => {
        const lead = formValues.leadTimeDays !== '' && formValues.leadTimeDays != null
            ? parseInt(String(formValues.leadTimeDays), 10)
            : undefined
        return omitEmpty({
            ...formValues,
            supplierName: String(formValues.supplierName || '').trim(),
            leadTimeDays: Number.isFinite(lead as number) ? lead : undefined,
        })
    }, [formValues])

    const handleFormSubmit = useCallback(async () => {
        setForceValidate(true)
        if (hasErrors(fieldErrors)) {
            pushToast('danger', 'Validation', 'Fix the highlighted fields before saving.')
            if (fieldErrors.companyId || fieldErrors.supplierName) setWizardStep(0)
            else if (fieldErrors.email || fieldErrors.website) setWizardStep(1)
            else if (fieldErrors.leadTimeDays) setWizardStep(2)
            return
        }
        setSubmitting(true)
        try {
            const payload = buildPayload()
            if (formMode === 'create') {
                const created = await supplierService.create(payload as any)
                pushToast('success', 'Supplier created', `${created.supplierCode} — ${created.supplierName}`)
            } else if (editingSupplier) {
                const updated = await supplierService.update(editingSupplier.id, payload as any)
                pushToast('success', 'Supplier updated', `${updated.supplierCode} — ${updated.supplierName}`)
            }
            setFormOpen(false)
            fetchData()
        } catch (e: any) {
            const msg = e?.response?.data?.message || 'An error occurred'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : msg)
        } finally {
            setSubmitting(false)
        }
    }, [formMode, editingSupplier, fieldErrors, buildPayload, fetchData])

    const canGoNext = useMemo(() => {
        if (wizardStep === 0) {
            return !fieldErrors.companyId && !fieldErrors.supplierName
        }
        if (wizardStep === 1) {
            return !fieldErrors.email && !fieldErrors.website
        }
        if (wizardStep === 2) {
            return !fieldErrors.leadTimeDays
        }
        return true
    }, [wizardStep, fieldErrors])

    const goNext = useCallback(() => {
        setForceValidate(true)
        if (!canGoNext) return
        setForceValidate(false)
        setWizardStep((s) => s + 1)
    }, [canGoNext])

    const handleDelete = useCallback(async () => {
        if (!deleteSupplier) return
        try {
            await supplierService.delete(deleteSupplier.id)
            pushToast('success', 'Deleted', `${deleteSupplier.supplierCode} removed.`)
            setDeleteSupplier(null)
            fetchData()
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || 'Delete failed')
        }
    }, [deleteSupplier, fetchData])

    const handleLifecycleAction = useCallback(async (action: string, supplier: Supplier) => {
        try {
            let result: Supplier
            switch (action) {
                case 'submit': result = await supplierService.submit(supplier.id); break
                case 'approve': result = await supplierService.approve(supplier.id); break
                case 'activate': result = await supplierService.activate(supplier.id); break
                case 'deactivate': result = await supplierService.deactivate(supplier.id); break
                case 'unblock': result = await supplierService.unblock(supplier.id); break
                default: return
            }
            pushToast('success', 'Status updated', `${result.supplierCode} is now ${result.status}`)
            fetchData()
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || 'Action failed')
        }
    }, [fetchData])

    const handleBlock = useCallback(async () => {
        if (!blockDialog) return
        try {
            const result = await supplierService.block(blockDialog.id, blockReason)
            pushToast('warning', 'Blocked', `${result.supplierCode} has been blocked.`)
            setBlockDialog(null)
            setBlockReason('')
            fetchData()
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || 'Block failed')
        }
    }, [blockDialog, blockReason, fetchData])

    const columns = useMemo<ColumnDef<Supplier>[]>(
        () => [
            {
                header: 'Code',
                accessorKey: 'supplierCode',
                size: 120,
                cell: ({ row }) => (
                    <span className="font-mono text-xs font-semibold text-primary">{row.original.supplierCode}</span>
                ),
            },
            {
                header: 'Supplier Name',
                accessorKey: 'supplierName',
                size: 200,
                cell: ({ row }) => {
                    const s = row.original
                    return (
                        <button
                            type="button"
                            onClick={() => router.push(`${ROUTE_PATH}/${s.id}`)}
                            className="block truncate text-left text-sm font-semibold text-gray-900 hover:text-primary hover:underline dark:text-gray-100"
                        >
                            {s.supplierName}
                        </button>
                    )
                },
            },
            {
                header: 'Type',
                accessorKey: 'supplierType',
                size: 100,
                cell: ({ row }) => <span className="text-sm">{row.original.supplierType || '—'}</span>,
            },
            {
                header: 'Category',
                accessorKey: 'categoryId',
                size: 120,
                cell: ({ row }) => <span className="text-sm">{row.original.category?.name || '—'}</span>,
            },
            {
                header: 'Contact',
                accessorKey: 'email',
                size: 160,
                cell: ({ row }) => {
                    const s = row.original
                    return (
                        <div className="min-w-0 text-xs">
                            {s.primaryContact && <div className="truncate">{s.primaryContact}</div>}
                            {s.email && <div className="truncate text-gray-500">{s.email}</div>}
                        </div>
                    )
                },
            },
            {
                header: 'Status',
                accessorKey: 'status',
                size: 120,
                cell: ({ row }) => (
                    <StatusBadge tone={STATUS_TONE[row.original.status] ?? 'default'}>
                        {row.original.status.replace(/_/g, ' ')}
                    </StatusBadge>
                ),
            },
            {
                id: 'actions',
                header: '',
                enableSorting: false,
                size: 48,
                cell: ({ row }) => {
                    const s = row.original
                    return (
                        <Dropdown renderTitle={<EllipsisButton />} placement="bottom-end">
                            <Dropdown.Item eventKey="view" onClick={() => router.push(`${ROUTE_PATH}/${s.id}`)}>
                                <HiOutlineEye className="text-base" />
                                <span>View details</span>
                            </Dropdown.Item>
                            <Dropdown.Item eventKey="edit" onClick={() => openEdit(s)}>
                                <HiOutlinePencil className="text-base" />
                                <span>Edit</span>
                            </Dropdown.Item>
                            {s.status === 'DRAFT' && (
                                <Dropdown.Item eventKey="submit" onClick={() => handleLifecycleAction('submit', s)}>
                                    <HiOutlineClipboardCheck className="text-base" />
                                    <span>Submit for review</span>
                                </Dropdown.Item>
                            )}
                            {s.status === 'PENDING_REVIEW' && (
                                <Dropdown.Item eventKey="approve" onClick={() => handleLifecycleAction('approve', s)}>
                                    <HiOutlineCheckCircle className="text-base text-green-500" />
                                    <span>Approve</span>
                                </Dropdown.Item>
                            )}
                            {(s.status === 'APPROVED' || s.status === 'INACTIVE') && (
                                <Dropdown.Item eventKey="activate" onClick={() => handleLifecycleAction('activate', s)}>
                                    <HiOutlineCheckCircle className="text-base text-green-500" />
                                    <span>Activate</span>
                                </Dropdown.Item>
                            )}
                            {s.status === 'ACTIVE' && (
                                <Dropdown.Item eventKey="deactivate" onClick={() => handleLifecycleAction('deactivate', s)}>
                                    <HiOutlineBan className="text-base text-amber-500" />
                                    <span>Deactivate</span>
                                </Dropdown.Item>
                            )}
                            {s.status !== 'BLOCKED' && (
                                <Dropdown.Item eventKey="block" onClick={() => { setBlockDialog(s); setBlockReason('') }}>
                                    <HiOutlineBan className="text-base text-red-500" />
                                    <span className="text-red-500">Block</span>
                                </Dropdown.Item>
                            )}
                            {s.status === 'BLOCKED' && (
                                <Dropdown.Item eventKey="unblock" onClick={() => handleLifecycleAction('unblock', s)}>
                                    <HiOutlineCheckCircle className="text-base text-green-500" />
                                    <span>Unblock</span>
                                </Dropdown.Item>
                            )}
                            {(s.status === 'DRAFT' || s.status === 'INACTIVE') && (
                                <Dropdown.Item eventKey="delete" onClick={() => setDeleteSupplier(s)}>
                                    <HiOutlineTrash className="text-base text-red-500" />
                                    <span className="text-red-500">Delete</span>
                                </Dropdown.Item>
                            )}
                        </Dropdown>
                    )
                },
            },
        ],
        [openEdit, handleLifecycleAction, router],
    )

    const val = (key: string) => formValues[key] ?? ''
    const set = (key: string, v: any) => {
        setFormValues((p: any) => ({ ...p, [key]: v }))
        setTouched((t) => ({ ...t, [key]: true }))
    }

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Supplier Master"
                description="Manage supplier records, lifecycle, and purchasing data."
                actions={
                    <Button variant="solid" size="sm" icon={<HiOutlinePlus />} onClick={openCreate}>
                        New Supplier
                    </Button>
                }
            />

            <AdaptiveCard className="mt-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <Input
                        prefix={<HiOutlineSearch className="text-lg" />}
                        placeholder="Search code, name, email..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                    />
                    <Select<FilterOption>
                        placeholder="Status"
                        options={STATUS_FILTER_OPTIONS}
                        value={STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter)}
                        onChange={(opt) => { setStatusFilter(opt?.value ?? ''); setPage(1) }}
                    />
                    <Select<FilterOption>
                        placeholder="Category"
                        options={categoryFilterOptions}
                        value={categoryFilterOptions.find((o) => o.value === categoryFilter)}
                        onChange={(opt) => { setCategoryFilter(opt?.value ?? ''); setPage(1) }}
                    />
                </div>

                <div className="mt-4">
                    <DataTable<Supplier>
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

            {/* Create/Edit Wizard Dialog */}
            <FormDialog
                isOpen={formOpen}
                onClose={() => setFormOpen(false)}
                width={720}
                title={formMode === 'create' ? 'New Supplier' : 'Edit Supplier'}
                description={
                    formMode === 'create'
                        ? 'Fill in supplier details step by step.'
                        : 'Update supplier information across all sections.'
                }
                icon={formMode === 'create' ? <HiOutlinePlus /> : <HiOutlinePencil />}
                headerExtra={
                    <Steps current={wizardStep}>
                        <Steps.Item title="Identity" />
                        <Steps.Item title="Contact" />
                        <Steps.Item title="Purchasing" />
                        <Steps.Item title="Review" />
                    </Steps>
                }
                footerClassName="!justify-between"
                footer={
                    <>
                        <div>
                            {wizardStep > 0 && (
                                <Button
                                    size="sm"
                                    icon={<HiOutlineArrowLeft />}
                                    onClick={() => setWizardStep((s) => s - 1)}
                                >
                                    Back
                                </Button>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <Button size="sm" onClick={() => setFormOpen(false)}>Cancel</Button>
                            {wizardStep < 3 ? (
                                <Button
                                    size="sm"
                                    variant="solid"
                                    disabled={!canGoNext && forceValidate}
                                    onClick={goNext}
                                >
                                    Next <HiOutlineArrowRight className="ml-1 inline" />
                                </Button>
                            ) : (
                                <Button
                                    size="sm"
                                    variant="solid"
                                    loading={submitting}
                                    disabled={hasErrors(fieldErrors)}
                                    onClick={handleFormSubmit}
                                >
                                    {formMode === 'create' ? 'Create Supplier' : 'Save Changes'}
                                </Button>
                            )}
                        </div>
                    </>
                }
            >
                    {/* Step 0 — Identity */}
                    {wizardStep === 0 && (
                        <div className="space-y-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Supplier Identity</p>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                {formMode === 'create' && (
                                    <FormItem
                                        label="Company"
                                        asterisk
                                        className="sm:col-span-2"
                                        invalid={Boolean(err('companyId'))}
                                        errorMessage={err('companyId')}
                                    >
                                        {companies.length === 0 ? (
                                            <p className="text-sm text-amber-600 dark:text-amber-400">
                                                No companies found. Create a company first.
                                            </p>
                                        ) : (
                                            <Select<FilterOption>
                                                options={companies}
                                                value={companies.find((c) => c.value === formValues.companyId) ?? null}
                                                onChange={(opt) => set('companyId', opt?.value ?? '')}
                                                placeholder="Select company..."
                                            />
                                        )}
                                    </FormItem>
                                )}
                                <FormItem
                                    label="Supplier Name"
                                    asterisk
                                    invalid={Boolean(err('supplierName'))}
                                    errorMessage={err('supplierName')}
                                >
                                    <Input value={val('supplierName')} onChange={(e) => set('supplierName', e.target.value)} placeholder="Company name" />
                                </FormItem>
                                <FormItem label="Legal Name">
                                    <Input value={val('legalName')} onChange={(e) => set('legalName', e.target.value)} placeholder="Registered legal name" />
                                </FormItem>
                                <FormItem label="Supplier Type">
                                    <Input value={val('supplierType')} onChange={(e) => set('supplierType', e.target.value)} placeholder="e.g. Manufacturer, Distributor" />
                                </FormItem>
                                <FormItem label="Tax ID">
                                    <Input value={val('taxId')} onChange={(e) => set('taxId', e.target.value)} placeholder="VAT / Tax identification" />
                                </FormItem>
                                <FormItem label="Tax Code">
                                    <Input value={val('taxCode')} onChange={(e) => set('taxCode', e.target.value)} />
                                </FormItem>
                                <FormItem label="Tax Status">
                                    <Input value={val('taxStatus')} onChange={(e) => set('taxStatus', e.target.value)} placeholder="e.g. Exempt, Taxable" />
                                </FormItem>
                            </div>
                        </div>
                    )}

                    {/* Step 1 — Contact & Address */}
                    {wizardStep === 1 && (
                        <div className="space-y-5">
                            <div>
                                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Contact Information</p>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <FormItem label="Primary Contact">
                                        <Input value={val('primaryContact')} onChange={(e) => set('primaryContact', e.target.value)} placeholder="Full name" />
                                    </FormItem>
                                    <FormItem
                                        label="Email"
                                        invalid={Boolean(err('email'))}
                                        errorMessage={err('email')}
                                    >
                                        <Input type="email" value={val('email')} onChange={(e) => set('email', e.target.value)} placeholder="contact@example.com" />
                                    </FormItem>
                                    <FormItem label="Phone">
                                        <Input value={val('phone')} onChange={(e) => set('phone', e.target.value)} placeholder="+1 234 567 8900" />
                                    </FormItem>
                                    <FormItem
                                        label="Website"
                                        invalid={Boolean(err('website'))}
                                        errorMessage={err('website')}
                                    >
                                        <Input value={val('website')} onChange={(e) => set('website', e.target.value)} placeholder="https://..." />
                                    </FormItem>
                                </div>
                            </div>
                            <div>
                                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Address</p>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <FormItem label="Billing Address" className="sm:col-span-2">
                                        <Input textArea value={val('billingAddress')} onChange={(e) => set('billingAddress', e.target.value)} placeholder="Street, city, postal code" />
                                    </FormItem>
                                    <FormItem label="Shipping Address" className="sm:col-span-2">
                                        <Input textArea value={val('shippingAddress')} onChange={(e) => set('shippingAddress', e.target.value)} placeholder="Leave empty if same as billing" />
                                    </FormItem>
                                    <FormItem label="Country">
                                        <Input value={val('country')} onChange={(e) => set('country', e.target.value)} />
                                    </FormItem>
                                    <FormItem label="Region">
                                        <Input value={val('region')} onChange={(e) => set('region', e.target.value)} />
                                    </FormItem>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 2 — Purchasing */}
                    {wizardStep === 2 && (
                        <div className="space-y-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Purchasing & Terms</p>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <FormItem label="Category">
                                    <Select<FilterOption>
                                        options={categories.map((c) => ({ value: c.id, label: c.name }))}
                                        value={categories.filter((c) => c.id === formValues.categoryId).map((c) => ({ value: c.id, label: c.name }))[0] ?? null}
                                        onChange={(opt) => set('categoryId', opt?.value ?? '')}
                                        placeholder="Select category..."
                                    />
                                </FormItem>
                                <FormItem label="Payment Terms">
                                    <Select<FilterOption>
                                        options={paymentTermsList.map((p) => ({ value: p.id, label: p.name }))}
                                        value={paymentTermsList.filter((p) => p.id === formValues.paymentTermsId).map((p) => ({ value: p.id, label: p.name }))[0] ?? null}
                                        onChange={(opt) => set('paymentTermsId', opt?.value ?? '')}
                                        placeholder="Select terms..."
                                    />
                                </FormItem>
                                <FormItem label="Delivery Terms">
                                    <Input value={val('deliveryTerms')} onChange={(e) => set('deliveryTerms', e.target.value)} placeholder="e.g. FOB, CIF, EXW" />
                                </FormItem>
                                <FormItem
                                    label="Lead Time (days)"
                                    invalid={Boolean(err('leadTimeDays'))}
                                    errorMessage={err('leadTimeDays')}
                                >
                                    <Input type="number" value={val('leadTimeDays')} onChange={(e) => set('leadTimeDays', e.target.value)} placeholder="0" />
                                </FormItem>
                            </div>
                        </div>
                    )}

                    {/* Step 3 — Review */}
                    {wizardStep === 3 && (
                        <div className="space-y-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Review before {formMode === 'create' ? 'creating' : 'saving'}</p>
                            <div className="rounded-lg border border-gray-200 dark:border-gray-600">
                                <ReviewSection title="Identity">
                                    <ReviewRow label="Company" value={companies.find((c) => c.value === formValues.companyId)?.label || (formMode === 'edit' ? editingSupplier?.company?.name : undefined)} />
                                    <ReviewRow label="Supplier Name" value={formValues.supplierName} />
                                    <ReviewRow label="Legal Name" value={formValues.legalName} />
                                    <ReviewRow label="Type" value={formValues.supplierType} />
                                    <ReviewRow label="Tax ID" value={formValues.taxId} />
                                    <ReviewRow label="Tax Code" value={formValues.taxCode} />
                                    <ReviewRow label="Tax Status" value={formValues.taxStatus} />
                                </ReviewSection>
                                <ReviewSection title="Contact & Address">
                                    <ReviewRow label="Contact" value={formValues.primaryContact} />
                                    <ReviewRow label="Email" value={formValues.email} />
                                    <ReviewRow label="Phone" value={formValues.phone} />
                                    <ReviewRow label="Website" value={formValues.website} />
                                    <ReviewRow label="Billing Address" value={formValues.billingAddress} />
                                    <ReviewRow label="Shipping Address" value={formValues.shippingAddress} />
                                    <ReviewRow label="Country / Region" value={[formValues.country, formValues.region].filter(Boolean).join(', ')} />
                                </ReviewSection>
                                <ReviewSection title="Purchasing" last>
                                    <ReviewRow label="Category" value={categories.find((c) => c.id === formValues.categoryId)?.name} />
                                    <ReviewRow label="Payment Terms" value={paymentTermsList.find((p) => p.id === formValues.paymentTermsId)?.name} />
                                    <ReviewRow label="Delivery Terms" value={formValues.deliveryTerms} />
                                    <ReviewRow label="Lead Time" value={formValues.leadTimeDays ? `${formValues.leadTimeDays} days` : undefined} />
                                </ReviewSection>
                            </div>
                        </div>
                    )}
            </FormDialog>

            {/* Delete confirm */}
            <ConfirmDialog
                isOpen={Boolean(deleteSupplier)}
                type="danger"
                title="Delete supplier?"
                confirmText="Delete"
                onRequestClose={() => setDeleteSupplier(null)}
                onCancel={() => setDeleteSupplier(null)}
                onConfirm={handleDelete}
                confirmButtonProps={{ customColorClass: () => 'bg-red-500 hover:bg-red-500/90 text-white' }}
            >
                <p>
                    Are you sure you want to delete <span className="font-semibold">{deleteSupplier?.supplierCode} — {deleteSupplier?.supplierName}</span>?
                </p>
            </ConfirmDialog>

            {/* Block dialog */}
            <FormDialog
                isOpen={Boolean(blockDialog)}
                onClose={() => setBlockDialog(null)}
                size="sm"
                title="Block Supplier"
                description={
                    <>
                        Block <span className="font-semibold">{blockDialog?.supplierCode}</span>? Provide a reason:
                    </>
                }
                icon={<HiOutlineBan />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setBlockDialog(null)}>Cancel</Button>
                        <Button size="sm" variant="solid" customColorClass={() => 'bg-red-500 hover:bg-red-600 text-white'} onClick={handleBlock}>
                            Block
                        </Button>
                    </>
                }
            >
                <Input
                    textArea
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)}
                    placeholder="Reason for blocking..."
                />
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

export default SupplierListPage
