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
import Tabs from '@/components/ui/Tabs'
import { FormItem } from '@/components/ui/Form'
import { HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi'
import { planningService } from '../services/planningService'
import { materialService } from '../../material-master/services/materialService'
import { warehouseService } from '../../warehouse/services/warehouseService'
import { orgService } from '../../material-master/services/referenceService'
import type { ReorderRule, MaterialRequirement } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/planning-mrp/reorder-point'
type Opt = { value: string; label: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const ReorderPointPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [tab, setTab] = useState('rules')
    const [rules, setRules] = useState<ReorderRule[]>([])
    const [below, setBelow] = useState<MaterialRequirement[]>([])
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
        reorderPoint: 0,
        safetyStock: 0,
        reorderQuantity: 0,
        minimumOrderQuantity: 0,
        leadTimeDays: 0,
    })

    useEffect(() => {
        Promise.all([
            orgService.companies(),
            warehouseService.list({ limit: 200 }),
            materialService.list({ limit: 200 }),
        ]).then(([cos, wh, mats]: any[]) => {
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
    }, [])

    const load = useCallback(async () => {
        if (!companyId) return
        setLoading(true)
        try {
            const [r, req] = await Promise.all([
                planningService.listReorderRules({ companyId, limit: 100 }),
                planningService.listRequirements({
                    companyId,
                    belowReorderPoint: true,
                    limit: 100,
                }),
            ])
            setRules(r.data)
            setBelow(req.data)
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message || 'Load failed')
        } finally {
            setLoading(false)
        }
    }, [companyId])

    useEffect(() => {
        load()
    }, [load])

    const ruleCols: ColumnDef<ReorderRule>[] = useMemo(
        () => [
            {
                id: 'material',
                header: 'Material',
                cell: ({ row }) => row.original.material?.materialCode ?? '—',
            },
            {
                id: 'warehouse',
                header: 'Warehouse',
                cell: ({ row }) => row.original.warehouse?.code ?? 'Company default',
            },
            {
                id: 'reorderPoint',
                header: 'ROP',
                cell: ({ row }) => Number(row.original.reorderPoint),
            },
            {
                id: 'safetyStock',
                header: 'Safety',
                cell: ({ row }) => Number(row.original.safetyStock),
            },
            {
                id: 'reorderQuantity',
                header: 'Reorder qty',
                cell: ({ row }) => Number(row.original.reorderQuantity),
            },
            {
                id: 'minimumOrderQuantity',
                header: 'MOQ',
                cell: ({ row }) => Number(row.original.minimumOrderQuantity),
            },
            {
                id: 'leadTimeDays',
                header: 'Lead (d)',
                accessorKey: 'leadTimeDays',
            },
            {
                id: 'isActive',
                header: 'Active',
                cell: ({ row }) => (
                    <StatusBadge tone={row.original.isActive ? 'success' : 'default'}>
                        {row.original.isActive ? 'Active' : 'Inactive'}
                    </StatusBadge>
                ),
            },
            {
                id: 'actions',
                header: '',
                enableSorting: false,
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

    const belowCols: ColumnDef<MaterialRequirement>[] = useMemo(
        () => [
            {
                id: 'material',
                header: 'Material',
                cell: ({ row }) => row.original.material?.materialCode ?? '—',
            },
            {
                id: 'warehouse',
                header: 'Warehouse',
                cell: ({ row }) => row.original.warehouse?.code ?? '—',
            },
            {
                id: 'availableQty',
                header: 'Available',
                cell: ({ row }) => Number(row.original.availableQty),
            },
            {
                id: 'reorderPoint',
                header: 'ROP',
                cell: ({ row }) => Number(row.original.reorderPoint),
            },
            {
                id: 'recommendedQty',
                header: 'Recommended',
                cell: ({ row }) => Number(row.original.recommendedQty),
            },
        ],
        [],
    )

    const submit = async () => {
        if (!form.materialId) {
            pushToast('danger', 'Validation', 'Material required')
            return
        }
        setSubmitting(true)
        try {
            await planningService.createReorderRule({
                companyId,
                ...form,
                warehouseId: form.warehouseId || undefined,
            })
            pushToast('success', 'Created', 'Reorder rule saved')
            setOpen(false)
            load()
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message || 'Create failed')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Reorder Point"
                description="Warehouse overrides and materials at or below ROP"
                actions={
                    <Button
                        variant="solid"
                        icon={<HiOutlinePlus />}
                        onClick={() => setOpen(true)}
                    >
                        Add Rule
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
                <Tabs value={tab} onChange={(v) => setTab(v)}>
                    <Tabs.TabList>
                        <Tabs.TabNav value="rules">Reorder Rules</Tabs.TabNav>
                        <Tabs.TabNav value="below">Below ROP</Tabs.TabNav>
                    </Tabs.TabList>
                    <Tabs.TabContent value="rules">
                        <DataTable
                            columns={ruleCols}
                            data={rules}
                            loading={loading}
                        />
                    </Tabs.TabContent>
                    <Tabs.TabContent value="below">
                        <DataTable
                            columns={belowCols}
                            data={below}
                            loading={loading}
                        />
                    </Tabs.TabContent>
                </Tabs>
            </AdaptiveCard>

            <FormDialog
                isOpen={open}
                onClose={() => setOpen(false)}
                title="Reorder Rule"
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
                                setForm((f) => ({
                                    ...f,
                                    materialId: o?.value || '',
                                }))
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
                    {(
                        [
                            ['reorderPoint', 'Reorder point'],
                            ['safetyStock', 'Safety stock'],
                            ['reorderQuantity', 'Reorder quantity'],
                            ['minimumOrderQuantity', 'MOQ'],
                            ['leadTimeDays', 'Lead time (days)'],
                        ] as const
                    ).map(([key, label]) => (
                        <FormItem key={key} label={label}>
                            <Input
                                type="number"
                                min={0}
                                value={form[key]}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        [key]: Number(e.target.value),
                                    }))
                                }
                            />
                        </FormItem>
                    ))}
                </div>
            </FormDialog>

            <ConfirmDialog
                isOpen={!!deleteId}
                type="danger"
                title="Delete rule?"
                onCancel={() => setDeleteId(null)}
                onConfirm={async () => {
                    if (!deleteId) return
                    await planningService.deleteReorderRule(deleteId)
                    setDeleteId(null)
                    load()
                }}
            >
                <p>Remove this reorder rule override.</p>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default ReorderPointPage
