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
import Dropdown from '@/components/ui/Dropdown'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineViewGrid, HiOutlineSearch } from 'react-icons/hi'
import { storageSectionService } from '../services/storageSectionService'
import { storageTypeService } from '../services/storageTypeService'
import type { StorageSection, StorageType } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { filterTableRows } from '@/modules/mm/shared/clientTableFilter'

const ROUTE = '/modules/mm/warehouse-management/storage-sections'

type FilterOption = { value: string; label: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(<Notification type={type} title={title} closable duration={3500}>{msg}</Notification>, { placement: 'top-end' })
}

const StorageSectionsPage = () => {
    const breadcrumbs = buildErpBreadcrumbs(ROUTE)
    const [search, setSearch] = useState('')
    const [items, setItems] = useState<StorageSection[]>([])
    const [storageTypes, setStorageTypes] = useState<StorageType[]>([])
    const [loading, setLoading] = useState(true)
    const [formOpen, setFormOpen] = useState(false)
    const [editing, setEditing] = useState<StorageSection | null>(null)
    const [deleting, setDeleting] = useState<StorageSection | null>(null)
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
    const [bulkDeleting, setBulkDeleting] = useState(false)
    const [formData, setFormData] = useState({ code: '', name: '', description: '', storageTypeId: '' })

    const storageTypeOptions = useMemo<FilterOption[]>(
        () => storageTypes.map((t) => ({
            value: t.id,
            label: `${t.code} — ${t.name}${t.warehouse ? ` (${t.warehouse.name})` : ''}`,
        })),
        [storageTypes],
    )

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await storageSectionService.list()
            setItems(Array.isArray(res) ? res : (res?.data ?? []))
        } catch { /* ignore */ }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { load() }, [load])

    useEffect(() => {
        storageTypeService.list().then((r) => {
            setStorageTypes(Array.isArray(r) ? r : ((r as any)?.data ?? []))
        }).catch(() => {})
    }, [])

    const openCreate = () => {
        setEditing(null)
        setFormData({ code: '', name: '', description: '', storageTypeId: storageTypes[0]?.id ?? '' })
        setFormOpen(true)
    }

    const openEdit = (item: StorageSection) => {
        setEditing(item)
        setFormData({
            code: item.code,
            name: item.name,
            description: item.description ?? '',
            storageTypeId: item.storageTypeId,
        })
        setFormOpen(true)
    }

    const handleSave = async () => {
        try {
            if (editing) { await storageSectionService.update(editing.id, formData); pushToast('success', 'Updated', 'Section updated.') }
            else { await storageSectionService.create(formData); pushToast('success', 'Created', 'Section created.') }
            setFormOpen(false); load()
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'Failed'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : msg)
        }
    }

    const handleDelete = async () => {
        if (!deleting) return
        try { await storageSectionService.remove(deleting.id); pushToast('success', 'Deleted', 'Section removed.'); setDeleting(null); load() }
        catch (err: any) { pushToast('danger', 'Error', err?.response?.data?.message || 'Delete failed') }
    }

    const handleCheckBoxChange = useCallback((checked: boolean, row: StorageSection) => {
        setSelectedRows((prev) => { const next = new Set(prev); checked ? next.add(row.id) : next.delete(row.id); return next })
    }, [])
    const handleSelectAllChange = useCallback((checked: boolean, rows: { original: StorageSection }[]) => {
        setSelectedRows((prev) => { const next = new Set(prev); for (const r of rows) { checked ? next.add(r.original.id) : next.delete(r.original.id) } return next })
    }, [])
    const handleBulkDelete = useCallback(async () => {
        setBulkDeleting(true)
        try {
            await Promise.all(Array.from(selectedRows).map((id) => storageSectionService.remove(id)))
            pushToast('success', 'Bulk delete', `${selectedRows.size} section(s) deleted.`)
            setSelectedRows(new Set()); setBulkDeleteOpen(false); load()
        } catch { pushToast('danger', 'Error', 'Some deletions failed') }
        finally { setBulkDeleting(false) }
    }, [selectedRows, load])

    const columns = useMemo<ColumnDef<StorageSection>[]>(() => [
        { header: 'Code', accessorKey: 'code', size: 140, cell: ({ row }) => <span className="font-mono text-xs font-semibold">{row.original.code}</span> },
        { header: 'Name', accessorKey: 'name', size: 180 },
        { header: 'Description', id: 'desc', size: 180, cell: ({ row }) => row.original.description || <span className="text-gray-400 text-xs">—</span> },
        { header: 'Storage Type', id: 'storageType', size: 180, cell: ({ row }) => row.original.storageType ? `${row.original.storageType.code} — ${row.original.storageType.name}` : '—' },
        { header: 'Warehouse', id: 'warehouse', size: 160, cell: ({ row }) => row.original.storageType?.warehouse?.name ?? '—' },
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
            <PageHeader title="Storage Sections" description="Define sections within storage types for organizing inventory." actions={<Button variant="solid" size="sm" icon={<HiOutlinePlus />} onClick={openCreate}>Add section</Button>} />
            <AdaptiveCard>
                <div className="mb-4 max-w-md">
                    <Input
                        prefix={<HiOutlineSearch className="text-lg" />}
                        placeholder="Search code, name, type, warehouse…"
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
                <DataTable<StorageSection> columns={columns} data={filteredItems} compact loading={loading} noData={!loading && filteredItems.length === 0} selectable checkboxChecked={(row) => selectedRows.has(row.id)} onCheckBoxChange={handleCheckBoxChange} onIndeterminateCheckBoxChange={(checked, rows) => handleSelectAllChange(checked, rows as any)} />
            </AdaptiveCard>

            <FormDialog
                isOpen={formOpen}
                onClose={() => setFormOpen(false)}
                size="md"
                title={editing ? 'Edit Section' : 'New Section'}
                icon={<HiOutlineViewGrid />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setFormOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" onClick={handleSave} disabled={!formData.code || !formData.name || !formData.storageTypeId}>{editing ? 'Save' : 'Create'}</Button>
                    </>
                }
            >
                <FormItem label="Code" asterisk><Input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} placeholder="e.g. A01" /></FormItem>
                <FormItem label="Name" asterisk><Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Section name" /></FormItem>
                <FormItem label="Description"><Input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Brief description" /></FormItem>
                <FormItem label="Storage Type" asterisk>
                    {editing ? (
                        <Input
                            value={editing.storageType ? `${editing.storageType.code} — ${editing.storageType.name}` : editing.storageTypeId}
                            disabled
                            className="!bg-gray-100 dark:!bg-gray-700/50"
                        />
                    ) : storageTypeOptions.length === 0 ? (
                        <p className="text-sm text-amber-600 dark:text-amber-400">No storage types found. Create a storage type first.</p>
                    ) : (
                        <Select<FilterOption>
                            placeholder="Select storage type"
                            options={storageTypeOptions}
                            value={storageTypeOptions.find((o) => o.value === formData.storageTypeId) ?? null}
                            onChange={(opt) => setFormData({ ...formData, storageTypeId: opt?.value ?? '' })}
                        />
                    )}
                </FormItem>
            </FormDialog>

            <ConfirmDialog isOpen={Boolean(deleting)} type="danger" title="Delete section?" confirmText="Delete" onRequestClose={() => setDeleting(null)} onCancel={() => setDeleting(null)} onConfirm={handleDelete}>
                <p>Are you sure you want to delete <span className="font-semibold">{deleting?.code} — {deleting?.name}</span>?</p>
            </ConfirmDialog>
            <ConfirmDialog isOpen={bulkDeleteOpen} type="danger" title={`Delete ${selectedRows.size} section(s)?`} confirmText={`Delete ${selectedRows.size}`} onRequestClose={() => setBulkDeleteOpen(false)} onCancel={() => setBulkDeleteOpen(false)} onConfirm={handleBulkDelete} confirmButtonProps={{ loading: bulkDeleting, customColorClass: () => 'bg-red-500 hover:bg-red-500/90 text-white' }}>
                <p>Delete <span className="font-semibold">{selectedRows.size}</span> selected item{selectedRows.size > 1 ? 's' : ''}?</p>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default StorageSectionsPage
