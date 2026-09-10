'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi'
import { supplierPricingService, type SupplierPrice } from '../services/supplierPricingService'
import { orgService } from '@/modules/mm/material-master/services/referenceService'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { firstError, nonNegativeNumber, required, visibleError, type FieldErrors } from '@/modules/mm/shared/formValidation'
import { useMaterialOptions, useSupplierOptions } from '@/modules/mm/shared/useEntityOptions'

const ROUTE = '/modules/mm/supplier-management/supplier-pricing'

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(<Notification type={type} title={title} closable duration={3500}>{msg}</Notification>, { placement: 'top-end' })
}

type Opt = { value: string; label: string }

const SupplierPricingPage = () => {
    const breadcrumbs = buildErpBreadcrumbs(ROUTE)
    const [items, setItems] = useState<SupplierPrice[]>([])
    const [loading, setLoading] = useState(true)
    const [addOpen, setAddOpen] = useState(false)
    const [deleting, setDeleting] = useState<SupplierPrice | null>(null)
    const [currencyOpts, setCurrencyOpts] = useState<Opt[]>([])
    const [supplierId, setSupplierId] = useState('')
    const [materialId, setMaterialId] = useState('')
    const [unitPrice, setUnitPrice] = useState('')
    const [currencyId, setCurrencyId] = useState('')
    const [minimumQuantity, setMinimumQuantity] = useState('0')
    const [effectiveFrom, setEffectiveFrom] = useState('')
    const [effectiveTo, setEffectiveTo] = useState('')
    const [touched, setTouched] = useState<Record<string, boolean>>({})
    const [forceValidate, setForceValidate] = useState(false)

    const { options: supplierOpts } = useSupplierOptions({ enabled: addOpen })
    const { options: materialOpts } = useMaterialOptions({ enabled: addOpen })

    const fieldErrors = useMemo<FieldErrors>(() => ({
        supplierId: required(supplierId, 'Supplier'),
        materialId: required(materialId, 'Material'),
        unitPrice: firstError(required(unitPrice, 'Unit price'), nonNegativeNumber(unitPrice, 'Unit price')),
        minimumQuantity: nonNegativeNumber(minimumQuantity, 'Min qty'),
    }), [supplierId, materialId, unitPrice, minimumQuantity])
    const err = (key: string) => visibleError(fieldErrors, touched, key, forceValidate)

    const load = useCallback(async () => {
        setLoading(true)
        try { setItems(await supplierPricingService.list()) } catch { /* ignore */ }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { load() }, [load])

    useEffect(() => {
        if (!addOpen) return
        orgService.currencies().then((list) =>
            setCurrencyOpts(list.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))),
        ).catch(() => setCurrencyOpts([]))
    }, [addOpen])

    const reset = () => {
        setSupplierId(''); setMaterialId(''); setUnitPrice(''); setCurrencyId('')
        setMinimumQuantity('0'); setEffectiveFrom(''); setEffectiveTo('')
        setTouched({}); setForceValidate(false)
    }

    const handleAdd = async () => {
        setForceValidate(true)
        if (fieldErrors.supplierId || fieldErrors.materialId || fieldErrors.unitPrice || fieldErrors.minimumQuantity) {
            pushToast('danger', 'Validation', 'Fix the highlighted fields before saving.')
            return
        }
        try {
            await supplierPricingService.create({
                supplierId,
                materialId,
                unitPrice: Number(unitPrice),
                currencyId: currencyId || undefined,
                minimumQuantity: Number(minimumQuantity || 0),
                effectiveFrom: effectiveFrom || undefined,
                effectiveTo: effectiveTo || undefined,
            })
            pushToast('success', 'Created', 'Price band created.')
            setAddOpen(false); reset(); load()
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message || 'Failed')
        }
    }

    const handleDelete = async () => {
        if (!deleting) return
        try {
            await supplierPricingService.remove(deleting.id)
            pushToast('success', 'Deleted', 'Price band removed.')
            setDeleting(null); load()
        } catch { pushToast('danger', 'Error', 'Delete failed') }
    }

    const columns = useMemo<ColumnDef<SupplierPrice>[]>(() => [
        { header: 'Supplier', id: 'sup', size: 200, cell: ({ row }) => row.original.supplier ? `${row.original.supplier.supplierCode} — ${row.original.supplier.supplierName}` : '—' },
        { header: 'Material', id: 'mat', size: 200, cell: ({ row }) => row.original.material ? `${row.original.material.materialCode} — ${row.original.material.materialName}` : '—' },
        { header: 'Unit price', accessorKey: 'unitPrice', size: 110, cell: ({ row }) => Number(row.original.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2 }) },
        { header: 'Currency', id: 'cur', size: 90, cell: ({ row }) => row.original.currency?.code ?? '—' },
        { header: 'Min qty', accessorKey: 'minimumQuantity', size: 90, cell: ({ row }) => Number(row.original.minimumQuantity).toLocaleString() },
        { header: 'From', accessorKey: 'effectiveFrom', size: 120, cell: ({ row }) => new Date(row.original.effectiveFrom).toLocaleDateString() },
        { header: 'To', accessorKey: 'effectiveTo', size: 120, cell: ({ row }) => row.original.effectiveTo ? new Date(row.original.effectiveTo).toLocaleDateString() : 'Open' },
        { id: 'actions', header: '', size: 56, cell: ({ row }) => <Button size="xs" variant="plain" icon={<HiOutlineTrash className="text-red-500" />} onClick={() => setDeleting(row.original)} /> },
    ], [])

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbs} />
            <PageHeader title="Supplier Pricing" description="Effective-dated price bands by supplier and material." actions={<Button variant="solid" size="sm" icon={<HiOutlinePlus />} onClick={() => { reset(); setAddOpen(true) }}>Add price</Button>} />
            <AdaptiveCard>
                <DataTable columns={columns} data={items} compact loading={loading} />
            </AdaptiveCard>

            <FormDialog
                isOpen={addOpen}
                onClose={() => setAddOpen(false)}
                size="md"
                title="Add Supplier Price"
                description="Create an effective-dated price band."
                icon={<HiOutlinePlus />}
                footer={<><Button size="sm" onClick={() => setAddOpen(false)}>Cancel</Button><Button size="sm" variant="solid" onClick={handleAdd}>Add</Button></>}
            >
                <FormItem label="Supplier" asterisk invalid={Boolean(err('supplierId'))} errorMessage={err('supplierId')}>
                    <Select isSearchable options={supplierOpts} value={supplierOpts.find((o) => o.value === supplierId) ?? null} onChange={(opt: any) => { setSupplierId(opt?.value ?? ''); setTouched((t) => ({ ...t, supplierId: true })) }} />
                </FormItem>
                <FormItem label="Material" asterisk invalid={Boolean(err('materialId'))} errorMessage={err('materialId')}>
                    <Select isSearchable options={materialOpts} value={materialOpts.find((o) => o.value === materialId) ?? null} onChange={(opt: any) => { setMaterialId(opt?.value ?? ''); setTouched((t) => ({ ...t, materialId: true })) }} />
                </FormItem>
                <FormItem label="Unit price" asterisk invalid={Boolean(err('unitPrice'))} errorMessage={err('unitPrice')}>
                    <Input type="number" value={unitPrice} onChange={(e) => { setUnitPrice(e.target.value); setTouched((t) => ({ ...t, unitPrice: true })) }} placeholder="0.00" />
                </FormItem>
                <FormItem label="Currency">
                    <Select isClearable options={currencyOpts} value={currencyOpts.find((o) => o.value === currencyId) ?? null} onChange={(opt: any) => setCurrencyId(opt?.value ?? '')} />
                </FormItem>
                <FormItem label="Minimum quantity" invalid={Boolean(err('minimumQuantity'))} errorMessage={err('minimumQuantity')}>
                    <Input type="number" value={minimumQuantity} onChange={(e) => { setMinimumQuantity(e.target.value); setTouched((t) => ({ ...t, minimumQuantity: true })) }} />
                </FormItem>
                <FormItem label="Effective from">
                    <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
                </FormItem>
                <FormItem label="Effective to">
                    <Input type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
                </FormItem>
            </FormDialog>

            <ConfirmDialog isOpen={Boolean(deleting)} type="danger" title="Delete price band?" confirmText="Delete" onRequestClose={() => setDeleting(null)} onCancel={() => setDeleting(null)} onConfirm={handleDelete}>
                <p>Remove this effective-dated price band?</p>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default SupplierPricingPage
