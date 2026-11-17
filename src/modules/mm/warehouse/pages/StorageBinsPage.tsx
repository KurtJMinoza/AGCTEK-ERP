'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import { type ColumnDef } from '@/components/shared/DataTable'
import WarehouseResponsiveTable from '../components/WarehouseResponsiveTable'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import FormDialog from '@/components/shared/FormDialog'
import EllipsisButton from '@/components/shared/EllipsisButton'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
import Dropdown from '@/components/ui/Dropdown'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineViewBoards, HiOutlineSearch } from 'react-icons/hi'
import { storageBinService } from '../services/storageBinService'
import { storageSectionService } from '../services/storageSectionService'
import { storageShelfService } from '../services/storageShelfService'
import UomCodeSelect from '@/modules/mm/shared/UomCodeSelect'
import { useUoms } from '@/modules/mm/shared/useUoms'
import type { StorageBin, StorageShelf, StorageSection } from '../types'
import {
    warehouseParentBreadcrumbs,
    warehouseStorageStatusTone,
} from '../utils/warehousePageUi'
import { filterTableRows } from '@/modules/mm/shared/clientTableFilter'
import {
    WmBinCapacityCell,
    WmBinLocationCell,
    WmBinOperationsCell,
    WmStorageBinCell,
    WmStorageStatusCell,
} from '../components/StorageTableCells'

const ROUTE = '/modules/mm/warehouse-management/storage-bins'

type FilterOption = { value: string; label: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(<Notification type={type} title={title} closable duration={3500}>{msg}</Notification>, { placement: 'top-end' })
}

const StorageBinsPage = () => {
    const router = useRouter()
    const searchParams = useSearchParams()
    const handledEditQuery = useRef(false)
    const parentBreadcrumbs = useMemo(() => warehouseParentBreadcrumbs(ROUTE), [])
    const { uoms } = useUoms()
    const [search, setSearch] = useState('')
    const [items, setItems] = useState<StorageBin[]>([])
    const [sections, setSections] = useState<StorageSection[]>([])
    const [shelves, setShelves] = useState<StorageShelf[]>([])
    const [loading, setLoading] = useState(true)
    const [formOpen, setFormOpen] = useState(false)
    const [editing, setEditing] = useState<StorageBin | null>(null)
    const [deleting, setDeleting] = useState<StorageBin | null>(null)
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
    const [bulkDeleting, setBulkDeleting] = useState(false)

    const [formData, setFormData] = useState({
        code: '', storageSectionId: '', shelfId: '', barcode: '',
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

    const shelfOptions = useMemo<FilterOption[]>(
        () => [
            { value: '', label: 'No shelf' },
            ...shelves
                .filter((s) => s.storageSectionId === formData.storageSectionId)
                .map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` })),
        ],
        [shelves, formData.storageSectionId],
    )

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await storageBinService.listWithOccupancy()
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

    useEffect(() => {
        storageShelfService.list().then((r) => {
            setShelves(Array.isArray(r) ? r : ((r as any)?.data ?? []))
        }).catch(() => {})
    }, [])

    const openCreate = useCallback(() => {
        setEditing(null)
        setFormData({
            code: '', storageSectionId: sections[0]?.id ?? '', shelfId: '', barcode: '',
            capacityQuantity: 0, capacityWeight: 0, capacityVolume: 0,
            weightUom: 'KG', volumeUom: 'L', pickingAllowed: true, putawayAllowed: true,
        })
        setFormOpen(true)
    }, [sections])

    const openEdit = useCallback((item: StorageBin) => {
        setEditing(item)
        setFormData({
            code: item.code, storageSectionId: item.storageSectionId, shelfId: item.shelfId ?? '', barcode: item.barcode || '',
            capacityQuantity: Number(item.capacityQuantity), capacityWeight: Number(item.capacityWeight), capacityVolume: Number(item.capacityVolume),
            weightUom: item.weightUom || '', volumeUom: item.volumeUom || '',
            pickingAllowed: item.pickingAllowed, putawayAllowed: item.putawayAllowed,
        })
        setFormOpen(true)
    }, [])

    useEffect(() => {
        const editId = searchParams.get('edit')
        if (!editId || handledEditQuery.current || loading) return

        const openFromQuery = async () => {
            let bin = items.find((b) => b.id === editId)
            if (!bin) {
                try {
                    bin = await storageBinService.get(editId)
                } catch {
                    return
                }
            }
            handledEditQuery.current = true
            openEdit(bin)
            router.replace(ROUTE, { scroll: false })
        }

        void openFromQuery()
    }, [searchParams, loading, items, openEdit, router])

    const handleSave = async () => {
        const payload = { ...formData, shelfId: formData.shelfId || null }
        try {
            if (editing) { await storageBinService.update(editing.id, payload); pushToast('success', 'Updated', 'Bin updated.') }
            else { await storageBinService.create(payload); pushToast('success', 'Created', 'Bin created.') }
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

    const columns = useMemo<ColumnDef<StorageBin>[]>(
        () => [
            {
                header: 'Bin',
                accessorKey: 'code',
                size: 160,
                minSize: 140,
                cell: ({ row }) => (
                    <WmStorageBinCell
                        code={row.original.code}
                        barcode={row.original.barcode}
                    />
                ),
            },
            {
                header: 'Location',
                id: 'location',
                size: 200,
                minSize: 160,
                cell: ({ row }) => {
                    const sec = row.original.storageSection
                    return (
                        <WmBinLocationCell
                            sectionCode={sec?.code}
                            sectionName={sec?.name}
                            shelfCode={row.original.shelf?.code}
                            typeName={sec?.storageType?.name}
                            warehouseName={sec?.storageType?.warehouse?.name}
                        />
                    )
                },
            },
            {
                header: 'Capacity',
                id: 'capacity',
                size: 130,
                minSize: 110,
                meta: { className: 'hidden md:table-cell' },
                enableSorting: false,
                cell: ({ row }) => (
                    <WmBinCapacityCell
                        capacityQuantity={Number(row.original.capacityQuantity)}
                        capacityWeight={Number(row.original.capacityWeight)}
                        weightUom={row.original.weightUom}
                        currentQuantity={row.original.currentQuantity}
                        utilizationPct={row.original.utilizationPct}
                    />
                ),
            },
            {
                header: 'Operations',
                id: 'ops',
                size: 140,
                minSize: 120,
                meta: { className: 'hidden lg:table-cell' },
                enableSorting: false,
                cell: ({ row }) => (
                    <WmBinOperationsCell
                        pickingAllowed={row.original.pickingAllowed}
                        putawayAllowed={row.original.putawayAllowed}
                    />
                ),
            },
            {
                header: 'Status',
                accessorKey: 'status',
                size: 100,
                minSize: 88,
                cell: ({ row }) => (
                    <WmStorageStatusCell status={row.original.status} />
                ),
            },
            {
                id: 'actions',
                header: '',
                size: 52,
                minSize: 48,
                enableSorting: false,
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
                            onClick={() => setDeleting(row.original)}
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

    const binMobile = useMemo(
        () => ({
            title: (item: StorageBin) => item.code,
            subtitle: (item: StorageBin) => item.barcode?.trim() || item.storageSection?.name || undefined,
            status: (item: StorageBin) => ({
                text: item.status.replace(/_/g, ' '),
                tone: warehouseStorageStatusTone(item.status),
            }),
            onPress: (item: StorageBin) => openEdit(item),
            fields: [
                {
                    label: 'Section',
                    value: (item: StorageBin) =>
                        item.storageSection
                            ? `${item.storageSection.code} — ${item.storageSection.name}`
                            : '—',
                },
                {
                    label: 'Shelf',
                    value: (item: StorageBin) => item.shelf?.code ?? '—',
                },
                {
                    label: 'Warehouse',
                    value: (item: StorageBin) =>
                        item.storageSection?.storageType?.warehouse?.name ?? '—',
                },
                {
                    label: 'Utilization',
                    value: (item: StorageBin) => {
                        const pct = item.utilizationPct
                        if (pct != null && Number.isFinite(Number(pct))) {
                            return `${Number(pct).toFixed(0)}%`
                        }
                        const cur = item.currentQuantity
                        const cap = Number(item.capacityQuantity)
                        if (cur != null && cap > 0) {
                            return `${Number(cur).toLocaleString()} / ${cap.toLocaleString()}`
                        }
                        return '—'
                    },
                },
                {
                    label: 'Operations',
                    value: (item: StorageBin) => {
                        const flags = [
                            item.pickingAllowed ? 'Pick' : null,
                            item.putawayAllowed ? 'Putaway' : null,
                        ].filter(Boolean)
                        return flags.length ? flags.join(', ') : '—'
                    },
                },
            ],
        }),
        [openEdit],
    )

    const filteredItems = useMemo(
        () => filterTableRows(items, search),
        [items, search],
    )

    return (
        <PageContainer>
            <PageHeader
                breadcrumbs={parentBreadcrumbs}
                title="Storage Bins"
                description="Manage individual storage bin locations and their capacity."
                actions={
                    <Button variant="solid" size="sm" icon={<HiOutlinePlus />} onClick={openCreate}>
                        Add bin
                    </Button>
                }
            />
            <AdaptiveCard>
                <div className="mb-4 grid grid-cols-1 gap-3 sm:max-w-xl">
                    <Input
                        prefix={<HiOutlineSearch className="text-lg" />}
                        placeholder="Search code, barcode, section, warehouse…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                {!loading && filteredItems.length > 0 ? (
                    <p className="mb-3 text-xs text-gray-500">
                        {filteredItems.length} bin
                        {filteredItems.length === 1 ? '' : 's'} shown
                    </p>
                ) : null}
                {selectedRows.size > 0 && (
                    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 dark:border-red-500/30 dark:bg-red-500/10 sm:flex-row sm:items-center">
                        <span className="text-sm font-medium text-red-700 dark:text-red-300">{selectedRows.size} item{selectedRows.size > 1 ? 's' : ''} selected</span>
                        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                            <Button size="xs" onClick={() => setSelectedRows(new Set())}>Clear</Button>
                            <Button size="xs" variant="solid" customColorClass={() => 'bg-red-500 hover:bg-red-600 text-white'} icon={<HiOutlineTrash />} onClick={() => setBulkDeleteOpen(true)}>Delete selected</Button>
                        </div>
                    </div>
                )}
                <WarehouseResponsiveTable<StorageBin>
                    columns={columns}
                    data={filteredItems}
                    compact
                    loading={loading}
                    getRowId={(row) => row.id}
                    noData={!loading && filteredItems.length === 0}
                    selectable
                    checkboxChecked={(row) => selectedRows.has(row.id)}
                    onCheckBoxChange={handleCheckBoxChange}
                    onIndeterminateCheckBoxChange={(checked, rows) =>
                        handleSelectAllChange(checked, rows as any)
                    }
                    tableMinWidthClass="min-w-[720px]"
                    mobile={binMobile}
                    instanceId="storage-bins"
                />
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
                            onChange={(opt) => setFormData({ ...formData, storageSectionId: opt?.value ?? '', shelfId: '' })}
                        />
                    )}
                </FormItem>
                <FormItem label="Shelf (optional)">
                    <Select<FilterOption>
                        placeholder="Select shelf (optional)"
                        options={shelfOptions}
                        value={shelfOptions.find((o) => o.value === formData.shelfId) ?? null}
                        onChange={(opt) => setFormData({ ...formData, shelfId: opt?.value ?? '' })}
                    />
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
