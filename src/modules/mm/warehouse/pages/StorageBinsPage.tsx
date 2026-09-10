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
import Select from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
import Dropdown from '@/components/ui/Dropdown'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineViewBoards, HiOutlineSearch } from 'react-icons/hi'
import { storageBinService } from '../services/storageBinService'
import { storageSectionService } from '../services/storageSectionService'
import UomCodeSelect from '@/modules/mm/shared/UomCodeSelect'
import { useUoms } from '@/modules/mm/shared/useUoms'
import type { StorageBin, StorageSection } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { filterTableRows } from '@/modules/mm/shared/clientTableFilter'

const ROUTE = '/modules/mm/warehouse-management/storage-bins'

type FilterOption = { value: string; label: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(<Notification type={type} title={title} closable duration={3500}>{msg}</Notification>, { placement: 'top-end' })
}

const StorageBinsPage = () => {
    const breadcrumbs = buildErpBreadcrumbs(ROUTE)
    const { uoms } = useUoms()
    const [search, setSearch] = useState('')
    const [items, setItems] = useState<StorageBin[]>([])
    const [sections, setSections] = useState<StorageSection[]>([])
    const [loading, setLoading] = useState(true)
    const [formOpen, setFormOpen] = useState(false)
    const [editing, setEditing] = useState<StorageBin | null>(null)
    const [deleting, setDeleting] = useState<StorageBin | null>(null)
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
    const [bulkDeleting, setBulkDeleting] = useState(false)

    const [formData, setFormData] = useState({
        code: '', storageSectionId: '', barcode: '',
        capacityQuantity: 0, capacityWeight: 0, capacityVolume: 0,
        weightUom: '', volumeUom: '',
        pickingAllowed: true, putawayAllowed: true,
    })

    const sectionOptions = useMemo<FilterOption[]>(
        () => sections.map((s) => ({
            value: s.id,
            label: `${s.code} — ${s.name}${s.storageType?.warehouse ? ` (${s.storageType.warehouse.name})` : ''}`,
        })),
        [sections],
    )

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await storageBinService.list()
            setItems(Array.isArray(res) ? res : (res?.data ?? []))
        } catch { /* ignore */ }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { load() }, [load])

    useEffect(() => {
        storageSectionService.list().then((r) => {
            setSections(Array.isArray(r) ? r : ((r as any)?.data ?? []))
        }).catch(() => {})
    }, [])

    const openCreate = () => {
        setEditing(null)
        setFormData({
            code: '', storageSectionId: sections[0]?.id ?? '', barcode: '',
            capacityQuantity: 0, capacityWeight: 0, capacityVolume: 0,
            weightUom: 'KG', volumeUom: 'L', pickingAllowed: true, putawayAllowed: true,
        })
        setFormOpen(true)
    }

    const openEdit = (item: StorageBin) => {
        setEditing(item)
        setFormData({
            code: item.code, storageSectionId: item.storageSectionId, barcode: item.barcode || '',
            capacityQuantity: Number(item.capacityQuantity), capacityWeight: Number(item.capacityWeight), capacityVolume: Number(item.capacityVolume),
            weightUom: item.weightUom || '', volumeUom: item.volumeUom || '',
            pickingAllowed: item.pickingAllowed, putawayAllowed: item.putawayAllowed,
        })
        setFormOpen(true)
    }

    const handleSave = async () => {
        try {
            if (editing) { await storageBinService.update(editing.id, formData); pushToast('success', 'Updated', 'Bin updated.') }
            else { await storageBinService.create(formData); pushToast('success', 'Created', 'Bin created.') }
            setFormOpen(false); load()
        } catch (err: any) { pushToast('danger', 'Error', err?.response?.data?.message || 'Failed') }
    }

    const handleDelete = async () => {
        if (!deleting) return
        try { await storageBinService.remove(deleting.id); pushToast('success', 'Deleted', 'Bin removed.'); setDeleting(null); load() }
        catch (err: any) { pushToast('danger', 'Error', err?.response?.data?.message || 'Delete failed') }
    }

    const handleCheckBoxChange = useCallback((checked: boolean, row: StorageBin) => {
        setSelectedRows((prev) => { const next = new Set(prev); checked ? next.add(row.id) : next.delete(row.id); return next })
    }, [])
    const handleSelectAllChange = useCallback((checked: boolean, rows: { original: StorageBin }[]) => {
        setSelectedRows((prev) => { const next = new Set(prev); for (const r of rows) { checked ? next.add(r.original.id) : next.delete(r.original.id) } return next })
    }, [])
    const handleBulkDelete = useCallback(async () => {
        setBulkDeleting(true)
        try {
            await Promise.all(Array.from(selectedRows).map((id) => storageBinService.remove(id)))
            pushToast('success', 'Bulk delete', `${selectedRows.size} bin(s) deleted.`)
            setSelectedRows(new Set()); setBulkDeleteOpen(false); load()
        } catch { pushToast('danger', 'Error', 'Some deletions failed') }
        finally { setBulkDeleting(false) }
    }, [selectedRows, load])

    const columns = useMemo<ColumnDef<StorageBin>[]>(() => [
        { header: 'Bin Code', accessorKey: 'code', size: 140, cell: ({ row }) => <span className="font-mono text-xs font-semibold text-primary">{row.original.code}</span> },
        { header: 'Barcode', accessorKey: 'barcode', size: 160, cell: ({ row }) => row.original.barcode ? <Tag className="font-mono text-xs">{row.original.barcode}</Tag> : <span className="text-gray-400 text-xs">—</span> },
        { header: 'Section', id: 'section', size: 130, cell: ({ row }) => row.original.storageSection?.code ?? '—' },
        { header: 'Storage Type', id: 'type', size: 140, cell: ({ row }) => row.original.storageSection?.storageType?.name ?? '—' },
        { header: 'Warehouse', id: 'warehouse', size: 150, cell: ({ row }) => row.original.storageSection?.storageType?.warehouse?.name ?? '—' },
        {
            header: 'Capacity', id: 'capacity', size: 160, enableSorting: false, cell: ({ row }) => {
                const b = row.original
                return (
                    <div className="flex flex-col text-xs">
                        <span>Qty: <span className="font-semibold">{Number(b.capacityQuantity).toLocaleString()}</span></span>
                        <span>Wt: <span className="font-semibold">{Number(b.capacityWeight).toLocaleString()}</span> {b.weightUom || ''}</span>
                    </div>
                )
            },
        },
        { header: 'Pick', id: 'pick', size: 70, enableSorting: false, cell: ({ row }) => row.original.pickingAllowed ? <Tag className="bg-emerald-100 text-emerald-700 text-xs">Yes</Tag> : <span className="text-gray-400 text-xs">No</span> },
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
            <PageHeader title="Storage Bins" description="Manage individual storage bin locations and their capacity." actions={<Button variant="solid" size="sm" icon={<HiOutlinePlus />} onClick={openCreate}>Add bin</Button>} />
            <AdaptiveCard>
                <div className="mb-4 max-w-md">
                    <Input
                        prefix={<HiOutlineSearch className="text-lg" />}
                        placeholder="Search code, barcode, section…"
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
                <DataTable<StorageBin> columns={columns} data={filteredItems} compact loading={loading} noData={!loading && filteredItems.length === 0} selectable checkboxChecked={(row) => selectedRows.has(row.id)} onCheckBoxChange={handleCheckBoxChange} onIndeterminateCheckBoxChange={(checked, rows) => handleSelectAllChange(checked, rows as any)} />
            </AdaptiveCard>

            <FormDialog
                isOpen={formOpen}
                onClose={() => setFormOpen(false)}
                width={560}
                title={editing ? 'Edit Bin' : 'New Bin'}
                icon={<HiOutlineViewBoards />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setFormOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" onClick={handleSave} disabled={!formData.code || !formData.storageSectionId}>{editing ? 'Save' : 'Create'}</Button>
                    </>
                }
            >
                <div className="grid grid-cols-2 gap-3">
                    <FormItem label="Bin code" asterisk><Input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} placeholder="e.g. A01-01-001" /></FormItem>
                    <FormItem label="Barcode"><Input value={formData.barcode} onChange={(e) => setFormData({ ...formData, barcode: e.target.value })} placeholder="Auto-generated if empty" /></FormItem>
                </div>
                <FormItem label="Storage Section" asterisk>
                    {editing ? (
                        <Input
                            value={editing.storageSection ? `${editing.storageSection.code} — ${editing.storageSection.name ?? editing.storageSection.code}` : editing.storageSectionId}
                            disabled
                            className="!bg-gray-100 dark:!bg-gray-700/50"
                        />
                    ) : sectionOptions.length === 0 ? (
                        <p className="text-sm text-amber-600 dark:text-amber-400">No storage sections found. Create a section first.</p>
                    ) : (
                        <Select<FilterOption>
                            placeholder="Select storage section"
                            options={sectionOptions}
                            value={sectionOptions.find((o) => o.value === formData.storageSectionId) ?? null}
                            onChange={(opt) => setFormData({ ...formData, storageSectionId: opt?.value ?? '' })}
                        />
                    )}
                </FormItem>
                <div className="grid grid-cols-3 gap-3">
                    <FormItem label="Capacity (qty)"><Input type="number" value={String(formData.capacityQuantity)} onChange={(e) => setFormData({ ...formData, capacityQuantity: Number(e.target.value) })} /></FormItem>
                    <FormItem label="Capacity (weight)"><Input type="number" value={String(formData.capacityWeight)} onChange={(e) => setFormData({ ...formData, capacityWeight: Number(e.target.value) })} /></FormItem>
                    <FormItem label="Capacity (volume)"><Input type="number" value={String(formData.capacityVolume)} onChange={(e) => setFormData({ ...formData, capacityVolume: Number(e.target.value) })} /></FormItem>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <FormItem label="Weight UOM">
                        <UomCodeSelect
                            category="weight"
                            uoms={uoms}
                            value={formData.weightUom}
                            onChange={(code) => setFormData({ ...formData, weightUom: code })}
                            placeholder="Select weight UOM"
                        />
                    </FormItem>
                    <FormItem label="Volume UOM">
                        <UomCodeSelect
                            category="volume"
                            uoms={uoms}
                            value={formData.volumeUom}
                            onChange={(code) => setFormData({ ...formData, volumeUom: code })}
                            placeholder="Select volume UOM"
                        />
                    </FormItem>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-2">
                    <label className="flex items-center gap-2 text-sm"><Switcher checked={formData.pickingAllowed} onChange={(v) => setFormData({ ...formData, pickingAllowed: v })} /> Picking allowed</label>
                    <label className="flex items-center gap-2 text-sm"><Switcher checked={formData.putawayAllowed} onChange={(v) => setFormData({ ...formData, putawayAllowed: v })} /> Putaway allowed</label>
                </div>
            </FormDialog>

            <ConfirmDialog isOpen={Boolean(deleting)} type="danger" title="Delete bin?" confirmText="Delete" onRequestClose={() => setDeleting(null)} onCancel={() => setDeleting(null)} onConfirm={handleDelete}>
                <p>Are you sure you want to delete bin <span className="font-semibold">{deleting?.code}</span>?</p>
            </ConfirmDialog>
            <ConfirmDialog isOpen={bulkDeleteOpen} type="danger" title={`Delete ${selectedRows.size} bin(s)?`} confirmText={`Delete ${selectedRows.size}`} onRequestClose={() => setBulkDeleteOpen(false)} onCancel={() => setBulkDeleteOpen(false)} onConfirm={handleBulkDelete} confirmButtonProps={{ loading: bulkDeleting, customColorClass: () => 'bg-red-500 hover:bg-red-500/90 text-white' }}>
                <p>Delete <span className="font-semibold">{selectedRows.size}</span> selected bin{selectedRows.size > 1 ? 's' : ''}?</p>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default StorageBinsPage
