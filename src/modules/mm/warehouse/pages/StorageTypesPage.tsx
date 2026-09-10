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
import Tag from '@/components/ui/Tag'
import Dropdown from '@/components/ui/Dropdown'
import Switcher from '@/components/ui/Switcher'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import Select from '@/components/ui/Select'
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineCollection, HiOutlineSearch } from 'react-icons/hi'
import { storageTypeService } from '../services/storageTypeService'
import { warehouseService } from '../services/warehouseService'
import type { StorageType, Warehouse } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { filterTableRows } from '@/modules/mm/shared/clientTableFilter'

const ROUTE = '/modules/mm/warehouse-management/storage-types'

type FilterOption = { value: string; label: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(<Notification type={type} title={title} closable duration={3500}>{msg}</Notification>, { placement: 'top-end' })
}

const StorageTypesPage = () => {
    const breadcrumbs = buildErpBreadcrumbs(ROUTE)
    const [search, setSearch] = useState('')
    const [items, setItems] = useState<StorageType[]>([])
    const [warehouses, setWarehouses] = useState<Warehouse[]>([])
    const [loading, setLoading] = useState(true)
    const [formOpen, setFormOpen] = useState(false)
    const [editing, setEditing] = useState<StorageType | null>(null)
    const [deleting, setDeleting] = useState<StorageType | null>(null)
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
    const [bulkDeleting, setBulkDeleting] = useState(false)

    const [formData, setFormData] = useState({
        code: '', name: '', description: '', warehouseId: '',
        temperatureControlled: false, hazardous: false, qualityControlled: false,
        pickingAllowed: true, putawayAllowed: true,
        receivingAllowed: false, shippingAllowed: false,
    })

    const warehouseOptions = useMemo<FilterOption[]>(
        () => warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })),
        [warehouses],
    )

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await storageTypeService.list()
            setItems(Array.isArray(res) ? res : (res?.data ?? []))
        } catch { /* ignore */ }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { load() }, [load])

    useEffect(() => {
        warehouseService.list({ limit: 200, status: 'ACTIVE' }).then((r) => {
            setWarehouses(Array.isArray(r) ? r : (r?.data ?? []))
        }).catch(() => {})
    }, [])

    const openCreate = () => {
        setEditing(null)
        setFormData({
            code: '', name: '', description: '', warehouseId: warehouses[0]?.id ?? '',
            temperatureControlled: false, hazardous: false, qualityControlled: false,
            pickingAllowed: true, putawayAllowed: true,
            receivingAllowed: false, shippingAllowed: false,
        })
        setFormOpen(true)
    }

    const openEdit = (item: StorageType) => {
        setEditing(item)
        setFormData({
            code: item.code, name: item.name, description: item.description ?? '', warehouseId: item.warehouseId,
            temperatureControlled: item.temperatureControlled, hazardous: item.hazardous,
            qualityControlled: item.qualityControlled ?? false,
            pickingAllowed: item.pickingAllowed, putawayAllowed: item.putawayAllowed,
            receivingAllowed: item.receivingAllowed ?? false, shippingAllowed: item.shippingAllowed ?? false,
        })
        setFormOpen(true)
    }

    const handleSave = async () => {
        try {
            if (editing) { await storageTypeService.update(editing.id, formData); pushToast('success', 'Updated', 'Storage type updated.') }
            else { await storageTypeService.create(formData); pushToast('success', 'Created', 'Storage type created.') }
            setFormOpen(false); load()
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'Failed'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : msg)
        }
    }

    const handleDelete = async () => {
        if (!deleting) return
        try { await storageTypeService.remove(deleting.id); pushToast('success', 'Deleted', 'Storage type removed.'); setDeleting(null); load() }
        catch (err: any) { pushToast('danger', 'Error', err?.response?.data?.message || 'Delete failed') }
    }

    const handleCheckBoxChange = useCallback((checked: boolean, row: StorageType) => {
        setSelectedRows((prev) => { const next = new Set(prev); checked ? next.add(row.id) : next.delete(row.id); return next })
    }, [])
    const handleSelectAllChange = useCallback((checked: boolean, rows: { original: StorageType }[]) => {
        setSelectedRows((prev) => { const next = new Set(prev); for (const r of rows) { checked ? next.add(r.original.id) : next.delete(r.original.id) } return next })
    }, [])
    const handleBulkDelete = useCallback(async () => {
        setBulkDeleting(true)
        try {
            await Promise.all(Array.from(selectedRows).map((id) => storageTypeService.remove(id)))
            pushToast('success', 'Bulk delete', `${selectedRows.size} item(s) deleted.`)
            setSelectedRows(new Set()); setBulkDeleteOpen(false); load()
        } catch { pushToast('danger', 'Error', 'Some deletions failed') }
        finally { setBulkDeleting(false) }
    }, [selectedRows, load])

    const columns = useMemo<ColumnDef<StorageType>[]>(() => [
        { header: 'Code', accessorKey: 'code', size: 140, cell: ({ row }) => <span className="font-mono text-xs font-semibold">{row.original.code}</span> },
        { header: 'Name', accessorKey: 'name', size: 180 },
        { header: 'Description', id: 'desc', size: 180, cell: ({ row }) => row.original.description || <span className="text-gray-400 text-xs">—</span> },
        { header: 'Warehouse', id: 'warehouse', size: 160, cell: ({ row }) => row.original.warehouse?.name ?? '—' },
        { header: 'Temp', id: 'temp', size: 70, enableSorting: false, cell: ({ row }) => row.original.temperatureControlled ? <Tag className="bg-blue-100 text-blue-700 text-xs">Yes</Tag> : <span className="text-gray-400 text-xs">No</span> },
        { header: 'QC', id: 'qc', size: 70, enableSorting: false, cell: ({ row }) => row.original.qualityControlled ? <Tag className="bg-violet-100 text-violet-700 text-xs">Yes</Tag> : <span className="text-gray-400 text-xs">No</span> },
        { header: 'Haz', id: 'haz', size: 70, enableSorting: false, cell: ({ row }) => row.original.hazardous ? <Tag className="bg-amber-100 text-amber-700 text-xs">Yes</Tag> : <span className="text-gray-400 text-xs">No</span> },
        { header: 'Recv', id: 'recv', size: 70, enableSorting: false, cell: ({ row }) => row.original.receivingAllowed ? <Tag className="bg-emerald-100 text-emerald-700 text-xs">Yes</Tag> : <span className="text-gray-400 text-xs">No</span> },
        { header: 'Ship', id: 'ship', size: 70, enableSorting: false, cell: ({ row }) => row.original.shippingAllowed ? <Tag className="bg-emerald-100 text-emerald-700 text-xs">Yes</Tag> : <span className="text-gray-400 text-xs">No</span> },
        { header: 'Status', accessorKey: 'status', size: 100, cell: ({ row }) => <StatusBadge tone={row.original.status === 'ACTIVE' ? 'success' : 'warning'}>{row.original.status}</StatusBadge> },
        {
            id: 'actions', header: '', size: 56, enableSorting: false, cell: ({ row }) => (
                <Dropdown renderTitle={<EllipsisButton />} placement="bottom-end">
                    <Dropdown.Item eventKey="edit" onClick={() => openEdit(row.original)}><HiOutlinePencil className="text-base" /><span>Edit</span></Dropdown.Item>
                    <Dropdown.Item eventKey="delete" onClick={() => setDeleting(row.original)}><HiOutlineTrash className="text-base text-red-500" /><span className="text-red-500">Delete</span></Dropdown.Item>
                </Dropdown>
            ),
        },
    ], [])

    const filteredItems = useMemo(
        () => filterTableRows(items, search),
        [items, search],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbs} />
            <PageHeader title="Storage Types" description="Define storage type classifications within warehouses." actions={<Button variant="solid" size="sm" icon={<HiOutlinePlus />} onClick={openCreate}>Add storage type</Button>} />
            <AdaptiveCard>
                <div className="mb-4 max-w-md">
                    <Input
                        prefix={<HiOutlineSearch className="text-lg" />}
                        placeholder="Search code, name, warehouse…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                {selectedRows.size > 0 && (
                    <div className="mb-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 dark:border-red-500/30 dark:bg-red-500/10">
                        <span className="text-sm font-medium text-red-700 dark:text-red-300">{selectedRows.size} item{selectedRows.size > 1 ? 's' : ''} selected</span>
                        <div className="ml-auto flex items-center gap-2">
                            <Button size="xs" onClick={() => setSelectedRows(new Set())}>Clear</Button>
                            <Button size="xs" variant="solid" customColorClass={() => 'bg-red-500 hover:bg-red-600 text-white'} icon={<HiOutlineTrash />} onClick={() => setBulkDeleteOpen(true)}>Delete selected</Button>
                        </div>
                    </div>
                )}
                <DataTable<StorageType> columns={columns} data={filteredItems} compact loading={loading} noData={!loading && filteredItems.length === 0} selectable checkboxChecked={(row) => selectedRows.has(row.id)} onCheckBoxChange={handleCheckBoxChange} onIndeterminateCheckBoxChange={(checked, rows) => handleSelectAllChange(checked, rows as any)} />
            </AdaptiveCard>

            <FormDialog
                isOpen={formOpen}
                onClose={() => setFormOpen(false)}
                size="md"
                title={editing ? 'Edit Storage Type' : 'New Storage Type'}
                icon={<HiOutlineCollection />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setFormOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" onClick={handleSave} disabled={!formData.code || !formData.name || !formData.warehouseId}>{editing ? 'Save' : 'Create'}</Button>
                    </>
                }
            >
                <FormItem label="Code" asterisk><Input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} placeholder="e.g. HIGH_RACK" /></FormItem>
                <FormItem label="Name" asterisk><Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Storage type name" /></FormItem>
                <FormItem label="Description"><Input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Brief description" /></FormItem>
                <FormItem label="Warehouse" asterisk>
                    {editing ? (
                        <Input value={editing.warehouse ? `${editing.warehouse.code} — ${editing.warehouse.name}` : editing.warehouseId} disabled className="!bg-gray-100 dark:!bg-gray-700/50" />
                    ) : warehouseOptions.length === 0 ? (
                        <p className="text-sm text-amber-600 dark:text-amber-400">No warehouses found. Create a warehouse first.</p>
                    ) : (
                        <Select<FilterOption>
                            placeholder="Select warehouse"
                            options={warehouseOptions}
                            value={warehouseOptions.find((o) => o.value === formData.warehouseId) ?? null}
                            onChange={(opt) => setFormData({ ...formData, warehouseId: opt?.value ?? '' })}
                        />
                    )}
                </FormItem>
                <div className="grid grid-cols-2 gap-4 mt-2">
                    <label className="flex items-center gap-2 text-sm"><Switcher checked={formData.temperatureControlled} onChange={(v) => setFormData({ ...formData, temperatureControlled: v })} /> Temperature controlled</label>
                    <label className="flex items-center gap-2 text-sm"><Switcher checked={formData.hazardous} onChange={(v) => setFormData({ ...formData, hazardous: v })} /> Hazardous</label>
                    <label className="flex items-center gap-2 text-sm"><Switcher checked={formData.qualityControlled} onChange={(v) => setFormData({ ...formData, qualityControlled: v })} /> Quality controlled</label>
                    <label className="flex items-center gap-2 text-sm"><Switcher checked={formData.pickingAllowed} onChange={(v) => setFormData({ ...formData, pickingAllowed: v })} /> Picking allowed</label>
                    <label className="flex items-center gap-2 text-sm"><Switcher checked={formData.putawayAllowed} onChange={(v) => setFormData({ ...formData, putawayAllowed: v })} /> Putaway allowed</label>
                    <label className="flex items-center gap-2 text-sm"><Switcher checked={formData.receivingAllowed} onChange={(v) => setFormData({ ...formData, receivingAllowed: v })} /> Receiving allowed</label>
                    <label className="flex items-center gap-2 text-sm"><Switcher checked={formData.shippingAllowed} onChange={(v) => setFormData({ ...formData, shippingAllowed: v })} /> Shipping allowed</label>
                </div>
            </FormDialog>

            <ConfirmDialog isOpen={Boolean(deleting)} type="danger" title="Delete storage type?" confirmText="Delete" onRequestClose={() => setDeleting(null)} onCancel={() => setDeleting(null)} onConfirm={handleDelete}>
                <p>Are you sure you want to delete <span className="font-semibold">{deleting?.code} — {deleting?.name}</span>?</p>
            </ConfirmDialog>
            <ConfirmDialog isOpen={bulkDeleteOpen} type="danger" title={`Delete ${selectedRows.size} storage type(s)?`} confirmText={`Delete ${selectedRows.size}`} onRequestClose={() => setBulkDeleteOpen(false)} onCancel={() => setBulkDeleteOpen(false)} onConfirm={handleBulkDelete} confirmButtonProps={{ loading: bulkDeleting, customColorClass: () => 'bg-red-500 hover:bg-red-500/90 text-white' }}>
                <p>Delete <span className="font-semibold">{selectedRows.size}</span> selected item{selectedRows.size > 1 ? 's' : ''}?</p>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default StorageTypesPage
