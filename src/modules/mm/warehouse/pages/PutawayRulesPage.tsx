'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import FormDialog from '@/components/shared/FormDialog'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import StatusBadge from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
import { FormItem } from '@/components/ui/Form'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { HiOutlinePlus } from 'react-icons/hi'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { useLazyMmRefs } from '@/modules/mm/shared/useLazyMmRefs'
import { storageTypeService } from '../services/storageTypeService'
import {
    warehouseRulesService,
    type PutawayRule,
} from '../services/warehouseRulesService'

const ROUTE = '/modules/mm/warehouse-management/putaway-rules'

const STRATEGY_OPTS = [
    { value: 'CAPACITY_BASED', label: 'Capacity based' },
    { value: 'FIXED_BIN', label: 'Fixed bin' },
    { value: 'NEAREST_BIN', label: 'Nearest bin' },
    { value: 'MATERIAL_ZONE', label: 'Material zone' },
    { value: 'TEMPERATURE_ZONE', label: 'Temperature zone' },
    { value: 'FIFO_ZONE', label: 'FIFO zone' },
    { value: 'FEFO_ZONE', label: 'FEFO zone' },
]

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const PutawayRulesPage = () => {
    const breadcrumbs = buildErpBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<PutawayRule[]>([])
    const [loading, setLoading] = useState(true)
    const [open, setOpen] = useState(false)
    const [editing, setEditing] = useState<PutawayRule | null>(null)
    const [deleteId, setDeleteId] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const { ensure: ensureRefs, warehouses } = useLazyMmRefs()
    const [storageTypes, setStorageTypes] = useState<{ value: string; label: string }[]>([])
    const [form, setForm] = useState({
        warehouseId: '',
        code: '',
        name: '',
        strategyCode: 'CAPACITY_BASED',
        priority: 100,
        storageTypeId: '',
        enforceBinCapacity: true,
        isActive: true,
        notes: '',
    })

    const load = useCallback(async () => {
        setLoading(true)
        try {
            setRows(await warehouseRulesService.listPutaway())
        } catch (e: any) {
            pushToast('danger', 'Load failed', e?.response?.data?.message ?? e.message)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load()
    }, [load])

    const openCreate = async () => {
        const refs = await ensureRefs('warehouses')
        const wh = refs.warehouses ?? []
        setEditing(null)
        setForm({
            warehouseId: wh[0]?.value ?? '',
            code: '',
            name: '',
            strategyCode: 'CAPACITY_BASED',
            priority: 100,
            storageTypeId: '',
            enforceBinCapacity: true,
            isActive: true,
            notes: '',
        })
        setOpen(true)
    }

    const openEdit = async (row: PutawayRule) => {
        await ensureRefs('warehouses')
        const st = await storageTypeService.list({ warehouseId: row.warehouseId })
        const list = Array.isArray(st) ? st : (st?.data ?? [])
        setStorageTypes(list.map((t: any) => ({ value: t.id, label: t.code ?? t.name })))
        setEditing(row)
        setForm({
            warehouseId: row.warehouseId,
            code: row.code,
            name: row.name,
            strategyCode: row.strategyCode,
            priority: row.priority,
            storageTypeId: row.storageTypeId ?? '',
            enforceBinCapacity: row.enforceBinCapacity,
            isActive: row.isActive,
            notes: row.notes ?? '',
        })
        setOpen(true)
    }

    const onWarehouseChange = async (warehouseId: string) => {
        setForm((f) => ({ ...f, warehouseId, storageTypeId: '' }))
        if (!warehouseId) {
            setStorageTypes([])
            return
        }
        const st = await storageTypeService.list({ warehouseId })
        const list = Array.isArray(st) ? st : (st?.data ?? [])
        setStorageTypes(list.map((t: any) => ({ value: t.id, label: t.code ?? t.name })))
    }

    const save = async () => {
        if (!form.warehouseId || !form.code.trim() || !form.name.trim()) {
            pushToast('danger', 'Validation', 'Warehouse, code, and name are required')
            return
        }
        setBusy(true)
        try {
            const body = {
                ...form,
                storageTypeId: form.storageTypeId || undefined,
                notes: form.notes || undefined,
            }
            if (editing) {
                await warehouseRulesService.updatePutaway(editing.id, body)
                pushToast('success', 'Updated', 'Putaway rule saved')
            } else {
                await warehouseRulesService.createPutaway(body)
                pushToast('success', 'Created', 'Putaway rule registered')
            }
            setOpen(false)
            load()
        } catch (e: any) {
            pushToast('danger', 'Failed', e?.response?.data?.message ?? e.message)
        } finally {
            setBusy(false)
        }
    }

    const columns = useMemo<ColumnDef<PutawayRule>[]>(
        () => [
            { header: 'Code', accessorKey: 'code' },
            { header: 'Name', accessorKey: 'name' },
            {
                header: 'Warehouse',
                cell: ({ row }) => row.original.warehouse?.code ?? '—',
            },
            { header: 'Strategy', accessorKey: 'strategyCode' },
            { header: 'Priority', accessorKey: 'priority' },
            {
                header: 'Active',
                cell: ({ row }) => (
                    <StatusBadge tone={row.original.isActive ? 'success' : 'default'}>
                        {row.original.isActive ? 'Yes' : 'No'}
                    </StatusBadge>
                ),
            },
            {
                header: '',
                id: 'act',
                cell: ({ row }) => (
                    <div className="flex gap-2">
                        <Button size="xs" onClick={() => openEdit(row.original)}>
                            Edit
                        </Button>
                        <Button size="xs" onClick={() => setDeleteId(row.original.id)}>
                            Delete
                        </Button>
                    </div>
                ),
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbs} />
            <PageHeader
                title="Putaway Rules"
                description="ISO 9001 step 3: documented putaway strategies applied when recommending destination bins."
                actions={
                    <Button variant="solid" icon={<HiOutlinePlus />} onClick={openCreate}>
                        New rule
                    </Button>
                }
            />
            <AdaptiveCard>
                <DataTable columns={columns} data={rows} loading={loading} />
            </AdaptiveCard>

            <FormDialog
                isOpen={open}
                onClose={() => setOpen(false)}
                title={editing ? 'Edit putaway rule' : 'New putaway rule'}
                onSubmit={save}
                confirmLoading={busy}
            >
                <FormItem label="Warehouse">
                    <Select
                        options={warehouses}
                        value={warehouses.find((w) => w.value === form.warehouseId) ?? null}
                        onChange={(o: any) => onWarehouseChange(o?.value ?? '')}
                    />
                </FormItem>
                <FormItem label="Code">
                    <Input
                        value={form.code}
                        onChange={(e) => setForm({ ...form, code: e.target.value })}
                    />
                </FormItem>
                <FormItem label="Name">
                    <Input
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                </FormItem>
                <FormItem label="Strategy">
                    <Select
                        options={STRATEGY_OPTS}
                        value={
                            STRATEGY_OPTS.find((o) => o.value === form.strategyCode) ??
                            STRATEGY_OPTS[0]
                        }
                        onChange={(o: any) =>
                            setForm({ ...form, strategyCode: o?.value ?? 'CAPACITY_BASED' })
                        }
                    />
                </FormItem>
                <FormItem label="Priority (lower runs first)">
                    <Input
                        type="number"
                        value={form.priority}
                        onChange={(e) =>
                            setForm({ ...form, priority: Number(e.target.value) || 100 })
                        }
                    />
                </FormItem>
                <FormItem label="Storage type scope (optional)">
                    <Select
                        isClearable
                        options={storageTypes}
                        value={
                            storageTypes.find((o) => o.value === form.storageTypeId) ?? null
                        }
                        onChange={(o: any) =>
                            setForm({ ...form, storageTypeId: o?.value ?? '' })
                        }
                    />
                </FormItem>
                <label className="mb-3 flex items-center gap-2 text-sm">
                    <Switcher
                        checked={form.enforceBinCapacity}
                        onChange={(v) => setForm({ ...form, enforceBinCapacity: v })}
                    />
                    Enforce bin capacity limits
                </label>
                <label className="mb-3 flex items-center gap-2 text-sm">
                    <Switcher
                        checked={form.isActive}
                        onChange={(v) => setForm({ ...form, isActive: v })}
                    />
                    Active
                </label>
                <FormItem label="Notes">
                    <Input
                        textArea
                        rows={2}
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    />
                </FormItem>
            </FormDialog>

            <ConfirmDialog
                isOpen={!!deleteId}
                onClose={() => setDeleteId(null)}
                title="Delete putaway rule?"
                onConfirm={async () => {
                    if (!deleteId) return
                    try {
                        await warehouseRulesService.deletePutaway(deleteId)
                        pushToast('success', 'Deleted', 'Rule removed')
                        load()
                    } catch (e: any) {
                        pushToast('danger', 'Failed', e?.response?.data?.message ?? e.message)
                    } finally {
                        setDeleteId(null)
                    }
                }}
            />
        </PageContainer>
    )
}

export default PutawayRulesPage
