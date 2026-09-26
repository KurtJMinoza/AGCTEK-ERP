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
import Checkbox from '@/components/ui/Checkbox'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash } from 'react-icons/hi'
import {
    qualityService,
    type MmInspectionRule,
    type InspectionRulePayload,
} from '../services/qualityService'
import { useLazyMmRefs } from '@/modules/mm/shared/useLazyMmRefs'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/receiving/inspection-rules'

const ACTION_OPTIONS = [
    { value: 'NO_INSPECTION', label: 'No inspection' },
    { value: 'INSPECTION_REQUIRED', label: 'Inspection required' },
    { value: 'FULL_INSPECTION', label: 'Full inspection' },
    { value: 'SAMPLE_INSPECTION', label: 'Sample inspection' },
]

const PURCHASE_TYPE_OPTIONS = [
    { value: '', label: 'Any purchase type' },
    { value: 'PO', label: 'PO' },
    { value: 'CONTRACT', label: 'Contract PO' },
    { value: 'NON_PO', label: 'Non-PO' },
]

const RECEIPT_TYPE_OPTIONS = [
    { value: '', label: 'Any receipt type' },
    { value: 'PO', label: 'PO receipt' },
    { value: 'ASN', label: 'ASN receipt' },
    { value: 'DIRECT', label: 'Direct receipt' },
]

type Opt = { value: string; label: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const emptyForm = (): InspectionRulePayload => ({
    companyId: '',
    ruleCode: '',
    name: '',
    priority: 0,
    active: true,
    action: 'INSPECTION_REQUIRED',
})

export default function InspectionRulesPage() {
    const [rows, setRows] = useState<MmInspectionRule[]>([])
    const [loading, setLoading] = useState(true)
    const [companyId, setCompanyId] = useState('')
    const [formOpen, setFormOpen] = useState(false)
    const [editing, setEditing] = useState<MmInspectionRule | null>(null)
    const [form, setForm] = useState<InspectionRulePayload>(emptyForm())
    const [submitting, setSubmitting] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<MmInspectionRule | null>(null)

    const { ensure, companies, warehouses, materials, suppliers, loading: refsLoading } =
        useLazyMmRefs()

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await qualityService.listRules({
                companyId: companyId || undefined,
                pageSize: 100,
            })
            setRows(res.data ?? [])
        } finally {
            setLoading(false)
        }
    }, [companyId])

    useEffect(() => {
        load()
    }, [load])

    useEffect(() => {
        if (!companyId && companies[0]) setCompanyId(companies[0].value)
    }, [companies, companyId])

    useEffect(() => {
        const t = window.setTimeout(() => void ensure('companies'), 0)
        return () => window.clearTimeout(t)
    }, [ensure])

    const openCreate = useCallback(async () => {
        await ensure('companies', 'warehouses', 'materials', 'suppliers')
        setEditing(null)
        setForm({ ...emptyForm(), companyId: companyId || companies[0]?.value || '' })
        setFormOpen(true)
    }, [ensure, companyId, companies])

    const openEdit = useCallback(
        async (row: MmInspectionRule) => {
            await ensure('companies', 'warehouses', 'materials', 'suppliers')
            setEditing(row)
            setForm({
                companyId: row.companyId,
                ruleCode: row.ruleCode,
                name: row.name,
                priority: row.priority,
                active: row.active,
                action: row.action,
                effectiveFrom: row.effectiveFrom?.slice(0, 10),
                effectiveTo: row.effectiveTo?.slice(0, 10),
                materialId: row.materialId ?? '',
                materialCategoryId: row.materialCategoryId ?? '',
                supplierId: row.supplierId ?? '',
                supplierCategoryId: row.supplierCategoryId ?? '',
                plantId: row.plantId ?? '',
                warehouseId: row.warehouseId ?? '',
                purchaseType: row.purchaseType ?? '',
                receiptType: row.receiptType ?? '',
            })
            setFormOpen(true)
        },
        [ensure],
    )

    const handleSave = async () => {
        if (!form.companyId || !form.ruleCode || !form.name || !form.action) {
            pushToast('danger', 'Validation', 'Company, rule code, name, and action are required')
            return
        }
        setSubmitting(true)
        try {
            const payload = {
                ...form,
                materialId: form.materialId || undefined,
                materialCategoryId: form.materialCategoryId || undefined,
                supplierId: form.supplierId || undefined,
                supplierCategoryId: form.supplierCategoryId || undefined,
                plantId: form.plantId || undefined,
                warehouseId: form.warehouseId || undefined,
                purchaseType: form.purchaseType || undefined,
                receiptType: form.receiptType || undefined,
                effectiveFrom: form.effectiveFrom || undefined,
                effectiveTo: form.effectiveTo || undefined,
            }
            if (editing) {
                await qualityService.updateRule(editing.id, payload)
                pushToast('success', 'Updated', 'Inspection rule updated')
            } else {
                await qualityService.createRule(payload)
                pushToast('success', 'Created', 'Inspection rule created')
            }
            setFormOpen(false)
            load()
        } catch (e: any) {
            pushToast('danger', 'Failed', e?.response?.data?.message ?? e.message)
        } finally {
            setSubmitting(false)
        }
    }

    const confirmDelete = async () => {
        if (!deleteTarget) return
        try {
            await qualityService.deleteRule(deleteTarget.id)
            pushToast('success', 'Deactivated', 'Inspection rule deactivated')
            setDeleteTarget(null)
            load()
        } catch (e: any) {
            pushToast('danger', 'Failed', e?.response?.data?.message ?? e.message)
        }
    }

    const columns: ColumnDef<MmInspectionRule>[] = useMemo(
        () => [
            { header: 'Code', accessorKey: 'ruleCode' },
            { header: 'Name', accessorKey: 'name' },
            { header: 'Priority', accessorKey: 'priority' },
            { header: 'Action', accessorKey: 'action' },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <StatusBadge tone={row.original.active ? 'success' : 'default'}>
                        {row.original.active ? 'Active' : 'Inactive'}
                    </StatusBadge>
                ),
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) => (
                    <div className="flex gap-1">
                        <Button
                            size="xs"
                            variant="plain"
                            icon={<HiOutlinePencil />}
                            onClick={() => openEdit(row.original)}
                        />
                        <Button
                            size="xs"
                            variant="plain"
                            icon={<HiOutlineTrash />}
                            onClick={() => setDeleteTarget(row.original)}
                        />
                    </div>
                ),
            },
        ],
        [openEdit],
    )

    const withEmpty = (opts: Opt[], label: string) => [{ value: '', label }, ...opts]

    return (
        <PageContainer>
            <Breadcrumb items={buildErpBreadcrumbs(ROUTE)} />
            <PageHeader
                title="Inspection rules"
                description="Configure when receiving requires quality inspection. Higher priority rules win."
                actions={
                    <Button
                        variant="solid"
                        icon={<HiOutlinePlus />}
                        loading={refsLoading}
                        onClick={openCreate}
                    >
                        New rule
                    </Button>
                }
            />

            <AdaptiveCard className="mb-4">
                <FormItem label="Company filter">
                    <Select<Opt>
                        options={companies}
                        value={companies.find((c) => c.value === companyId) ?? null}
                        onChange={(o) => setCompanyId(o?.value ?? '')}
                    />
                </FormItem>
            </AdaptiveCard>

            <AdaptiveCard>
                <DataTable columns={columns} data={rows} loading={loading} />
            </AdaptiveCard>

            <FormDialog
                isOpen={formOpen}
                onClose={() => setFormOpen(false)}
                title={editing ? 'Edit inspection rule' : 'New inspection rule'}
                width={720}
                footer={
                    <>
                        <Button size="sm" onClick={() => setFormOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            loading={submitting}
                            onClick={handleSave}
                        >
                            Save
                        </Button>
                    </>
                }
            >
                <div className="grid gap-3 md:grid-cols-2">
                    <FormItem label="Company">
                        <Select<Opt>
                            options={companies}
                            value={companies.find((c) => c.value === form.companyId) ?? null}
                            onChange={(o) => setForm((f) => ({ ...f, companyId: o?.value ?? '' }))}
                        />
                    </FormItem>
                    <FormItem label="Rule code">
                        <Input
                            value={form.ruleCode}
                            disabled={!!editing}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, ruleCode: e.target.value.toUpperCase() }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Name" className="md:col-span-2">
                        <Input
                            value={form.name}
                            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        />
                    </FormItem>
                    <FormItem label="Priority">
                        <Input
                            type="number"
                            value={String(form.priority ?? 0)}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, priority: Number(e.target.value) || 0 }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Action">
                        <Select<Opt>
                            options={ACTION_OPTIONS}
                            value={ACTION_OPTIONS.find((o) => o.value === form.action) ?? null}
                            onChange={(o) =>
                                setForm((f) => ({ ...f, action: o?.value ?? 'INSPECTION_REQUIRED' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Effective from">
                        <Input
                            type="date"
                            value={form.effectiveFrom ?? ''}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, effectiveFrom: e.target.value }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Effective to">
                        <Input
                            type="date"
                            value={form.effectiveTo ?? ''}
                            onChange={(e) => setForm((f) => ({ ...f, effectiveTo: e.target.value }))}
                        />
                    </FormItem>
                    <FormItem label="Material">
                        <Select<Opt>
                            isClearable
                            options={withEmpty(materials, 'Any material')}
                            value={
                                withEmpty(materials, 'Any material').find(
                                    (o) => o.value === form.materialId,
                                ) ?? withEmpty(materials, 'Any material')[0]
                            }
                            onChange={(o) =>
                                setForm((f) => ({ ...f, materialId: o?.value ?? '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Warehouse">
                        <Select<Opt>
                            isClearable
                            options={withEmpty(warehouses, 'Any warehouse')}
                            value={
                                withEmpty(warehouses, 'Any warehouse').find(
                                    (o) => o.value === form.warehouseId,
                                ) ?? withEmpty(warehouses, 'Any warehouse')[0]
                            }
                            onChange={(o) =>
                                setForm((f) => ({ ...f, warehouseId: o?.value ?? '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Supplier">
                        <Select<Opt>
                            isClearable
                            options={withEmpty(suppliers, 'Any supplier')}
                            value={
                                withEmpty(suppliers, 'Any supplier').find(
                                    (o) => o.value === form.supplierId,
                                ) ?? withEmpty(suppliers, 'Any supplier')[0]
                            }
                            onChange={(o) =>
                                setForm((f) => ({ ...f, supplierId: o?.value ?? '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Purchase type">
                        <Select<Opt>
                            options={PURCHASE_TYPE_OPTIONS}
                            value={
                                PURCHASE_TYPE_OPTIONS.find((o) => o.value === form.purchaseType) ??
                                PURCHASE_TYPE_OPTIONS[0]
                            }
                            onChange={(o) =>
                                setForm((f) => ({ ...f, purchaseType: o?.value ?? '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Receipt type">
                        <Select<Opt>
                            options={RECEIPT_TYPE_OPTIONS}
                            value={
                                RECEIPT_TYPE_OPTIONS.find((o) => o.value === form.receiptType) ??
                                RECEIPT_TYPE_OPTIONS[0]
                            }
                            onChange={(o) =>
                                setForm((f) => ({ ...f, receiptType: o?.value ?? '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Active">
                        <Checkbox
                            checked={form.active ?? true}
                            onChange={(checked) => setForm((f) => ({ ...f, active: checked }))}
                        >
                            Rule is active
                        </Checkbox>
                    </FormItem>
                </div>
            </FormDialog>

            <ConfirmDialog
                isOpen={!!deleteTarget}
                type="danger"
                title="Deactivate rule?"
                onClose={() => setDeleteTarget(null)}
                onRequestClose={() => setDeleteTarget(null)}
                onCancel={() => setDeleteTarget(null)}
                onConfirm={confirmDelete}
            >
                <p>
                    Deactivate rule <strong>{deleteTarget?.ruleCode}</strong>? Existing matches
                    will no longer apply.
                </p>
            </ConfirmDialog>
        </PageContainer>
    )
}
