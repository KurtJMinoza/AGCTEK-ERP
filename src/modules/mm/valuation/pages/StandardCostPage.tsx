'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlinePlus } from 'react-icons/hi'
import { valuationService } from '../services/valuationService'
import { warehouseService } from '../../warehouse/services/warehouseService'
import { orgService } from '../../material-master/services/referenceService'
import type { MaterialValuation } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { useMaterialOptions } from '@/modules/mm/shared/useEntityOptions'

const ROUTE = '/modules/mm/valuation/standard-cost'
type Opt = { value: string; label: string }

const METHOD_OPTS = [
    { value: 'STANDARD_COST', label: 'Standard Cost' },
    { value: 'MOVING_AVERAGE', label: 'Moving Average' },
    { value: 'FIFO', label: 'FIFO' },
]

const StandardCostPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<MaterialValuation[]>([])
    const [loading, setLoading] = useState(false)
    const [companies, setCompanies] = useState<Opt[]>([])
    const [warehouses, setWarehouses] = useState<Opt[]>([])
    const [open, setOpen] = useState(false)
    const [reviseOpen, setReviseOpen] = useState(false)
    const [selected, setSelected] = useState<MaterialValuation | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [form, setForm] = useState({
        companyId: '',
        warehouseId: '',
        materialId: '',
        valuationMethod: 'STANDARD_COST',
        standardCost: 0,
    })
    const [reviseCost, setReviseCost] = useState(0)
    const { options: materialOpts } = useMaterialOptions({ enabled: open })

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await valuationService.listMaterialValuations({
                valuationMethod: 'STANDARD_COST',
                limit: 100,
            })
            // Also show all so users can convert
            const all = await valuationService.listMaterialValuations({ limit: 100 })
            setRows(all.data)
        } catch (e: any) {
            toast.push(
                <Notification type="danger" title="Error" closable>
                    {e?.response?.data?.message || 'Load failed'}
                </Notification>,
            )
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load()
        Promise.all([
            orgService.companies(),
            warehouseService.list({ limit: 200 }),
        ]).then(([cos, wh]: any[]) => {
            setCompanies(
                (Array.isArray(cos) ? cos : cos?.data ?? []).map((c: any) => ({
                    value: c.id,
                    label: c.name || c.code,
                })),
            )
            setWarehouses(
                (wh?.data ?? []).map((w: any) => ({
                    value: w.id,
                    label: `${w.code} — ${w.name}`,
                })),
            )
        })
    }, [load])

    const columns: ColumnDef<MaterialValuation>[] = useMemo(
        () => [
            {
                header: 'Material',
                cell: ({ row }) =>
                    row.original.material?.materialCode || row.original.materialId,
            },
            {
                header: 'Warehouse',
                cell: ({ row }) =>
                    row.original.warehouse?.name || row.original.warehouseId,
            },
            { header: 'Method', accessorKey: 'valuationMethod' },
            { header: 'Standard Cost', accessorKey: 'standardCost' },
            { header: 'Revision', accessorKey: 'revision' },
            {
                header: 'Actions',
                cell: ({ row }) => (
                    <Button
                        size="xs"
                        onClick={() => {
                            setSelected(row.original)
                            setReviseCost(Number(row.original.standardCost))
                            setReviseOpen(true)
                        }}
                    >
                        Revise
                    </Button>
                ),
            },
        ],
        [],
    )

    const submitUpsert = async () => {
        setSubmitting(true)
        try {
            await valuationService.upsertMaterialValuation(form)
            setOpen(false)
            await load()
            toast.push(
                <Notification type="success" title="Saved" closable>
                    Material valuation saved
                </Notification>,
            )
        } catch (e: any) {
            toast.push(
                <Notification type="danger" title="Error" closable>
                    {e?.response?.data?.message || 'Save failed'}
                </Notification>,
            )
        } finally {
            setSubmitting(false)
        }
    }

    const submitRevise = async () => {
        if (!selected) return
        setSubmitting(true)
        try {
            await valuationService.reviseStandard(selected.id, {
                standardCost: reviseCost,
            })
            setReviseOpen(false)
            await load()
            toast.push(
                <Notification type="success" title="Revised" closable>
                    Standard cost revision recorded
                </Notification>,
            )
        } catch (e: any) {
            toast.push(
                <Notification type="danger" title="Error" closable>
                    {e?.response?.data?.message || 'Revise failed'}
                </Notification>,
            )
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Standard Cost"
                description="Maintain standard costs and revisions by valuation area"
                
                actions={
                    <Button
                        variant="solid"
                        icon={<HiOutlinePlus />}
                        onClick={() => setOpen(true)}
                    >
                        Upsert Valuation
                    </Button>
                }
            />
            <AdaptiveCard>
                <DataTable columns={columns} data={rows} loading={loading} />
            </AdaptiveCard>

            <FormDialog
                isOpen={open}
                onClose={() => setOpen(false)}
                title="Material Valuation"
                footer={
                    <>
                        <Button size="sm" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            loading={submitting}
                            onClick={submitUpsert}
                        >
                            Save
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <FormItem label="Company">
                        <Select
                            options={companies}
                            value={companies.find((o) => o.value === form.companyId)}
                            onChange={(o: any) =>
                                setForm((f) => ({ ...f, companyId: o?.value || '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Warehouse">
                        <Select
                            options={warehouses}
                            value={warehouses.find((o) => o.value === form.warehouseId)}
                            onChange={(o: any) =>
                                setForm((f) => ({ ...f, warehouseId: o?.value || '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Material">
                        <Select
                            isSearchable
                            placeholder="Search material code or name…"
                            options={materialOpts}
                            value={materialOpts.find((o) => o.value === form.materialId) ?? null}
                            onChange={(o: any) => {
                                const mid = o?.value || ''
                                setForm((f) => ({ ...f, materialId: mid }))
                                const hit = rows.find(
                                    (r) =>
                                        r.materialId === mid &&
                                        (!form.companyId || r.companyId === form.companyId) &&
                                        (!form.warehouseId || r.warehouseId === form.warehouseId),
                                )
                                if (hit) {
                                    setForm((f) => ({
                                        ...f,
                                        materialId: mid,
                                        companyId: hit.companyId || f.companyId,
                                        warehouseId: hit.warehouseId || f.warehouseId,
                                        valuationMethod: hit.valuationMethod || f.valuationMethod,
                                        standardCost: Number(hit.standardCost ?? hit.movingAverageCost ?? 0),
                                    }))
                                }
                            }}
                        />
                    </FormItem>
                    <FormItem label="Method">
                        <Select
                            options={METHOD_OPTS}
                            value={METHOD_OPTS.find(
                                (o) => o.value === form.valuationMethod,
                            )}
                            onChange={(o: any) =>
                                setForm((f) => ({
                                    ...f,
                                    valuationMethod: o?.value || 'STANDARD_COST',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Standard Cost">
                        <Input
                            type="number"
                            value={form.standardCost}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    standardCost: Number(e.target.value),
                                }))
                            }
                        />
                    </FormItem>
                </div>
            </FormDialog>

            <FormDialog
                isOpen={reviseOpen}
                onClose={() => setReviseOpen(false)}
                title="Revise Standard Cost"
                footer={
                    <>
                        <Button size="sm" onClick={() => setReviseOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            loading={submitting}
                            onClick={submitRevise}
                        >
                            Revise
                        </Button>
                    </>
                }
            >
                <FormItem label="New Standard Cost">
                    <Input
                        type="number"
                        value={reviseCost}
                        onChange={(e) => setReviseCost(Number(e.target.value))}
                    />
                </FormItem>
            </FormDialog>
        </PageContainer>
    )
}

export default StandardCostPage
