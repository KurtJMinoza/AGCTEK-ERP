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
import Checkbox from '@/components/ui/Checkbox'
import Tag from '@/components/ui/Tag'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi'
import { barcodeService } from '../services/referenceService'
import type { MmBarcode } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { required, visibleError, type FieldErrors } from '@/modules/mm/shared/formValidation'
import { useMaterialOptions } from '@/modules/mm/shared/useEntityOptions'

const ROUTE = '/modules/mm/material-master/barcodes'

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(<Notification type={type} title={title} closable duration={3500}>{msg}</Notification>, { placement: 'top-end' })
}

const BARCODE_TYPE_OPTIONS = [
    { value: 'EAN13', label: 'EAN-13' },
    { value: 'UPC', label: 'UPC' },
    { value: 'CODE128', label: 'Code 128' },
    { value: 'QR', label: 'QR Code' },
]

const BarcodesPage = () => {
    const breadcrumbs = buildErpBreadcrumbs(ROUTE)
    const [items, setItems] = useState<(MmBarcode & { material?: { materialCode: string; materialName: string } })[]>([])
    const [loading, setLoading] = useState(true)
    const [addOpen, setAddOpen] = useState(false)
    const [deleting, setDeleting] = useState<MmBarcode | null>(null)
    const [barcodeType, setBarcodeType] = useState('EAN13')
    const [barcodeValue, setBarcodeValue] = useState('')
    const [materialId, setMaterialId] = useState('')
    const [isPrimary, setIsPrimary] = useState(false)
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
    const [bulkDeleting, setBulkDeleting] = useState(false)
    const [touched, setTouched] = useState<Record<string, boolean>>({})
    const [forceValidate, setForceValidate] = useState(false)

    const { options: materialOpts } = useMaterialOptions({ enabled: addOpen })

    const fieldErrors = useMemo<FieldErrors>(() => ({
        materialId: required(materialId, 'Material'),
        barcodeValue: required(barcodeValue, 'Value'),
    }), [materialId, barcodeValue])

    const err = (key: string) => visibleError(fieldErrors, touched, key, forceValidate)

    const load = useCallback(async () => {
        setLoading(true)
        try { setItems(await barcodeService.list() as any) } catch { /* ignore */ }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { load() }, [load])

    const handleAdd = async () => {
        setForceValidate(true)
        if (fieldErrors.materialId || fieldErrors.barcodeValue) {
            pushToast('danger', 'Validation', 'Fix the highlighted fields before saving.')
            return
        }
        try {
            await barcodeService.create({ materialId, barcodeType, barcodeValue, isPrimary })
            pushToast('success', 'Created', 'Barcode added.')
            setAddOpen(false); setBarcodeValue(''); setMaterialId(''); setIsPrimary(false); setTouched({}); setForceValidate(false); load()
        } catch (e: any) { pushToast('danger', 'Error', e?.response?.data?.message || 'Failed') }
    }

    const handleDelete = async () => {
        if (!deleting) return
        try { await barcodeService.remove(deleting.id); pushToast('success', 'Deleted', 'Barcode removed.'); setDeleting(null); load() }
        catch { pushToast('danger', 'Error', 'Delete failed') }
    }

    const handleCheckBoxChange = useCallback((checked: boolean, row: any) => {
        setSelectedRows((prev) => { const next = new Set(prev); checked ? next.add(row.id) : next.delete(row.id); return next })
    }, [])
    const handleSelectAllChange = useCallback((checked: boolean, rows: { original: any }[]) => {
        setSelectedRows((prev) => { const next = new Set(prev); for (const r of rows) { checked ? next.add(r.original.id) : next.delete(r.original.id) } return next })
    }, [])
    const handleBulkDelete = useCallback(async () => {
        setBulkDeleting(true)
        try {
            await Promise.all(Array.from(selectedRows).map((id) => barcodeService.remove(id)))
            pushToast('success', 'Bulk delete', `${selectedRows.size} barcode(s) deleted.`)
            setSelectedRows(new Set()); setBulkDeleteOpen(false); load()
        } catch { pushToast('danger', 'Error', 'Some deletions failed') }
        finally { setBulkDeleting(false) }
    }, [selectedRows, load])

    const columns = useMemo<ColumnDef<any>[]>(() => [
        { header: 'Material', id: 'material', size: 250, cell: ({ row }: any) => row.original.material ? `${row.original.material.materialCode} — ${row.original.material.materialName}` : '—' },
        { header: 'Type', accessorKey: 'barcodeType', size: 120 },
        { header: 'Value', accessorKey: 'barcodeValue', size: 300 },
        { header: 'Primary', accessorKey: 'isPrimary', size: 80, cell: ({ row }: any) => row.original.isPrimary ? <Tag className="bg-emerald-100 text-emerald-700 text-xs">Yes</Tag> : <span className="text-gray-400">No</span> },
        { id: 'actions', header: '', size: 56, cell: ({ row }: any) => <Button size="xs" variant="plain" icon={<HiOutlineTrash className="text-red-500" />} onClick={() => setDeleting(row.original)} /> },
    ], [])

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbs} />
            <PageHeader title="Barcodes" description="Manage barcode records across all materials." actions={<Button variant="solid" size="sm" icon={<HiOutlinePlus />} onClick={() => setAddOpen(true)}>Add barcode</Button>} />
            <AdaptiveCard>
                {selectedRows.size > 0 && (
                    <div className="mb-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 dark:border-red-500/30 dark:bg-red-500/10">
                        <span className="text-sm font-medium text-red-700 dark:text-red-300">{selectedRows.size} item{selectedRows.size > 1 ? 's' : ''} selected</span>
                        <div className="ml-auto flex items-center gap-2">
                            <Button size="xs" onClick={() => setSelectedRows(new Set())}>Clear</Button>
                            <Button size="xs" variant="solid" customColorClass={() => 'bg-red-500 hover:bg-red-600 text-white'} icon={<HiOutlineTrash />} onClick={() => setBulkDeleteOpen(true)}>Delete selected</Button>
                        </div>
                    </div>
                )}
                <DataTable columns={columns} data={items} compact loading={loading} selectable checkboxChecked={(row: any) => selectedRows.has(row.id)} onCheckBoxChange={handleCheckBoxChange} onIndeterminateCheckBoxChange={(checked, rows) => handleSelectAllChange(checked, rows as any)} />
            </AdaptiveCard>

            <FormDialog
                isOpen={addOpen}
                onClose={() => setAddOpen(false)}
                size="md"
                title="Add Barcode"
                description="Link a barcode value to a material."
                icon={<HiOutlinePlus />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" onClick={handleAdd}>Add</Button>
                    </>
                }
            >
                <FormItem label="Material" asterisk invalid={Boolean(err('materialId'))} errorMessage={err('materialId')}>
                    <Select
                        isSearchable
                        placeholder="Search material code or name…"
                        options={materialOpts}
                        value={materialOpts.find((o) => o.value === materialId) ?? null}
                        onChange={(opt: any) => {
                            setMaterialId(opt?.value ?? '')
                            setTouched((t) => ({ ...t, materialId: true }))
                        }}
                    />
                </FormItem>
                <FormItem label="Barcode type">
                    <Select options={BARCODE_TYPE_OPTIONS} value={BARCODE_TYPE_OPTIONS.find((o) => o.value === barcodeType)} onChange={(opt: any) => setBarcodeType(opt?.value ?? 'EAN13')} />
                </FormItem>
                <FormItem label="Value" asterisk invalid={Boolean(err('barcodeValue'))} errorMessage={err('barcodeValue')}>
                    <Input value={barcodeValue} onChange={(e) => { setBarcodeValue(e.target.value); setTouched((t) => ({ ...t, barcodeValue: true })) }} placeholder="Barcode value" />
                </FormItem>
                <FormItem>
                    <Checkbox checked={isPrimary} onChange={(checked) => setIsPrimary(Boolean(checked))}>
                        Primary barcode for this material
                    </Checkbox>
                </FormItem>
            </FormDialog>

            <ConfirmDialog isOpen={Boolean(deleting)} type="danger" title="Delete barcode?" confirmText="Delete" onRequestClose={() => setDeleting(null)} onCancel={() => setDeleting(null)} onConfirm={handleDelete}>
                <p>Are you sure you want to delete this barcode?</p>
            </ConfirmDialog>
            <ConfirmDialog isOpen={bulkDeleteOpen} type="danger" title={`Delete ${selectedRows.size} barcode(s)?`} confirmText={`Delete ${selectedRows.size}`} onRequestClose={() => setBulkDeleteOpen(false)} onCancel={() => setBulkDeleteOpen(false)} onConfirm={handleBulkDelete} confirmButtonProps={{ loading: bulkDeleting, customColorClass: () => 'bg-red-500 hover:bg-red-500/90 text-white' }}>
                <p>Are you sure you want to delete <span className="font-semibold">{selectedRows.size}</span> selected barcode{selectedRows.size > 1 ? 's' : ''}?</p>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default BarcodesPage
