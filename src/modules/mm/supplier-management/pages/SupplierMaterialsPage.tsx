'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
import Checkbox from '@/components/ui/Checkbox'
import Dropdown from '@/components/ui/Dropdown'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash } from 'react-icons/hi'
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
import { useMaterialOptions, useSupplierOptions } from '@/modules/mm/shared/useEntityOptions'

const ROUTE_PATH = '/modules/mm/supplier-management/supplier-materials'

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(<Notification type={type} title={title} closable duration={3500}>{msg}</Notification>, { placement: 'top-end' })
}

const blankForm = () => ({
    supplierId: '',
    materialId: '',
    unitPrice: '',
    supplierMaterialCode: '',
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

    const [formOpen, setFormOpen] = useState(false)
    const [editItem, setEditItem] = useState<SupplierMaterial | null>(null)
    const [deleteItem, setDeleteItem] = useState<SupplierMaterial | null>(null)
    const [form, setForm] = useState<any>(blankForm())
    const [touched, setTouched] = useState<Record<string, boolean>>({})
    const [forceValidate, setForceValidate] = useState(false)
    const [lookupHint, setLookupHint] = useState('')

    const { options: supplierOpts } = useSupplierOptions({ enabled: formOpen })
    const { options: materialOpts } = useMaterialOptions({ enabled: formOpen })

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

    const setField = (key: string, value: string) => {
        setForm((p: any) => ({ ...p, [key]: value }))
        setTouched((t) => ({ ...t, [key]: true }))
    }

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const res = await supplierMaterialService.list({ page, pageSize })
            setData(res.data)
            setTotal(res.total)
        } catch { setData([]); setTotal(0) } finally { setLoading(false) }
    }, [page, pageSize])

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
                        supplierMaterialCode: hit.supplierMaterialCode || '',
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
            supplierMaterialCode: item.supplierMaterialCode || '',
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
                supplierMaterialCode: form.supplierMaterialCode || undefined,
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

    const columns = useMemo<ColumnDef<SupplierMaterial>[]>(() => [
        {
            header: 'Supplier',
            accessorKey: 'supplierId',
            cell: ({ row }) => {
                const s = row.original.supplier
                return s ? <span className="text-sm">{s.supplierCode} — {s.supplierName}</span> : <span>{row.original.supplierId}</span>
            },
        },
        {
            header: 'Material',
            accessorKey: 'materialId',
            cell: ({ row }) => {
                const m = row.original.material
                return m ? <span className="text-sm">{m.materialCode} — {m.materialName}</span> : <span>{row.original.materialId}</span>
            },
        },
        { header: 'Supplier Code', accessorKey: 'supplierMaterialCode', cell: ({ row }) => <span>{row.original.supplierMaterialCode || '—'}</span> },
        { header: 'Unit Price', accessorKey: 'unitPrice', cell: ({ row }) => <span className="font-semibold">{Number(row.original.unitPrice).toFixed(2)}</span> },
        { header: 'MOQ', accessorKey: 'minimumOrderQuantity', cell: ({ row }) => <span>{row.original.minimumOrderQuantity ?? '—'}</span> },
        { header: 'Lead Time', accessorKey: 'leadTimeDays', cell: ({ row }) => <span>{row.original.leadTimeDays ? `${row.original.leadTimeDays}d` : '—'}</span> },
        {
            header: 'Preferred',
            accessorKey: 'preferredSupplier',
            cell: ({ row }) => <StatusBadge tone={row.original.preferredSupplier ? 'success' : 'default'}>{row.original.preferredSupplier ? 'Yes' : 'No'}</StatusBadge>,
        },
        {
            header: 'Status',
            accessorKey: 'status',
            cell: ({ row }) => <StatusBadge tone={row.original.status === 'ACTIVE' ? 'success' : 'warning'}>{row.original.status}</StatusBadge>,
        },
        {
            id: 'actions',
            header: '',
            enableSorting: false,
            size: 48,
            cell: ({ row }) => (
                <Dropdown renderTitle={<EllipsisButton />} placement="bottom-end">
                    <Dropdown.Item eventKey="edit" onClick={() => openEdit(row.original)}>
                        <HiOutlinePencil className="text-base" /><span>Edit</span>
                    </Dropdown.Item>
                    <Dropdown.Item eventKey="delete" onClick={() => setDeleteItem(row.original)}>
                        <HiOutlineTrash className="text-base text-red-500" /><span className="text-red-500">Delete</span>
                    </Dropdown.Item>
                </Dropdown>
            ),
        },
    ], [openEdit])

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Supplier Materials"
                description="Manage supplier-material pricing and relationships."
                actions={<Button variant="solid" size="sm" icon={<HiOutlinePlus />} onClick={openCreate}>Add Link</Button>}
            />
            <AdaptiveCard className="mt-4">
                <DataTable<SupplierMaterial>
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
                                    supplierMaterialCode: '',
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
                                    supplierMaterialCode: '',
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
                <FormItem label="Supplier Material Code">
                    <Input placeholder="e.g. SUP-SKU-001" value={form.supplierMaterialCode ?? ''} onChange={(e) => setField('supplierMaterialCode', e.target.value)} />
                </FormItem>
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
