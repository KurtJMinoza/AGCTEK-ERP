'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import ValuationResponsiveTable, {
    type ColumnDef,
} from '../components/ValuationResponsiveTable'
import {
    ValMaterialCell,
    ValMethodTag,
    ValMoneyCell,
    ValPlainCell,
} from '../components/valuationTableUi'
import { valuationParentBreadcrumbs } from '../utils/valuationPageUi'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlinePlus } from 'react-icons/hi'
import { valuationService } from '../services/valuationService'
import { useLazyMmRefs } from '@/modules/mm/shared/useLazyMmRefs'
import type { MaterialValuation } from '../types'
import { useMaterialOptions } from '@/modules/mm/shared/useEntityOptions'

const ROUTE = '/modules/mm/valuation/standard-cost'

const METHOD_OPTS = [
    { value: 'STANDARD_COST', label: 'Standard Cost' },
    { value: 'MOVING_AVERAGE', label: 'Moving Average' },
    { value: 'FIFO', label: 'FIFO' },
]

const StandardCostPage = () => {
    const parentBreadcrumbs = valuationParentBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<MaterialValuation[]>([])
    const [loading, setLoading] = useState(false)
    const { ensure: ensureFormRefs, companies, warehouses } = useLazyMmRefs()
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
    }, [load])

    const openCreate = useCallback(async () => {
        const refs = await ensureFormRefs('companies', 'warehouses')
        const c = refs.companies ?? []
        setForm((f) => ({ ...f, companyId: c[0]?.value || '' }))
        setOpen(true)
    }, [ensureFormRefs])

    const columns: ColumnDef<MaterialValuation>[] = useMemo(
        () => [
            {
                header: 'Material',
                cell: ({ row }) => (
                    <ValMaterialCell
                        code={row.original.material?.materialCode ?? row.original.materialId}
                        name={row.original.material?.materialName}
                    />
                ),
            },
            {
                header: 'Warehouse',
                cell: ({ row }) => (
                    <ValPlainCell>
                        {row.original.warehouse?.name || row.original.warehouseId}
                    </ValPlainCell>
                ),
            },
            {
                header: 'Method',
                cell: ({ row }) => (
                    <ValMethodTag method={row.original.valuationMethod} />
                ),
            },
            {
                header: 'Standard cost',
                cell: ({ row }) => <ValMoneyCell amount={row.original.standardCost} />,
            },
            {
                header: 'Revision',
                cell: ({ row }) => (
                    <ValPlainCell mono>{String(row.original.revision)}</ValPlainCell>
                ),
            },
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
            <PageHeader
                title="Standard Cost"
                description="Maintain standard costs and revisions by valuation area"
                breadcrumbs={parentBreadcrumbs}
                actions={
                    <Button
                        variant="solid"
                        icon={<HiOutlinePlus />}
                        onClick={openCreate}
                    >
                        Upsert Valuation
                    </Button>
                }
            />
            <AdaptiveCard>
                <ValuationResponsiveTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    getRowId={(row) => row.id}
                    tableMinWidthClass="min-w-[920px]"
                />
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
