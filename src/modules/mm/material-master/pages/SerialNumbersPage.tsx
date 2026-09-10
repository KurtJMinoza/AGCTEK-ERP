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
import { batchService, orgService, serialNumberService } from '../services/referenceService'
import { storageBinService } from '@/modules/mm/warehouse/services/storageBinService'
import type { MmSerialNumber } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { required, visibleError, type FieldErrors } from '@/modules/mm/shared/formValidation'
import { useMaterialOptions } from '@/modules/mm/shared/useEntityOptions'

const ROUTE = '/modules/mm/material-master/serial-numbers'
const STATUS_OPTS = [
    { value: 'AVAILABLE', label: 'Available' },
    { value: 'ISSUED', label: 'Issued' },
    { value: 'RESERVED', label: 'Reserved' },
    { value: 'SCRAPPED', label: 'Scrapped' },
]

type Opt = { value: string; label: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(<Notification type={type} title={title} closable duration={3500}>{msg}</Notification>, { placement: 'top-end' })
}

const SerialNumbersPage = () => {
    const breadcrumbs = buildErpBreadcrumbs(ROUTE)
    const [items, setItems] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [addOpen, setAddOpen] = useState(false)
    const [deleting, setDeleting] = useState<MmSerialNumber | null>(null)
    const [materialId, setMaterialId] = useState('')
    const [serialNumber, setSerialNumber] = useState('')
    const [batchId, setBatchId] = useState('')
    const [warehouseId, setWarehouseId] = useState('')
    const [binId, setBinId] = useState('')
    const [status, setStatus] = useState('AVAILABLE')
    const [batchOpts, setBatchOpts] = useState<Opt[]>([])
    const [warehouseOpts, setWarehouseOpts] = useState<Opt[]>([])
    const [binOpts, setBinOpts] = useState<Opt[]>([])
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
    const [bulkDeleting, setBulkDeleting] = useState(false)
    const [touched, setTouched] = useState<Record<string, boolean>>({})
    const [forceValidate, setForceValidate] = useState(false)

    const { options: materialOpts } = useMaterialOptions({ enabled: addOpen })

    const fieldErrors = useMemo<FieldErrors>(() => ({
        materialId: required(materialId, 'Material'),
        serialNumber: required(serialNumber, 'Serial number'),
    }), [materialId, serialNumber])
    const err = (key: string) => visibleError(fieldErrors, touched, key, forceValidate)

    const load = useCallback(async () => {
        setLoading(true)
        try { setItems(await serialNumberService.list() as any) } catch { /* ignore */ }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { load() }, [load])

    useEffect(() => {
        if (!addOpen) return
        orgService.warehouses().then((list) =>
            setWarehouseOpts(list.map((w: any) => ({ value: w.id, label: `${w.code} — ${w.name}` }))),
        ).catch(() => setWarehouseOpts([]))
        storageBinService.list({ limit: 500 } as any).then((r: any) => {
            const list = Array.isArray(r) ? r : r?.data ?? []
            setBinOpts(list.map((b: any) => ({ value: b.id, label: b.code })))
        }).catch(() => setBinOpts([]))
    }, [addOpen])

    useEffect(() => {
        if (!addOpen || !materialId) { setBatchOpts([]); setBatchId(''); return }
        batchService.list(materialId).then((list) =>
            setBatchOpts(list.map((b: any) => ({ value: b.id, label: b.batchNumber }))),
        ).catch(() => setBatchOpts([]))
    }, [addOpen, materialId])

    const resetForm = () => {
        setSerialNumber(''); setMaterialId(''); setBatchId(''); setWarehouseId(''); setBinId('')
        setStatus('AVAILABLE'); setTouched({}); setForceValidate(false)
    }

    const handleAdd = async () => {
        setForceValidate(true)
        if (fieldErrors.materialId || fieldErrors.serialNumber) {
            pushToast('danger', 'Validation', 'Fix the highlighted fields before saving.')
            return
        }
        try {
            await serialNumberService.create({
                materialId,
                serialNumber,
                batchId: batchId || undefined,
                currentWarehouseId: warehouseId || undefined,
                currentBinId: binId || undefined,
                status,
            })
            pushToast('success', 'Created', `Serial ${serialNumber} added.`)
            setAddOpen(false); resetForm(); load()
        } catch (e: any) { pushToast('danger', 'Error', e?.response?.data?.message || 'Failed') }
    }

    const handleDelete = async () => {
        if (!deleting) return
        try { await serialNumberService.remove(deleting.id); pushToast('success', 'Deleted', 'Serial removed.'); setDeleting(null); load() }
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
            await Promise.all(Array.from(selectedRows).map((id) => serialNumberService.remove(id)))
            pushToast('success', 'Bulk delete', `${selectedRows.size} serial(s) deleted.`)
            setSelectedRows(new Set()); setBulkDeleteOpen(false); load()
        } catch { pushToast('danger', 'Error', 'Some deletions failed') }
        finally { setBulkDeleting(false) }
    }, [selectedRows, load])

    const columns = useMemo<ColumnDef<any>[]>(() => [
        { header: 'Material', id: 'material', size: 220, cell: ({ row }: any) => row.original.material ? `${row.original.material.materialCode} — ${row.original.material.materialName}` : '—' },
        { header: 'Serial #', accessorKey: 'serialNumber', size: 160 },
        { header: 'Batch', id: 'batch', size: 120, cell: ({ row }: any) => row.original.batch?.batchNumber ?? '—' },
        { header: 'Warehouse', id: 'wh', size: 120, cell: ({ row }: any) => row.original.currentWarehouse?.code ?? '—' },
        { header: 'Bin', id: 'bin', size: 100, cell: ({ row }: any) => row.original.currentBin?.code ?? '—' },
        { header: 'Status', accessorKey: 'status', size: 110, cell: ({ row }: any) => <Tag>{row.original.status}</Tag> },
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
            <PageHeader title="Serial Numbers" description="Manage serial number records for serial-managed materials." actions={<Button variant="solid" size="sm" icon={<HiOutlinePlus />} onClick={() => { resetForm(); setAddOpen(true) }}>Add serial</Button>} />
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
                title="Add Serial Number"
                description="Register a serial number for a serial-managed material."
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
                <FormItem label="Serial number" asterisk invalid={Boolean(err('serialNumber'))} errorMessage={err('serialNumber')}>
                    <Input value={serialNumber} onChange={(e) => { setSerialNumber(e.target.value); setTouched((t) => ({ ...t, serialNumber: true })) }} placeholder="e.g. SN-00001" />
                </FormItem>
                <FormItem label="Batch">
                    <Select isClearable isSearchable placeholder="Optional batch…" options={batchOpts} value={batchOpts.find((o) => o.value === batchId) ?? null} onChange={(opt: any) => setBatchId(opt?.value ?? '')} />
                </FormItem>
                <FormItem label="Warehouse">
                    <Select isClearable isSearchable placeholder="Optional warehouse…" options={warehouseOpts} value={warehouseOpts.find((o) => o.value === warehouseId) ?? null} onChange={(opt: any) => setWarehouseId(opt?.value ?? '')} />
                </FormItem>
                <FormItem label="Bin">
                    <Select isClearable isSearchable placeholder="Optional bin…" options={binOpts} value={binOpts.find((o) => o.value === binId) ?? null} onChange={(opt: any) => setBinId(opt?.value ?? '')} />
                </FormItem>
                <FormItem label="Status">
                    <Select options={STATUS_OPTS} value={STATUS_OPTS.find((o) => o.value === status)} onChange={(opt: any) => setStatus(opt?.value ?? 'AVAILABLE')} />
                </FormItem>
            </FormDialog>

            <ConfirmDialog isOpen={Boolean(deleting)} type="danger" title="Delete serial number?" confirmText="Delete" onRequestClose={() => setDeleting(null)} onCancel={() => setDeleting(null)} onConfirm={handleDelete}>
                <p>Are you sure?</p>
            </ConfirmDialog>
            <ConfirmDialog isOpen={bulkDeleteOpen} type="danger" title={`Delete ${selectedRows.size} serial(s)?`} confirmText={`Delete ${selectedRows.size}`} onRequestClose={() => setBulkDeleteOpen(false)} onCancel={() => setBulkDeleteOpen(false)} onConfirm={handleBulkDelete} confirmButtonProps={{ loading: bulkDeleting, customColorClass: () => 'bg-red-500 hover:bg-red-500/90 text-white' }}>
                <p>Are you sure you want to delete <span className="font-semibold">{selectedRows.size}</span> selected serial{selectedRows.size > 1 ? 's' : ''}?</p>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default SerialNumbersPage
