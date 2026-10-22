'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import FormDialog from '@/components/shared/FormDialog'
import EllipsisButton from '@/components/shared/EllipsisButton'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Checkbox from '@/components/ui/Checkbox'
import Dropdown from '@/components/ui/Dropdown'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import {
    HiOutlinePlus,
    HiOutlinePencil,
    HiOutlineSearch,
    HiOutlineTrash,
} from 'react-icons/hi'
import {
    SmEntityCell,
    SmPreferredCell,
    SmRecordStatusCell,
    SmSupplierLinkCodeCell,
    SmSupplyTermsCell,
    SmUnitPriceCell,
    SmValidityCell,
    smTableRowEnterClass,
} from '../components/SupplierTableCells'
import { supplierMaterialService } from '../services/supplierMaterialService'
import type { SupplierMaterial } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    firstError,
    hasErrors,
    nonNegativeNumber,
    required,
    visibleError,
    type FieldErrors,
} from '@/modules/mm/shared/formValidation'
import {
    useMaterialOptions,
    useSupplierOptions,
} from '@/modules/mm/shared/useEntityOptions'

const ROUTE_PATH = '/modules/mm/supplier-management/supplier-materials'

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(<Notification type={type} title={title} closable duration={3500}>{msg}</Notification>, { placement: 'top-end' })
}

const blankForm = () => ({
    supplierId: '',
    materialId: '',
    unitPrice: '',
    leadTimeDays: '',
    minimumOrderQuantity: '',
    validityStart: '',
    validityEnd: '',
    preferredSupplier: false,
})

const SupplierMaterialsPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE_PATH)

    const [data, setData] = useState<SupplierMaterial[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [filterSupplierId, setFilterSupplierId] = useState('')
    const [filterMaterialId, setFilterMaterialId] = useState('')
    const [filterSearch, setFilterSearch] = useState('')

    const [formOpen, setFormOpen] = useState(false)
    const [editItem, setEditItem] = useState<SupplierMaterial | null>(null)
    const [deleteItem, setDeleteItem] = useState<SupplierMaterial | null>(null)
    const [form, setForm] = useState<any>(blankForm())
    const [touched, setTouched] = useState<Record<string, boolean>>({})
    const [forceValidate, setForceValidate] = useState(false)
    const [lookupHint, setLookupHint] = useState('')

    const { options: supplierOpts } = useSupplierOptions({ enabled: true })
    const { options: materialOpts } = useMaterialOptions({ enabled: true })
    const supplierFilterOpts = useMemo(
        () => [{ value: '', label: 'All suppliers' }, ...supplierOpts],
        [supplierOpts],
    )
    const materialFilterOpts = useMemo(
        () => [{ value: '', label: 'All materials' }, ...materialOpts],
        [materialOpts],
    )

    const fieldErrors = useMemo<FieldErrors>(() => ({
        supplierId: required(form.supplierId, 'Supplier'),
        materialId: required(form.materialId, 'Material'),
        unitPrice: firstError(
            required(form.unitPrice, 'Unit price'),
            nonNegativeNumber(form.unitPrice, 'Unit price'),
        ),
        leadTimeDays: nonNegativeNumber(form.leadTimeDays, 'Lead time'),
        minimumOrderQuantity: nonNegativeNumber(form.minimumOrderQuantity, 'Min order qty'),
    }), [form])

    const err = (key: string) => visibleError(fieldErrors, touched, key, forceValidate)

    const setField = (key: string, value: string | boolean) => {
        setForm((p: any) => ({ ...p, [key]: value }))
        setTouched((t) => ({ ...t, [key]: true }))
    }

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const res = await supplierMaterialService.list({
                page,
                pageSize,
                supplierId: filterSupplierId || undefined,
                materialId: filterMaterialId || undefined,
            })
            setData(res.data)
            setTotal(res.total)
        } catch {
            setData([])
            setTotal(0)
        } finally {
            setLoading(false)
        }
    }, [page, pageSize, filterSupplierId, filterMaterialId])

    const tableRows = useMemo(() => {
        const q = filterSearch.trim().toLocaleLowerCase()
        if (!q) return data
        return data.filter((row) => {
            const hay = [
                row.supplierMaterialCode,
                row.supplier?.supplierCode,
                row.supplier?.supplierName,
                row.material?.materialCode,
                row.material?.materialName,
            ]
                .filter(Boolean)
                .join(' ')
                .toLocaleLowerCase()
            return hay.includes(q)
        })
    }, [data, filterSearch])

    useEffect(() => { fetchData() }, [fetchData])

    // When supplier + material are chosen, load existing link data if present
    useEffect(() => {
        if (!formOpen || !form.supplierId || !form.materialId) {
            setLookupHint('')
            return
        }
        let cancelled = false
        const timer = setTimeout(async () => {
            try {
                const res = await supplierMaterialService.list({
                    supplierId: form.supplierId,
                    materialId: form.materialId,
                    page: 1,
                    pageSize: 1,
                })
                if (cancelled) return
                const hit = res.data?.[0]
                if (hit) {
                    setEditItem(hit)
                    setForm((p: any) => ({
                        ...p,
                        unitPrice: String(hit.unitPrice ?? ''),
                        leadTimeDays: hit.leadTimeDays != null ? String(hit.leadTimeDays) : '',
                        minimumOrderQuantity: hit.minimumOrderQuantity != null ? String(hit.minimumOrderQuantity) : '',
                    }))
                    setLookupHint('Existing link found — form filled from saved pricing. Saving will update it.')
                } else if (!editItem) {
                    setLookupHint('No existing link for this supplier + material. Enter pricing to create one.')
                } else {
                    setLookupHint('')
                }
            } catch {
                if (!cancelled) setLookupHint('')
            }
        }, 300)
        return () => {
            cancelled = true
            clearTimeout(timer)
        }
        // intentionally omit editItem to avoid loops when we set it from lookup
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formOpen, form.supplierId, form.materialId])

    const openCreate = useCallback(() => {
        setEditItem(null)
        setForm(blankForm())
        setTouched({})
        setForceValidate(false)
        setLookupHint('')
        setFormOpen(true)
    }, [])

    const openEdit = useCallback((item: SupplierMaterial) => {
        setEditItem(item)
        setForm({
            supplierId: item.supplierId,
            materialId: item.materialId,
            unitPrice: String(item.unitPrice),
            leadTimeDays: item.leadTimeDays != null ? String(item.leadTimeDays) : '',
            minimumOrderQuantity: item.minimumOrderQuantity != null ? String(item.minimumOrderQuantity) : '',
            validityStart: item.validityStart ? String(item.validityStart).slice(0, 10) : '',
            validityEnd: item.validityEnd ? String(item.validityEnd).slice(0, 10) : '',
            preferredSupplier: Boolean(item.preferredSupplier),
        })
        setTouched({})
        setForceValidate(false)
        setLookupHint('')
        setFormOpen(true)
    }, [])

    const handleSubmit = useCallback(async () => {
        setForceValidate(true)
        if (hasErrors(fieldErrors)) {
            pushToast('danger', 'Validation', 'Fix the highlighted fields before saving.')
            return
        }
        try {
            const payload = {
                supplierId: form.supplierId.trim(),
                materialId: form.materialId.trim(),
                unitPrice: parseFloat(form.unitPrice) || 0,
                leadTimeDays: form.leadTimeDays ? parseInt(form.leadTimeDays, 10) : undefined,
                minimumOrderQuantity: form.minimumOrderQuantity ? parseFloat(form.minimumOrderQuantity) : undefined,
                validityStart: form.validityStart || undefined,
                validityEnd: form.validityEnd || undefined,
                preferredSupplier: Boolean(form.preferredSupplier),
            }
            if (editItem) {
                await supplierMaterialService.update(editItem.id, payload)
                pushToast('success', 'Updated', 'Supplier-material record updated.')
            } else {
                await supplierMaterialService.create(payload)
                pushToast('success', 'Created', 'Supplier-material record created.')
            }
            setFormOpen(false)
            fetchData()
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message || 'Save failed')
        }
    }, [editItem, form, fetchData, fieldErrors])

    const handleDelete = useCallback(async () => {
        if (!deleteItem) return
        try {
            await supplierMaterialService.delete(deleteItem.id)
            pushToast('success', 'Deleted', 'Supplier-material removed.')
            setDeleteItem(null)
            fetchData()
        } catch (err: any) {
            pushToast('danger', 'Error', err?.response?.data?.message || 'Delete failed')
        }
    }, [deleteItem, fetchData])

    const columns = useMemo<ColumnDef<SupplierMaterial>[]>(
        () => [
            {
                header: 'Link',
                accessorKey: 'supplierMaterialCode',
                size: 140,
                minSize: 120,
                cell: ({ row }) => (
                    <SmSupplierLinkCodeCell
                        code={row.original.supplierMaterialCode}
                    />
                ),
            },
            {
                header: 'Supplier',
                accessorKey: 'supplierId',
                size: 180,
                minSize: 140,
                cell: ({ row }) => {
                    const s = row.original.supplier
                    return (
                        <SmEntityCell
                            kind="supplier"
                            primary={s?.supplierName ?? null}
                            secondary={s?.supplierCode ?? row.original.supplierId}
                        />
                    )
                },
            },
            {
                header: 'Material',
                accessorKey: 'materialId',
                size: 180,
                minSize: 140,
                cell: ({ row }) => {
                    const m = row.original.material
                    return (
                        <SmEntityCell
                            kind="material"
                            primary={m?.materialName ?? null}
                            secondary={m?.materialCode ?? row.original.materialId}
                        />
                    )
                },
            },
            {
                header: 'Unit price',
                accessorKey: 'unitPrice',
                size: 110,
                minSize: 96,
                cell: ({ row }) => (
                    <SmUnitPriceCell
                        amount={row.original.unitPrice}
                        currencyCode={row.original.currency?.code}
                    />
                ),
            },
            {
                header: 'Supply terms',
                id: 'terms',
                size: 150,
                minSize: 120,
                meta: { className: 'hidden md:table-cell' },
                cell: ({ row }) => (
                    <SmSupplyTermsCell
                        moq={row.original.minimumOrderQuantity}
                        leadTimeDays={row.original.leadTimeDays}
                    />
                ),
            },
            {
                header: 'Validity',
                id: 'validity',
                size: 130,
                minSize: 110,
                meta: { className: 'hidden lg:table-cell' },
                cell: ({ row }) => (
                    <SmValidityCell
                        start={row.original.validityStart}
                        end={row.original.validityEnd}
                    />
                ),
            },
            {
                header: 'Flags',
                id: 'flags',
                size: 100,
                minSize: 88,
                cell: ({ row }) => (
                    <div className="flex flex-col gap-1.5">
                        <SmPreferredCell
                            preferred={row.original.preferredSupplier}
                        />
                    </div>
                ),
            },
            {
                header: 'Status',
                accessorKey: 'status',
                size: 100,
                minSize: 88,
                cell: ({ row }) => (
                    <SmRecordStatusCell status={row.original.status} />
                ),
            },
            {
                id: 'actions',
                header: '',
                enableSorting: false,
                size: 52,
                minSize: 48,
                cell: ({ row }) => (
                    <Dropdown
                        renderTitle={<EllipsisButton />}
                        placement="bottom-end"
                    >
                        <Dropdown.Item
                            eventKey="edit"
                            onClick={() => openEdit(row.original)}
                        >
                            <HiOutlinePencil className="text-base" />
                            <span>Edit</span>
                        </Dropdown.Item>
                        <Dropdown.Item
                            eventKey="delete"
                            onClick={() => setDeleteItem(row.original)}
                        >
                            <HiOutlineTrash className="text-base text-red-500" />
                            <span className="text-red-500">Delete</span>
                        </Dropdown.Item>
                    </Dropdown>
                ),
            },
        ],
        [openEdit],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Supplier Materials"
                description="Manage supplier-material pricing and relationships."
                actions={<Button variant="solid" size="sm" icon={<HiOutlinePlus />} onClick={openCreate}>Add Link</Button>}
            />
            <AdaptiveCard className="mt-4">
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Input
                        className="sm:col-span-2 xl:col-span-1"
                        prefix={<HiOutlineSearch className="text-lg" />}
                        placeholder="Search link, supplier, material…"
                        value={filterSearch}
                        onChange={(e) => setFilterSearch(e.target.value)}
                    />
                    <Select
                        isSearchable
                        placeholder="Supplier"
                        options={supplierFilterOpts}
                        value={
                            supplierFilterOpts.find(
                                (o) => o.value === filterSupplierId,
                            ) ?? supplierFilterOpts[0]
                        }
                        onChange={(opt) => {
                            setFilterSupplierId(
                                (opt as { value: string })?.value ?? '',
                            )
                            setPage(1)
                        }}
                    />
                    <Select
                        isSearchable
                        placeholder="Material"
                        options={materialFilterOpts}
                        value={
                            materialFilterOpts.find(
                                (o) => o.value === filterMaterialId,
                            ) ?? materialFilterOpts[0]
                        }
                        onChange={(opt) => {
                            setFilterMaterialId(
                                (opt as { value: string })?.value ?? '',
                            )
                            setPage(1)
                        }}
                    />
                </div>
                {!loading && total > 0 ? (
                    <p className="mb-3 text-xs text-gray-500">
                        {tableRows.length} shown on this page · {total} total
                        matching
                        {filterSearch.trim() ? ' (search filters current page)' : ''}
                    </p>
                ) : null}
                <DataTable<SupplierMaterial>
                    columns={columns}
                    data={tableRows}
                    compact
                    fit
                    loading={loading}
                    getRowId={(row) => row.id}
                    rowClassName={(_, index) => smTableRowEnterClass(index)}
                    noData={!loading && tableRows.length === 0}
                    pagingData={{ total, pageIndex: page - 1, pageSize }}
                    onPaginationChange={(p) => setPage(p + 1)}
                    onSelectChange={(size) => {
                        setPageSize(size)
                        setPage(1)
                    }}
                />
            </AdaptiveCard>

            <FormDialog
                isOpen={formOpen}
                onClose={() => setFormOpen(false)}
                size="md"
                title={`${editItem ? 'Edit' : 'Add'} Supplier Material`}
                description={editItem ? 'Update pricing and lead-time details.' : 'Link a material to a supplier with pricing.'}
                icon={editItem ? <HiOutlinePencil /> : <HiOutlinePlus />}
                footer={
                    <>
                        <Button type="button" size="sm" onClick={() => setFormOpen(false)}>Cancel</Button>
                        <Button type="button" size="sm" variant="solid" onClick={handleSubmit} disabled={forceValidate && hasErrors(fieldErrors)}>
                            {editItem ? 'Save' : 'Create'}
                        </Button>
                    </>
                }
            >
                <FormItem label="Supplier" asterisk invalid={Boolean(err('supplierId'))} errorMessage={err('supplierId')}>
                    <Select
                        isSearchable
                        placeholder="Search supplier code or name…"
                        options={supplierOpts}
                        value={supplierOpts.find((o) => o.value === form.supplierId) ?? null}
                        onChange={(opt: any) => {
                            setTouched((t) => ({ ...t, supplierId: true }))
                            setForm((p: any) => ({
                                ...p,
                                supplierId: opt?.value ?? '',
                                ...(editItem ? {} : {
                                    unitPrice: '',
                                    leadTimeDays: '',
                                    minimumOrderQuantity: '',
                                }),
                            }))
                            if (!editItem) setEditItem(null)
                        }}
                    />
                </FormItem>
                <FormItem label="Material" asterisk invalid={Boolean(err('materialId'))} errorMessage={err('materialId')}>
                    <Select
                        isSearchable
                        placeholder="Search material code or name…"
                        options={materialOpts}
                        value={materialOpts.find((o) => o.value === form.materialId) ?? null}
                        onChange={(opt: any) => {
                            setTouched((t) => ({ ...t, materialId: true }))
                            setForm((p: any) => ({
                                ...p,
                                materialId: opt?.value ?? '',
                                ...(editItem ? {} : {
                                    unitPrice: '',
                                    leadTimeDays: '',
                                    minimumOrderQuantity: '',
                                }),
                            }))
                        }}
                    />
                </FormItem>
                {lookupHint && (
                    <p className="mb-3 text-xs text-primary">{lookupHint}</p>
                )}
                <FormItem label="Unit Price" asterisk invalid={Boolean(err('unitPrice'))} errorMessage={err('unitPrice')}>
                    <Input type="number" placeholder="e.g. 125.00" value={form.unitPrice ?? ''} onChange={(e) => setField('unitPrice', e.target.value)} />
                </FormItem>
                {editItem?.supplierMaterialCode ? (
                    <FormItem label="Supplier material code">
                        <Input value={editItem.supplierMaterialCode} disabled readOnly className="font-mono text-sm" />
                    </FormItem>
                ) : (
                    <p className="mb-2 text-xs text-gray-500">
                        Supplier material code is generated automatically when you save (supplier code + material code).
                    </p>
                )}
                <FormItem label="Lead Time (days)" invalid={Boolean(err('leadTimeDays'))} errorMessage={err('leadTimeDays')}>
                    <Input type="number" placeholder="e.g. 7" value={form.leadTimeDays ?? ''} onChange={(e) => setField('leadTimeDays', e.target.value)} />
                </FormItem>
                <FormItem label="Min Order Qty" invalid={Boolean(err('minimumOrderQuantity'))} errorMessage={err('minimumOrderQuantity')}>
                    <Input type="number" placeholder="e.g. 100" value={form.minimumOrderQuantity ?? ''} onChange={(e) => setField('minimumOrderQuantity', e.target.value)} />
                </FormItem>
                <FormItem label="Valid from">
                    <Input type="date" value={form.validityStart ?? ''} onChange={(e) => setField('validityStart', e.target.value)} />
                </FormItem>
                <FormItem label="Valid to">
                    <Input type="date" value={form.validityEnd ?? ''} onChange={(e) => setField('validityEnd', e.target.value)} />
                </FormItem>
                <FormItem>
                    <Checkbox checked={Boolean(form.preferredSupplier)} onChange={(checked) => setField('preferredSupplier', Boolean(checked))}>
                        Preferred supplier for this material
                    </Checkbox>
                </FormItem>
            </FormDialog>

            <ConfirmDialog
                isOpen={Boolean(deleteItem)}
                type="danger"
                title="Delete supplier-material link?"
                confirmText="Delete"
                onRequestClose={() => setDeleteItem(null)}
                onCancel={() => setDeleteItem(null)}
                onConfirm={handleDelete}
                confirmButtonProps={{ customColorClass: () => 'bg-red-500 hover:bg-red-500/90 text-white' }}
            >
                <p>Are you sure you want to remove this supplier-material link?</p>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default SupplierMaterialsPage
