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
import Dropdown from '@/components/ui/Dropdown'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash } from 'react-icons/hi'
import { uomConversionService, uomService } from '../services/referenceService'
import type { MmUomConversion, MmUom } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { firstError, positiveNumber, required, visibleError, type FieldErrors } from '@/modules/mm/shared/formValidation'
import { useMaterialOptions } from '@/modules/mm/shared/useEntityOptions'

const ROUTE = '/modules/mm/material-master/uom-conversions'

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(<Notification type={type} title={title} closable duration={3500}>{msg}</Notification>, { placement: 'top-end' })
}

type Opt = { value: string; label: string }

const UomConversionsPage = () => {
    const breadcrumbs = buildErpBreadcrumbs(ROUTE)
    const [items, setItems] = useState<MmUomConversion[]>([])
    const [uoms, setUoms] = useState<MmUom[]>([])
    const [loading, setLoading] = useState(true)
    const [formOpen, setFormOpen] = useState(false)
    const [editing, setEditing] = useState<MmUomConversion | null>(null)
    const [deleting, setDeleting] = useState<MmUomConversion | null>(null)
    const [fromId, setFromId] = useState('')
    const [toId, setToId] = useState('')
    const [factor, setFactor] = useState('1')
    const [materialId, setMaterialId] = useState('')
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
    const [bulkDeleting, setBulkDeleting] = useState(false)
    const [touched, setTouched] = useState<Record<string, boolean>>({})
    const [forceValidate, setForceValidate] = useState(false)

    const { options: materialOpts } = useMaterialOptions({ enabled: formOpen })
    const uomOpts = useMemo<Opt[]>(() => uoms.map((u) => ({ value: u.id, label: `${u.code} — ${u.name}` })), [uoms])

    const fieldErrors = useMemo<FieldErrors>(() => ({
        fromId: required(fromId, 'From UOM'),
        toId: firstError(
            required(toId, 'To UOM'),
            fromId && toId && fromId === toId ? 'From and To UOM must differ' : undefined,
        ),
        factor: firstError(required(factor, 'Factor'), positiveNumber(factor, 'Factor')),
    }), [fromId, toId, factor])
    const err = (key: string) => visibleError(fieldErrors, touched, key, forceValidate)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const [c, u] = await Promise.all([uomConversionService.list(), uomService.list()])
            setItems(c); setUoms(u)
        } catch { /* ignore */ }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { load() }, [load])

    const openCreate = () => { setEditing(null); setFromId(''); setToId(''); setFactor('1'); setMaterialId(''); setTouched({}); setForceValidate(false); setFormOpen(true) }
    const openEdit = (item: MmUomConversion) => {
        setEditing(item)
        setFromId(item.fromUomId)
        setToId(item.toUomId)
        setFactor(String(item.factor))
        setMaterialId((item as any).materialId ?? '')
        setTouched({})
        setForceValidate(false)
        setFormOpen(true)
    }

    const handleSave = async () => {
        setForceValidate(true)
        if (fieldErrors.fromId || fieldErrors.toId || fieldErrors.factor) {
            pushToast('danger', 'Validation', 'Fix the highlighted fields before saving.')
            return
        }
        try {
            const data = {
                fromUomId: fromId,
                toUomId: toId,
                factor: Number(factor),
                materialId: materialId || undefined,
            }
            if (editing) { await uomConversionService.update(editing.id, { ...data, materialId: materialId || null }); pushToast('success', 'Updated', 'Conversion updated.') }
            else { await uomConversionService.create(data); pushToast('success', 'Created', 'Conversion created.') }
            setFormOpen(false); load()
        } catch (e: any) { pushToast('danger', 'Error', e?.response?.data?.message || 'Failed') }
    }

    const handleDelete = async () => {
        if (!deleting) return
        try { await uomConversionService.remove(deleting.id); pushToast('success', 'Deleted', 'Conversion removed.'); setDeleting(null); load() }
        catch { pushToast('danger', 'Error', 'Delete failed') }
    }

    const handleCheckBoxChange = useCallback((checked: boolean, row: MmUomConversion) => {
        setSelectedRows((prev) => { const next = new Set(prev); checked ? next.add(row.id) : next.delete(row.id); return next })
    }, [])
    const handleSelectAllChange = useCallback((checked: boolean, rows: { original: MmUomConversion }[]) => {
        setSelectedRows((prev) => { const next = new Set(prev); for (const r of rows) { checked ? next.add(r.original.id) : next.delete(r.original.id) } return next })
    }, [])
    const handleBulkDelete = useCallback(async () => {
        setBulkDeleting(true)
        try {
            await Promise.all(Array.from(selectedRows).map((id) => uomConversionService.remove(id)))
            pushToast('success', 'Bulk delete', `${selectedRows.size} conversion(s) deleted.`)
            setSelectedRows(new Set()); setBulkDeleteOpen(false); load()
        } catch { pushToast('danger', 'Error', 'Some deletions failed') }
        finally { setBulkDeleting(false) }
    }, [selectedRows, load])

    const columns = useMemo<ColumnDef<MmUomConversion>[]>(() => [
        { header: 'From UOM', accessorKey: 'fromUomId', size: 180, cell: ({ row }) => row.original.fromUom ? `${row.original.fromUom.code} — ${row.original.fromUom.name}` : '—' },
        { header: 'To UOM', accessorKey: 'toUomId', size: 180, cell: ({ row }) => row.original.toUom ? `${row.original.toUom.code} — ${row.original.toUom.name}` : '—' },
        { header: 'Factor', accessorKey: 'factor', size: 120, cell: ({ row }) => String(row.original.factor) },
        { header: 'Material', id: 'material', size: 200, cell: ({ row }) => row.original.material ? `${row.original.material.materialCode}` : 'Global' },
        {
            id: 'actions', header: '', size: 56, enableSorting: false, cell: ({ row }) => (
                <Dropdown renderTitle={<EllipsisButton />} placement="bottom-end">
                    <Dropdown.Item eventKey="edit" onClick={() => openEdit(row.original)}><HiOutlinePencil className="text-base" /><span>Edit</span></Dropdown.Item>
                    <Dropdown.Item eventKey="delete" onClick={() => setDeleting(row.original)}><HiOutlineTrash className="text-base text-red-500" /><span className="text-red-500">Delete</span></Dropdown.Item>
                </Dropdown>
            ),
        },
    ], [])

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbs} />
            <PageHeader title="UOM Conversions" description="Define conversion factors between units of measure." actions={<Button variant="solid" size="sm" icon={<HiOutlinePlus />} onClick={openCreate}>Add conversion</Button>} />
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
                <DataTable<MmUomConversion> columns={columns} data={items} compact loading={loading} selectable checkboxChecked={(row) => selectedRows.has(row.id)} onCheckBoxChange={handleCheckBoxChange} onIndeterminateCheckBoxChange={(checked, rows) => handleSelectAllChange(checked, rows as any)} />
            </AdaptiveCard>

            <FormDialog
                isOpen={formOpen}
                onClose={() => setFormOpen(false)}
                size="md"
                title={editing ? 'Edit Conversion' : 'New Conversion'}
                description="Define the conversion factor between two units of measure."
                icon={editing ? <HiOutlinePencil /> : <HiOutlinePlus />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setFormOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" onClick={handleSave}>Save</Button>
                    </>
                }
            >
                <FormItem label="From UOM" asterisk invalid={Boolean(err('fromId'))} errorMessage={err('fromId')}>
                    <Select<Opt> options={uomOpts} value={uomOpts.find((o) => o.value === fromId)} onChange={(opt) => { setFromId(opt?.value ?? ''); setTouched((t) => ({ ...t, fromId: true })) }} placeholder="Select UOM" />
                </FormItem>
                <FormItem label="To UOM" asterisk invalid={Boolean(err('toId'))} errorMessage={err('toId')}>
                    <Select<Opt> options={uomOpts} value={uomOpts.find((o) => o.value === toId)} onChange={(opt) => { setToId(opt?.value ?? ''); setTouched((t) => ({ ...t, toId: true })) }} placeholder="Select UOM" />
                </FormItem>
                <FormItem label="Factor" asterisk invalid={Boolean(err('factor'))} errorMessage={err('factor')}>
                    <Input type="number" value={factor} onChange={(e) => { setFactor(e.target.value); setTouched((t) => ({ ...t, factor: true })) }} placeholder="1" />
                </FormItem>
                <FormItem label="Material (optional)">
                    <Select
                        isClearable
                        isSearchable
                        placeholder="Leave empty for global conversion…"
                        options={materialOpts}
                        value={materialOpts.find((o) => o.value === materialId) ?? null}
                        onChange={(opt: any) => setMaterialId(opt?.value ?? '')}
                    />
                </FormItem>
            </FormDialog>

            <ConfirmDialog isOpen={Boolean(deleting)} type="danger" title="Delete conversion?" confirmText="Delete" onRequestClose={() => setDeleting(null)} onCancel={() => setDeleting(null)} onConfirm={handleDelete}>
                <p>Are you sure?</p>
            </ConfirmDialog>
            <ConfirmDialog isOpen={bulkDeleteOpen} type="danger" title={`Delete ${selectedRows.size} conversion(s)?`} confirmText={`Delete ${selectedRows.size}`} onRequestClose={() => setBulkDeleteOpen(false)} onCancel={() => setBulkDeleteOpen(false)} onConfirm={handleBulkDelete} confirmButtonProps={{ loading: bulkDeleting, customColorClass: () => 'bg-red-500 hover:bg-red-500/90 text-white' }}>
                <p>Are you sure you want to delete <span className="font-semibold">{selectedRows.size}</span> selected conversion{selectedRows.size > 1 ? 's' : ''}?</p>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default UomConversionsPage
