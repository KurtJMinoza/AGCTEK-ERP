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
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi'
import { planningService } from '../services/planningService'
import { materialService } from '../../material-master/services/materialService'
import { warehouseService } from '../../warehouse/services/warehouseService'
import { orgService } from '../../material-master/services/referenceService'
import type { PlanningDemand } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/planning-mrp/demand'
type Opt = { value: string; label: string }

const SOURCE_OPTS = [
    { value: 'SALES', label: 'Sales' },
    { value: 'PRODUCTION', label: 'Production' },
    { value: 'MAINTENANCE', label: 'Maintenance' },
    { value: 'PROJECTS', label: 'Projects' },
    { value: 'MANUAL_INTERNAL', label: 'Manual Internal Request' },
    { value: 'FORECAST', label: 'Forecast' },
]

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const DemandPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<PlanningDemand[]>([])
    const [loading, setLoading] = useState(true)
    const [companies, setCompanies] = useState<Opt[]>([])
    const [warehouses, setWarehouses] = useState<Opt[]>([])
    const [materials, setMaterials] = useState<Opt[]>([])
    const [companyId, setCompanyId] = useState('')
    const [open, setOpen] = useState(false)
    const [deleteId, setDeleteId] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [form, setForm] = useState({
        materialId: '',
        warehouseId: '',
        demandDate: new Date().toISOString().slice(0, 10),
        quantity: 1,
        sourceType: 'MANUAL_INTERNAL',
        remarks: '',
    })

    useEffect(() => {
        Promise.all([
            orgService.companies(),
            warehouseService.list({ limit: 200 }),
            materialService.list({ limit: 200 }),
        ])
            .then(([cos, wh, mats]: any[]) => {
                const c = (Array.isArray(cos) ? cos : cos?.data ?? []).map(
                    (x: any) => ({ value: x.id, label: x.name || x.code }),
                )
                setCompanies(c)
                setWarehouses(
                    (wh?.data ?? []).map((x: any) => ({
                        value: x.id,
                        label: `${x.code} — ${x.name}`,
                    })),
                )
                setMaterials(
                    (mats?.data ?? mats ?? []).map((x: any) => ({
                        value: x.id,
                        label: `${x.materialCode} — ${x.materialName}`,
                    })),
                )
                if (c[0]) setCompanyId(c[0].value)
            })
            .catch(() => pushToast('danger', 'Error', 'Failed to load filters'))
    }, [])

    const load = useCallback(async () => {
        if (!companyId) return
        setLoading(true)
        try {
            const res = await planningService.listDemand({
                companyId,
                limit: 100,
            })
            setRows(res.data)
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message || 'Load failed')
        } finally {
            setLoading(false)
        }
    }, [companyId])

    useEffect(() => {
        load()
    }, [load])

    const columns: ColumnDef<PlanningDemand>[] = useMemo(
        () => [
            {
                header: 'Material',
                cell: ({ row }) =>
                    row.original.material
                        ? `${row.original.material.materialCode}`
                        : row.original.materialId,
            },
            {
                header: 'Name',
                cell: ({ row }) => row.original.material?.materialName ?? '—',
            },
            {
                header: 'Warehouse',
                cell: ({ row }) =>
                    row.original.warehouse?.code ?? 'All / unscoped',
            },
            {
                header: 'Date',
                cell: ({ row }) =>
                    String(row.original.demandDate).slice(0, 10),
            },
            {
                header: 'Qty',
                cell: ({ row }) => Number(row.original.quantity),
            },
            {
                header: 'Source',
                cell: ({ row }) => (
                    <StatusBadge status={row.original.sourceType} />
                ),
            },
            {
                header: 'Actions',
                cell: ({ row }) => (
                    <Button
                        size="xs"
                        variant="plain"
                        icon={<HiOutlineTrash />}
                        onClick={() => setDeleteId(row.original.id)}
                    />
                ),
            },
        ],
        [],
    )

    const submit = async () => {
        if (!companyId || !form.materialId) {
            pushToast('danger', 'Validation', 'Company and material required')
            return
        }
        setSubmitting(true)
        try {
            await planningService.createDemand({
                companyId,
                materialId: form.materialId,
                warehouseId: form.warehouseId || undefined,
                demandDate: form.demandDate,
                quantity: Number(form.quantity),
                sourceType: form.sourceType,
                remarks: form.remarks || undefined,
            })
            pushToast('success', 'Created', 'Demand entry saved')
            setOpen(false)
            load()
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message || 'Create failed')
        } finally {
            setSubmitting(false)
        }
    }

    const confirmDelete = async () => {
        if (!deleteId) return
        try {
            await planningService.deleteDemand(deleteId)
            pushToast('success', 'Deleted', 'Demand removed')
            setDeleteId(null)
            load()
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message || 'Delete failed')
        }
    }

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Planning Demand"
                description="Manual / forecast demand that feeds MRP netting"
                actions={
                    <Button
                        variant="solid"
                        icon={<HiOutlinePlus />}
                        onClick={() => setOpen(true)}
                    >
                        Add Demand
                    </Button>
                }
            />
            <AdaptiveCard className="mb-4">
                <FormItem label="Company">
                    <Select
                        options={companies}
                        value={companies.find((o) => o.value === companyId)}
                        onChange={(o: any) => setCompanyId(o?.value || '')}
                    />
                </FormItem>
            </AdaptiveCard>
            <AdaptiveCard>
                <DataTable columns={columns} data={rows} loading={loading} />
            </AdaptiveCard>

            <FormDialog
                isOpen={open}
                onClose={() => setOpen(false)}
                title="Add Planning Demand"
                footer={
                    <>
                        <Button size="sm" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            loading={submitting}
                            onClick={submit}
                        >
                            Save
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <FormItem label="Material">
                        <Select
                            options={materials}
                            value={materials.find((o) => o.value === form.materialId)}
                            onChange={(o: any) =>
                                setForm((f) => ({ ...f, materialId: o?.value || '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Warehouse (optional)">
                        <Select
                            isClearable
                            options={warehouses}
                            value={
                                warehouses.find((o) => o.value === form.warehouseId) ||
                                null
                            }
                            onChange={(o: any) =>
                                setForm((f) => ({
                                    ...f,
                                    warehouseId: o?.value || '',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Demand Date">
                        <Input
                            type="date"
                            value={form.demandDate}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    demandDate: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Quantity">
                        <Input
                            type="number"
                            min={0.0001}
                            value={form.quantity}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    quantity: Number(e.target.value),
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Source">
                        <Select
                            options={SOURCE_OPTS}
                            value={SOURCE_OPTS.find((o) => o.value === form.sourceType)}
                            onChange={(o: any) =>
                                setForm((f) => ({
                                    ...f,
                                    sourceType: o?.value || 'MANUAL',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Remarks">
                        <Input
                            value={form.remarks}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, remarks: e.target.value }))
                            }
                        />
                    </FormItem>
                </div>
            </FormDialog>

            <ConfirmDialog
                isOpen={!!deleteId}
                type="danger"
                title="Delete demand?"
                onCancel={() => setDeleteId(null)}
                onConfirm={confirmDelete}
            >
                <p>This planning demand entry will be removed.</p>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default DemandPage
