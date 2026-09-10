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
import Tag from '@/components/ui/Tag'
import Dropdown from '@/components/ui/Dropdown'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi'
import { batchService } from '../services/referenceService'
import type { MmBatch } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { required, visibleError, type FieldErrors } from '@/modules/mm/shared/formValidation'
import { useMaterialOptions, useSupplierOptions } from '@/modules/mm/shared/useEntityOptions'

const ROUTE = '/modules/mm/material-master/batches'
const STATUS_OPTS = [
    { value: 'AVAILABLE', label: 'Available' },
    { value: 'QUARANTINE', label: 'Quarantine' },
    { value: 'EXPIRED', label: 'Expired' },
    { value: 'CLOSED', label: 'Closed' },
]

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(<Notification type={type} title={title} closable duration={3500}>{msg}</Notification>, { placement: 'top-end' })
}

const BatchesPage = () => {
    const breadcrumbs = buildErpBreadcrumbs(ROUTE)
    const [items, setItems] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [addOpen, setAddOpen] = useState(false)
    const [deleting, setDeleting] = useState<MmBatch | null>(null)
    const [materialId, setMaterialId] = useState('')
    const [batchNumber, setBatchNumber] = useState('')
    const [manufacturingDate, setManufacturingDate] = useState('')
    const [expiryDate, setExpiryDate] = useState('')
    const [supplierId, setSupplierId] = useState('')
    const [status, setStatus] = useState('AVAILABLE')
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
    const [bulkDeleting, setBulkDeleting] = useState(false)
    const [touched, setTouched] = useState<Record<string, boolean>>({})
    const [forceValidate, setForceValidate] = useState(false)

    const { options: materialOpts } = useMaterialOptions({ enabled: addOpen })
    const { options: supplierOpts } = useSupplierOptions({ enabled: addOpen })

    const fieldErrors = useMemo<FieldErrors>(() => ({
        materialId: required(materialId, 'Material'),
        batchNumber: required(batchNumber, 'Batch number'),
    }), [materialId, batchNumber])
    const err = (key: string) => visibleError(fieldErrors, touched, key, forceValidate)

    const load = useCallback(async () => {
        setLoading(true)
        try { setItems(await batchService.list() as any) } catch { /* ignore */ }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { load() }, [load])

    const resetForm = () => {
        setBatchNumber(''); setMaterialId(''); setManufacturingDate(''); setExpiryDate('')
        setSupplierId(''); setStatus('AVAILABLE'); setTouched({}); setForceValidate(false)
    }

    const handleAdd = async () => {
        setForceValidate(true)
        if (fieldErrors.materialId || fieldErrors.batchNumber) {
            pushToast('danger', 'Validation', 'Fix the highlighted fields before saving.')
            return
        }
        try {
            await batchService.create({
                materialId,
                batchNumber,
                manufacturingDate: manufacturingDate || undefined,
                expiryDate: expiryDate || undefined,
                supplierId: supplierId || undefined,
                status,
            })
            pushToast('success', 'Created', `Batch ${batchNumber} created.`)
            setAddOpen(false); resetForm(); load()
        } catch (e: any) { pushToast('danger', 'Error', e?.response?.data?.message || 'Failed') }
    }

    const handleDelete = async () => {
        if (!deleting) return
        try { await batchService.remove(deleting.id); pushToast('success', 'Deleted', 'Batch removed.'); setDeleting(null); load() }
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
            await Promise.all(Array.from(selectedRows).map((id) => batchService.remove(id)))
            pushToast('success', 'Bulk delete', `${selectedRows.size} batch(es) deleted.`)
            setSelectedRows(new Set()); setBulkDeleteOpen(false); load()
        } catch { pushToast('danger', 'Error', 'Some deletions failed') }
        finally { setBulkDeleting(false) }
    }, [selectedRows, load])

    const columns = useMemo<ColumnDef<any>[]>(() => [
        { header: 'Material', id: 'material', size: 220, cell: ({ row }: any) => row.original.material ? `${row.original.material.materialCode} — ${row.original.material.materialName}` : '—' },
        { header: 'Batch #', accessorKey: 'batchNumber', size: 140 },
        { header: 'Supplier', id: 'supplier', size: 160, cell: ({ row }: any) => row.original.supplier ? `${row.original.supplier.supplierCode}` : '—' },
        { header: 'Status', accessorKey: 'status', size: 120, cell: ({ row }: any) => <Tag>{row.original.status}</Tag> },
        { header: 'Mfg date', accessorKey: 'manufacturingDate', size: 120, cell: ({ row }: any) => row.original.manufacturingDate ? new Date(row.original.manufacturingDate).toLocaleDateString() : '—' },
        { header: 'Expiry', accessorKey: 'expiryDate', size: 120, cell: ({ row }: any) => row.original.expiryDate ? new Date(row.original.expiryDate).toLocaleDateString() : '—' },
        {
            id: 'actions', header: '', size: 56, enableSorting: false, cell: ({ row }: any) => (
                <Dropdown renderTitle={<EllipsisButton />} placement="bottom-end">
                    <Dropdown.Item eventKey="delete" onClick={() => setDeleting(row.original)}><HiOutlineTrash className="text-base text-red-500" /><span className="text-red-500">Delete</span></Dropdown.Item>
                </Dropdown>
            ),
        },
    ], [])

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbs} />
            <PageHeader title="Batches" description="Manage batch records for batch-managed materials." actions={<Button variant="solid" size="sm" icon={<HiOutlinePlus />} onClick={() => { resetForm(); setAddOpen(true) }}>Add batch</Button>} />
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
                title="Add Batch"
                description="Create a batch record for a batch-managed material."
                icon={<HiOutlinePlus />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" onClick={handleAdd}>Add</Button>
                    </>
                }
            >
                <FormItem label="Material" asterisk invalid={Boolean(err('materialId'))} errorMessage={err('materialId')}>
                    <Select isSearchable placeholder="Search material…" options={materialOpts} value={materialOpts.find((o) => o.value === materialId) ?? null} onChange={(opt: any) => { setMaterialId(opt?.value ?? ''); setTouched((t) => ({ ...t, materialId: true })) }} />
                </FormItem>
                <FormItem label="Batch number" asterisk invalid={Boolean(err('batchNumber'))} errorMessage={err('batchNumber')}>
                    <Input value={batchNumber} onChange={(e) => { setBatchNumber(e.target.value); setTouched((t) => ({ ...t, batchNumber: true })) }} placeholder="e.g. BATCH-001" />
                </FormItem>
                <FormItem label="Supplier">
                    <Select isClearable isSearchable placeholder="Optional supplier…" options={supplierOpts} value={supplierOpts.find((o) => o.value === supplierId) ?? null} onChange={(opt: any) => setSupplierId(opt?.value ?? '')} />
                </FormItem>
                <FormItem label="Manufacture date">
                    <Input type="date" value={manufacturingDate} onChange={(e) => setManufacturingDate(e.target.value)} />
                </FormItem>
                <FormItem label="Expiry date">
                    <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
                </FormItem>
                <FormItem label="Status">
                    <Select options={STATUS_OPTS} value={STATUS_OPTS.find((o) => o.value === status)} onChange={(opt: any) => setStatus(opt?.value ?? 'AVAILABLE')} />
                </FormItem>
            </FormDialog>

            <ConfirmDialog isOpen={Boolean(deleting)} type="danger" title="Delete batch?" confirmText="Delete" onRequestClose={() => setDeleting(null)} onCancel={() => setDeleting(null)} onConfirm={handleDelete}>
                <p>Are you sure?</p>
            </ConfirmDialog>
            <ConfirmDialog isOpen={bulkDeleteOpen} type="danger" title={`Delete ${selectedRows.size} batch(es)?`} confirmText={`Delete ${selectedRows.size}`} onRequestClose={() => setBulkDeleteOpen(false)} onCancel={() => setBulkDeleteOpen(false)} onConfirm={handleBulkDelete} confirmButtonProps={{ loading: bulkDeleting, customColorClass: () => 'bg-red-500 hover:bg-red-500/90 text-white' }}>
                <p>Are you sure you want to delete <span className="font-semibold">{selectedRows.size}</span> selected batch{selectedRows.size > 1 ? 'es' : ''}?</p>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default BatchesPage
